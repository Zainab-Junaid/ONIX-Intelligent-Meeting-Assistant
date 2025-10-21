"use client"

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { AppShell } from "@/components/app-shell"
import { useSearchParams } from 'next/navigation'
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useExtensionMeetings } from '@/hooks/use-extension-meetings'

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

  // Stream segments and load summary/action items for a specific meeting
  useEffect(() => {
    if (!meetingId) return
    // For a specific meeting, load segments and summary via backend endpoints
    fetch('/api/meeting-bot/meetings')
      .then(r => r.json())
      .then((rows: any[]) => {
        const mtg = rows.find(r => r.meetingId === meetingId)
        if (mtg) {
          setSegments(Array.isArray(mtg.segments) ? mtg.segments : [])
        }
      }).catch(() => setSegments([]))

    fetch('/api/meeting-bot/summaries')
      .then(r => r.json())
      .then((rows: any[]) => {
        const s = rows.find(r => r.meetingId === meetingId)
        setSummaryText(s?.summaryText || '')
      }).catch(() => setSummaryText(''))
  }, [meetingId])

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
          <div className="rounded-lg border p-4">
            <h3 className="font-medium mb-2">Transcript Segments</h3>
            <div className="space-y-2">
              {botMeeting.segments?.map((segment, index) => (
                <div key={index} className="border-l-2 border-blue-200 pl-3">
                  <div className="font-medium text-sm text-blue-600">{segment.speaker}</div>
                  <div className="text-sm">{segment.text}</div>
                  <div className="text-xs text-muted-foreground">
                    {segment.start && segment.end ? (
                      <>
                        {Math.floor(segment.start / 60)}:{(segment.start % 60).toString().padStart(2, '0')} - 
                        {Math.floor(segment.end / 60)}:{(segment.end % 60).toString().padStart(2, '0')}
                      </>
                    ) : (
                      'Live segment'
                    )}
                  </div>
                </div>
              ))}
              {(!botMeeting.segments || botMeeting.segments.length === 0) && (
                <div className="text-sm text-muted-foreground">No segments yet.</div>
              )}
            </div>
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
