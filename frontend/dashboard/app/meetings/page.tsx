"use client"

import { useEffect, useState } from 'react'
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-provider"
import MeetingUrlPopup from "@/components/meeting-url-popup"
import { useBotMeetings } from "@/hooks/use-bot-meetings"
import { useExtensionMeetings } from "@/hooks/use-extension-meetings"

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
  const [showBotPopup, setShowBotPopup] = useState(false)
  
  // Bot meetings hook
  const { meetings: botMeetings, summaries: botSummaries, loading: botLoading, refetch: refetchBotMeetings } = useBotMeetings()
  
  // Extension meetings hook
  const { meetings: extensionMeetings, loading: extensionLoading, refetch: refetchExtensionMeetings } = useExtensionMeetings()
  
  // Debug logging
  console.log('Bot meetings:', botMeetings);
  console.log('Bot summaries:', botSummaries);
  console.log('Extension meetings:', extensionMeetings);

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
          <h3 className="text-lg font-semibold mb-3">Bot Meetings</h3>
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
                    <div className="text-sm text-muted-foreground">
                      📝 {meeting.segments?.length || 0} segments • 
                      👥 {meeting.segments ? [...new Set(meeting.segments.map(s => s.speaker))].length : 0} speakers • 
                      ⏱️ {(() => {
                        const createdAtMs = Number(((meeting as any).createdAtMs ?? (meeting as any).createdAt) || 0);
                        const summaryForMeeting = summary ? new Date(summary.generatedAt).getTime() : undefined;
                        // Prefer summary time (meeting end) when available; fallback to at least 1 minute if start exists
                        const endMs = summaryForMeeting && isFinite(summaryForMeeting) ? summaryForMeeting : createdAtMs;
                        const mins = createdAtMs && endMs && endMs >= createdAtMs ? Math.max(1, Math.round((endMs - createdAtMs) / 60000)) : 0;
                        return mins;
                      })()} min
                    </div>
                    
                    {summary && (
                      <div className="text-sm text-green-700 bg-green-50 p-2 rounded">
                        <strong>AI Summary:</strong> {summary.summaryText.substring(0, 100)}...
                      </div>
                    )}
                    
                    <div className="flex gap-2 mt-2">
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
