"use client"

import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-provider"
import MeetingUrlPopup from "@/components/meeting-url-popup"
import { useBotMeetings } from "@/hooks/use-bot-meetings"
import { useExtensionMeetings } from "@/hooks/use-extension-meetings"
import { useCalendarEvents } from "@/hooks/use-calendar-events"
import { Calendar, MapPin, Users, Video, ExternalLink, Clock, BarChart3 } from "lucide-react"
import Link from "next/link"

type MeetingDoc = {
  id: string
  title: string
  transcript: string
  createdAt: Date | null
  duration?: string
  meetingURL?: string
}

export default function Page() {
  const { authUser, isLoading, hasCalendarAccess } = useAuth()
  const [showBotPopup, setShowBotPopup] = useState(false)

  // Bot meetings hook
  const { meetings: botMeetings, summaries: botSummaries, loading: botLoading, refetch: refetchBotMeetings } = useBotMeetings()

  // Extension meetings hook
  const { meetings: extensionMeetings, loading: extensionLoading, refetch: refetchExtensionMeetings } = useExtensionMeetings()

  // Calendar events hook
  const { events: calendarEvents, loading: calendarLoading, error: calendarError, refetch: refetchCalendar } = useCalendarEvents()

  // Real-time Socket.IO connection for live caption updates
  const socketRef = useRef<Socket | null>(null)
  const [liveUpdates, setLiveUpdates] = useState<Map<string, number>>(new Map()) // meetingId → segmentCount

  // Debug logging
  console.log('Bot meetings:', botMeetings);
  console.log('Bot summaries:', botSummaries);
  console.log('Extension meetings:', extensionMeetings);

  // Set up real-time Socket.IO connection for all bot meetings
  useEffect(() => {
    if (botMeetings.length === 0) return

    // Connect to Socket.IO backend
    const socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001', {
      transports: ['websocket', 'polling'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[Meetings] ✅ Connected to Socket.IO for real-time updates')

      // Join rooms for ALL bot meetings to receive live updates
      botMeetings.forEach(meeting => {
        socket.emit('join_meeting', meeting.meetingId)
        console.log(`[Meetings] 📡 Joined room for meeting: ${meeting.meetingId}`)
      })
    })

    // Listen for real-time transcript updates
    socket.on('transcript_update', (data: { meetingId: string; segments: any[] }) => {
      console.log(`[Meetings] 📝 Live update for ${data.meetingId}: ${data.segments.length} segments`)

      // Update live segment count for this meeting
      setLiveUpdates(prev => {
        const updated = new Map(prev)
        const existingCount = updated.get(data.meetingId) || 0
        // Only update if new count is higher (prevents decreasing count)
        if (data.segments.length > existingCount) {
          updated.set(data.meetingId, data.segments.length)
        }
        return updated
      })

      // Trigger refetch to update meeting list with latest data
      refetchBotMeetings()
    })

    socket.on('disconnect', () => {
      console.log('[Meetings] ❌ Disconnected from Socket.IO')
    })

    socket.on('connect_error', (error) => {
      console.error('[Meetings] ❌ Socket.IO connection error:', error)
    })

    // Cleanup on unmount or when meetings change
    return () => {
      if (socketRef.current) {
        botMeetings.forEach(meeting => {
          socketRef.current?.emit('leave_meeting', meeting.meetingId)
        })
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [botMeetings, refetchBotMeetings])

  function handleStartMeeting() {
    window.postMessage({ type: 'ONIX_START_MEETING' }, '*')
  }

  function handleStartBotMeeting() {
    setShowBotPopup(true)
  }

  function handleBotSuccess() {
    refetchBotMeetings()
  }

  function handleExtensionSuccess() {
    refetchExtensionMeetings()
  }

  if (isLoading) return <div className="p-6">Loading…</div>
  if (!authUser) return <div className="p-6">Please sign in to view your meetings.</div>

  return (
    <AppShell
      title="Meetings"
      actions={
        <div className="flex gap-2">
          <Button onClick={handleStartBotMeeting} variant="outline">
            Join Bot to Meeting
          </Button>
          <Button onClick={handleStartMeeting}>
            Start New Meeting
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Calendar Events */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Scheduled Meetings
            </h3>
            {hasCalendarAccess && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchCalendar()}
                disabled={calendarLoading}
              >
                Refresh
              </Button>
            )}
          </div>

          {!hasCalendarAccess ? (
            <div className="rounded-lg border p-4 bg-muted/30">
              <p className="text-sm text-muted-foreground mb-3">
                Connect your Google Calendar to see scheduled meetings here.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">Connect Calendar</Link>
              </Button>
            </div>
          ) : calendarLoading ? (
            <div className="text-sm text-muted-foreground">Loading calendar events...</div>
          ) : calendarError ? (
            <div className="rounded-lg border p-4 bg-red-50 border-red-200">
              <p className="text-sm text-red-700">{calendarError}</p>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="mt-2"
              >
                <Link href="/settings">Go to Settings</Link>
              </Button>
            </div>
          ) : calendarEvents.length === 0 ? (
            <div className="text-sm text-muted-foreground">No upcoming meetings in the next 30 days.</div>
          ) : (
            <div className="grid gap-3">
              {calendarEvents.map((event) => {
                const startDate = event.start.dateTime
                  ? new Date(event.start.dateTime)
                  : event.start.date
                    ? new Date(event.start.date)
                    : null

                const endDate = event.end.dateTime
                  ? new Date(event.end.dateTime)
                  : event.end.date
                    ? new Date(event.end.date)
                    : null

                const isAllDay = !event.start.dateTime && event.start.date
                const isPast = startDate && startDate < new Date()
                const isToday = startDate &&
                  startDate.toDateString() === new Date().toDateString()

                // Extract Google Meet URL
                const meetUrl =
                  event.conferenceData?.entryPoints?.find(
                    (ep) => ep.entryPointType === "video"
                  )?.uri ||
                  event.description?.match(/https?:\/\/meet\.google\.com\/[a-z-]+/i)?.[0] ||
                  event.location?.match(/https?:\/\/meet\.google\.com\/[a-z-]+/i)?.[0] ||
                  null;


                const cardClassName = [
                  'rounded-lg border p-4 hover:bg-muted/40 transition-colors',
                  isPast ? 'opacity-60' : '',
                  isToday ? 'border-blue-300 bg-blue-50/50' : ''
                ].filter(Boolean).join(' ')

                return (
                  <div
                    key={event.id}
                    className={cardClassName}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-base truncate">
                            {event.summary || 'Untitled Event'}
                          </h4>
                          {isToday && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                              Today
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 mt-2">
                          {startDate && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4 flex-shrink-0" />
                              <span>
                                {isAllDay
                                  ? startDate.toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: startDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                                  })
                                  : startDate.toLocaleString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  })
                                }
                                {endDate && !isAllDay && (
                                  <> - {endDate.toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  })}</>
                                )}
                              </span>
                            </div>
                          )}

                          {event.location && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{event.location}</span>
                            </div>
                          )}

                          {event.attendees && event.attendees.length > 0 && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Users className="h-4 w-4 flex-shrink-0" />
                              <span>
                                {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                          )}

                          {meetUrl && (
                            <div className="flex items-center gap-2">
                              <Video className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              <a
                                href={meetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                              >
                                Join Google Meet
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      {event.htmlLink && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="flex-shrink-0"
                        >
                          <a
                            href={event.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>

                    {event.description && (
                      <div className="mt-3 pt-3 border-t text-sm text-muted-foreground line-clamp-2">
                        {event.description.replace(/<[^>]*>/g, '').substring(0, 150)}
                        {event.description.length > 150 ? '...' : ''}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Extension Meetings */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Extension Meetings</h3>
          {extensionLoading && (
            <div className="text-sm text-muted-foreground">Loading extension meetings...</div>
          )}
          <div className="grid gap-3">
            {extensionMeetings.map((m) => (
              <a key={m.id} href={`/transcripts?extensionId=${m.id}`} className="rounded-lg border p-4 hover:bg-muted/40">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{m.title || 'Untitled meeting'}</div>
                  <div className="text-sm text-muted-foreground">
                    {m.createdAt?.toLocaleString('en-US', {
                      timeZone: 'Asia/Karachi',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    }) || ''}
                  </div>
                </div>
                <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {m.transcript ? `${m.transcript.substring(0, 100)}...` : 'No transcript yet.'}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  📝 Extension • {m.autosave ? 'Auto-saved' : 'Manual save'}
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Bot Meetings</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchBotMeetings()}
              disabled={botLoading}
            >
              {botLoading ? 'Loading...' : 'Load Bot Meetings'}
            </Button>
          </div>
          {botLoading && (
            <div className="text-sm text-muted-foreground">Loading bot meetings...</div>
          )}
          <div className="grid gap-3">
            {botMeetings.map((meeting) => {
              const summary = botSummaries.find(s => s.meetingId === meeting.meetingId);
              return (
                <div key={meeting.meetingId} className="rounded-lg border p-4 hover:bg-muted/40">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{meeting.title || `Bot Meeting ${meeting.meetingId.substring(0, 8)}...`}</div>
                    <div className="text-sm text-muted-foreground">
                      {(() => {
                        const raw = (meeting as any).createdAtMs ?? (meeting as any).createdAt;
                        const epochMs = typeof raw === 'string' ? Number(raw) : raw;
                        const d = new Date(typeof epochMs === 'number' && !Number.isNaN(epochMs) ? epochMs : raw);
                        return d.toLocaleString('en-US', {
                          timeZone: 'Asia/Karachi', // Pakistan/Islamabad timezone
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })
                      })()}
                    </div>
                  </div>

                  <div className="mt-2 space-y-2">
                    <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>
                        📝 {liveUpdates.get(meeting.meetingId) || meeting.segments?.length || 0} segments
                        {liveUpdates.has(meeting.meetingId) && (
                          <span className="ml-1.5 text-green-600 font-medium">● Live</span>
                        )}
                      </span>
                      <span>•</span>
                      <span>
                        👥 {meeting.segments ? [...new Set(meeting.segments.map(s => s.speaker))].length : 0} speakers
                      </span>
                      <span>•</span>
                      <span>

                        ⏱️ {(() => {
                          const createdAtMs = typeof (meeting as any).createdAtMs === 'number'
                            ? (meeting as any).createdAtMs
                            : typeof (meeting as any).createdAt === 'string'
                              ? new Date((meeting as any).createdAt).getTime()
                              : 0;

                          // 1. Prefer explicit start/end times if available
                          const start = meeting.startTime ? new Date(meeting.startTime).getTime() : createdAtMs;
                          const end = meeting.endTime
                            ? new Date(meeting.endTime).getTime()
                            : (meeting.status === 'LIVE'
                              ? Date.now()
                              : (summary ? new Date(summary.generatedAt).getTime() : start));

                          // 2. Calculate duration
                          const rawDurationMs = end - start;

                          // 3. Format: logic (Math.ceil) + safety guard (> 0)
                          // If duration is positive, round up (30s -> 1m). If 0 or negative, default to 1m.
                          const mins = rawDurationMs > 0 ? Math.max(1, Math.ceil(rawDurationMs / 60000)) : 1;

                          return mins;
                        })()} min
                      </span>
                    </div>

                    {summary && (
                      <div className="text-sm text-green-700 bg-green-50 p-2 rounded">
                        <strong>AI Summary:</strong> {summary.summaryText.substring(0, 100)}...
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/transcripts?botId=${meeting.meetingId}`}>View Transcript</a>
                      </Button>
                      {summary && (
                        <>
                          <Button size="sm" variant="outline" asChild>
                            <a href={`/summaries?botId=${meeting.meetingId}`}>View Summary</a>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <a href={`/tasks?botId=${meeting.meetingId}`}>View Action Items</a>
                          </Button>
                        </>
                      )}
                      {/* Analytics button - show for completed/processed meetings */}
                      {(meeting.status === 'COMPLETED' || meeting.status === 'PROCESSED' || meeting.status === 'completed' || meeting.status === 'processed' || summary) && (
                        <Button size="sm" variant="outline" asChild className="bg-blue-50 hover:bg-blue-100 border-blue-200">
                          <a href={`/meetings/${meeting.meetingId}/analytics`} className="flex items-center gap-1">
                            <BarChart3 className="h-3.5 w-3.5" />
                            View Analytics
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {!botLoading && botMeetings.length === 0 && (
              <div className="text-sm text-muted-foreground">No bot meetings yet. Start a bot meeting to begin capturing.</div>
            )}
          </div>
        </div>
      </div>

      {/* Meeting URL Popup */}
      <MeetingUrlPopup
        isOpen={showBotPopup}
        onClose={() => setShowBotPopup(false)}
        onSuccess={handleBotSuccess}
      />
    </AppShell>
  )
}
