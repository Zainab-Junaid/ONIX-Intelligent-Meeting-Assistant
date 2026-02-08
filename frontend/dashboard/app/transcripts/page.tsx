"use client"

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/components/auth-provider'
import { AppShell } from "@/components/app-shell"
import { useSearchParams } from 'next/navigation'
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useExtensionMeetings } from '@/hooks/use-extension-meetings'
import { SpeakerTranscript } from '@/components/speaker-transcript'
import { io, Socket } from 'socket.io-client'

type MeetingDoc = {
  id: string
  title: string
  transcript: string
  createdAt: Date | null
  duration?: string
  meetingURL?: string
}

export default function Page() {
  const { authUser, isLoading } = useAuth()
  const [segments, setSegments] = useState<Array<{ speaker: string; text: string; start?: number; end?: number }>>([])
  const [summaryText, setSummaryText] = useState<string>("")
  const [actionItems, setActionItems] = useState<Array<{ id: string; text: string; assignedTo?: string; dueDate?: any }>>([])
  const searchParams = useSearchParams()
  const meetingId = searchParams.get('id')
  const botId = searchParams.get('botId')
  const extensionId = searchParams.get('extensionId')

  // Bot meetings hook
  const { meetings: botMeetings, loading: botLoading } = useBotMeetings()

  // Extension meetings hook
  const { meetings: extensionMeetings, loading: extensionLoading } = useExtensionMeetings()

  // Debug logging
  console.log('Transcripts - Bot meetings:', botMeetings);
  console.log('Transcripts - Extension meetings:', extensionMeetings);

  // Socket.IO connection for real-time transcript updates
  const socketRef = useRef<Socket | null>(null)

  // Real-time segments for bot meeting view (must be at top level, before any returns)
  const [liveSegments, setLiveSegments] = useState<Array<{ speaker: string; text: string; start?: number; end?: number }>>([])
  const botMeetingSocketRef = useRef<Socket | null>(null)

  // Stream segments and load summary/action items for a specific meeting
  useEffect(() => {
    if (!meetingId) return

    // Initial load from API
    const loadInitialData = async () => {
      try {
        const meetingsRes = await fetch('/api/meeting-bot/meetings')
        const meetings: any[] = await meetingsRes.json()
        const mtg = meetings.find(r => r.meetingId === meetingId)
        if (mtg) {
          setSegments(Array.isArray(mtg.segments) ? mtg.segments : [])
        }

        const summariesRes = await fetch('/api/meeting-bot/summaries')
        const summaries: any[] = await summariesRes.json()
        const s = summaries.find(r => r.meetingId === meetingId)
        setSummaryText(s?.summaryText || '')
      } catch (err) {
        console.error('Failed to load initial data:', err)
        setSegments([])
        setSummaryText('')
      }
    }

    loadInitialData()

    // Connect to Socket.IO for real-time updates
    const socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001', {
      transports: ['websocket', 'polling'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('✅ Connected to Socket.IO server')
      // Join the meeting room to receive updates
      socket.emit('join_meeting', meetingId)
    })

    socket.on('joined_meeting', (data) => {
      console.log('✅ Joined meeting room:', data.meetingId)
    })

    // Listen for real-time transcript updates
    socket.on('transcript_update', (data: { meetingId: string; segments: any[]; timestamp: string }) => {
      if (data.meetingId === meetingId) {
        console.log('📝 Received real-time transcript update:', data.segments.length, 'segments')
        // Update segments with new data (merge with existing to avoid duplicates)
        setSegments(prevSegments => {
          const segmentMap = new Map<string, any>()

          // Add existing segments to map
          prevSegments.forEach(seg => {
            const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}` : seg.text.substring(0, 50)
            segmentMap.set(key, seg)
          })

          // Add/update with new segments
          data.segments.forEach(seg => {
            const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}` : seg.text.substring(0, 50)
            // Only update if it's a new segment or the text has changed
            if (!segmentMap.has(key) || segmentMap.get(key).text !== seg.text) {
              segmentMap.set(key, seg)
            }
          })

          return Array.from(segmentMap.values()).sort((a, b) => {
            if (a.start !== undefined && b.start !== undefined) return a.start - b.start
            return 0
          })
        })
      }
    })

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from Socket.IO server')
    })

    socket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error)
    })

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave_meeting', meetingId)
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [meetingId])

  // Set up real-time updates for bot meeting (useEffect must be at top level, BEFORE any returns)
  useEffect(() => {
    if (!botId) return
    const botMeeting = botMeetings.find(m => m.meetingId === botId)
    if (!botMeeting) return

    // Fetch transcript from MongoDB (segments are not included in listing for efficiency)
    const fetchTranscript = async () => {
      try {
        const res = await fetch(`/api/meeting-bot/transcript/${botId}`)
        if (res.ok) {
          const transcript = await res.json()
          if (transcript.segments && transcript.segments.length > 0) {
            console.log('📝 Loaded', transcript.segments.length, 'segments from MongoDB')
            setLiveSegments(transcript.segments)
          }
        }
      } catch (err) {
        console.error('Failed to fetch transcript:', err)
      }
    }
    fetchTranscript()

    // Connect to Socket.IO for real-time updates
    const socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001', {
      transports: ['websocket', 'polling'],
    })

    botMeetingSocketRef.current = socket

    socket.on('connect', () => {
      console.log('✅ Connected to Socket.IO for bot meeting')
      socket.emit('join_meeting', botId)
    })

    socket.on('transcript_update', (data: { meetingId: string; segments: any[]; timestamp: string }) => {
      if (data.meetingId === botId) {
        console.log('📝 Real-time update for bot meeting:', data.segments.length, 'segments')
        // Merge segments, avoiding duplicates
        setLiveSegments(prev => {
          const segmentMap = new Map<string, any>()
          prev.forEach(seg => {
            const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}-${seg.text.substring(0, 30)}` : seg.text.substring(0, 50)
            segmentMap.set(key, seg)
          })
          data.segments.forEach(seg => {
            const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}-${seg.text.substring(0, 30)}` : seg.text.substring(0, 50)
            if (!segmentMap.has(key) || segmentMap.get(key).text !== seg.text) {
              segmentMap.set(key, seg)
            }
          })
          return Array.from(segmentMap.values()).sort((a, b) => {
            if (a.start !== undefined && b.start !== undefined) return a.start - b.start
            return 0
          })
        })
      }
    })

    return () => {
      if (botMeetingSocketRef.current) {
        botMeetingSocketRef.current.emit('leave_meeting', botId)
        botMeetingSocketRef.current.disconnect()
        botMeetingSocketRef.current = null
      }
    }
  }, [botId, botMeetings])

  if (isLoading) return <div className="p-6">Loading…</div>
  if (!authUser) return <div className="p-6">Please sign in to view your transcripts.</div>

  // Show specific extension meeting if extensionId provided
  if (extensionId) {
    const extensionMeeting = extensionMeetings.find(m => m.id === extensionId)
    if (!extensionMeeting) return <div className="p-6">Extension meeting not found.</div>

    return (
      <AppShell title={extensionMeeting.title} subtitle={`Created ${extensionMeeting.createdAt?.toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }) || ''}`}>
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium mb-2">Transcript</h3>
            <div className="whitespace-pre-wrap text-sm">
              {extensionMeeting.transcript || 'No transcript available.'}
            </div>
          </div>
          {extensionMeeting.meetingURL && (
            <div className="text-sm text-muted-foreground">
              <a href={extensionMeeting.meetingURL} target="_blank" rel="noopener noreferrer" className="underline">
                View original meeting
              </a>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            📝 Extension Meeting • {extensionMeeting.autosave ? 'Auto-saved' : 'Manual save'}
          </div>
        </div>
      </AppShell>
    )
  }

  // Show specific meeting if ID provided (legacy support)
  if (meetingId) {
    // This is for legacy meetings - we'll show a message that they're not supported
    return <div className="p-6">Legacy meeting format not supported. Please use extension or bot meetings.</div>
  }

  // Show specific bot meeting if botId provided
  if (botId) {
    const botMeeting = botMeetings.find(m => m.meetingId === botId)
    if (!botMeeting) return <div className="p-6">Bot meeting not found.</div>

    // Use live segments if available, otherwise fall back to botMeeting segments
    const displaySegments = liveSegments.length > 0 ? liveSegments : (botMeeting.segments || [])

    return (
      <AppShell title={`${botMeeting.title || `Bot Meeting ${botId.substring(0, 8)}...`}`} subtitle={`Created ${new Date((botMeeting as any).createdAtMs ?? botMeeting.createdAt).toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })}`}>
        <div className="space-y-4">
          <div className="rounded-lg border p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Meeting Transcript {liveSegments.length > 0 && <span className="text-sm font-normal text-green-600">● Live</span>}</h3>
              {displaySegments.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {displaySegments.length} {displaySegments.length === 1 ? 'segment' : 'segments'} • {' '}
                  {[...new Set(displaySegments.map(s => s.speaker))].length} {[...new Set(displaySegments.map(s => s.speaker))].length === 1 ? 'speaker' : 'speakers'}
                </div>
              )}
            </div>
            <SpeakerTranscript segments={displaySegments} />
          </div>
          {botMeeting.meetingUrl && (
            <div className="text-sm text-muted-foreground">
              <a href={botMeeting.meetingUrl} target="_blank" rel="noopener noreferrer" className="underline">
                View original meeting
              </a>
            </div>
          )}
        </div>
      </AppShell>
    )
  }

  // Show all meetings list
  return (
    <AppShell title="Transcripts" subtitle="Auto-captured from meetings Onix joins">
      <div className="space-y-6">
        {/* Extension Meetings */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Extension Meetings</h3>
          {extensionLoading && (
            <div className="text-sm text-muted-foreground">Loading extension meetings...</div>
          )}
          <div className="grid gap-3">
            {extensionMeetings.map((meeting) => (
              <a key={meeting.id} href={`/transcripts?extensionId=${meeting.id}`} className="rounded-lg border p-4 hover:bg-muted/40">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{meeting.title || 'Untitled meeting'}</div>
                  <div className="text-sm text-muted-foreground">
                    {meeting.createdAt?.toLocaleString('en-US', {
                      timeZone: 'Asia/Karachi',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  📝 Extension • {meeting.autosave ? 'Auto-saved' : 'Manual save'}
                </div>
              </a>
            ))}
            {!extensionLoading && extensionMeetings.length === 0 && (
              <div className="text-sm text-muted-foreground">No extension meetings yet. Use the extension to start transcribing meetings.</div>
            )}
          </div>
        </div>

        {/* Bot Meetings */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Bot Meetings</h3>
          {botLoading && (
            <div className="text-sm text-muted-foreground">Loading bot meetings...</div>
          )}
          <div className="grid gap-3">
            {botMeetings.map((meeting) => (
              <a key={meeting.meetingId} href={`/transcripts?botId=${meeting.meetingId}`} className="rounded-lg border p-4 hover:bg-muted/40">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Bot Meeting {meeting.meetingId.substring(0, 8)}...</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(meeting.createdAt).toLocaleString('en-US', {
                      timeZone: 'Asia/Karachi',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  📝 {meeting.segments?.length || 0} segments •
                  👥 {meeting.segments ? [...new Set(meeting.segments.map(s => s.speaker))].length : 0} speakers
                </div>
              </a>
            ))}
            {!botLoading && botMeetings.length === 0 && (
              <div className="text-sm text-muted-foreground">No bot meetings yet.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
