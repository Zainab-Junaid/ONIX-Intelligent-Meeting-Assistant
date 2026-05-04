"use client"

import { useEffect, useState } from 'react'
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Trash2 } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import MeetingUrlPopup from "@/components/meeting-url-popup"
import { useBotMeetings } from "@/hooks/use-bot-meetings"
import { useExtensionMeetings } from "@/hooks/use-extension-meetings"
import { toast } from "sonner"

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
  const [searchQuery, setSearchQuery] = useState('')
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  // Bot meetings hook
  const { meetings: botMeetings, summaries: botSummaries, loading: botLoading, refetch: refetchBotMeetings } = useBotMeetings()

  // Extension meetings hook
  const { meetings: extensionMeetings, loading: extensionLoading, refetch: refetchExtensionMeetings } = useExtensionMeetings()

  // Debug logging
  console.log('Bot meetings:', botMeetings);
  console.log('Bot summaries:', botSummaries);
  console.log('Extension meetings:', extensionMeetings);

  // Filter meetings based on search query
  const filteredExtensionMeetings = extensionMeetings.filter(m =>
    m.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.transcript?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredBotMeetings = botMeetings.filter(m =>
    m.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.segments?.some(s => s.text?.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  async function handleDeleteMeeting(meetingId: string, type: 'extension' | 'bot') {
    if (!confirm('Are you sure you want to delete this meeting? This action cannot be undone.')) {
      return
    }

    setIsDeleting(meetingId)
    try {
      const token = await authUser?.getIdToken()
      if (!token) {
        toast.error('Please sign in to delete meetings')
        return
      }

      const url = type === 'extension'
        ? `/api/extension-meetings?meetingId=${meetingId}`
        : `/api/meeting-bot/meetings/${meetingId}`

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete meeting')
      }

      toast.success('Meeting deleted successfully')

      // Refresh the lists
      if (type === 'extension') {
        refetchExtensionMeetings()
      } else {
        refetchBotMeetings()
      }
    } catch (error: any) {
      console.error('Error deleting meeting:', error)
      toast.error(`Error: ${error.message}`)
    } finally {
      setIsDeleting(null)
    }
  }

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
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search meetings by title or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="space-y-6">
        {/* Extension Meetings */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Extension Meetings</h3>
          {extensionLoading && (
            <div className="text-sm text-muted-foreground">Loading extension meetings...</div>
          )}
          <div className="grid gap-3">
            {filteredExtensionMeetings.map((m) => (
              <div key={m.id} className="group relative rounded-lg border p-4 hover:bg-muted/40 transition-colors">
                <a href={`/transcripts?extensionId=${m.id}`} className="block">
                  <div className="flex items-center justify-between pr-10">
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
                  <div className="mt-2 line-clamp-2 text-sm text-muted-foreground pr-10">
                    {m.transcript ? `${m.transcript.substring(0, 100)}...` : 'No transcript yet.'}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    📝 Extension • {m.autosave ? 'Auto-saved' : 'Manual save'}
                  </div>
                </a>

                {/* Delete Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteMeeting(m.id, 'extension');
                  }}
                  disabled={isDeleting === m.id}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {!extensionLoading && filteredExtensionMeetings.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {searchQuery ? 'No meetings found matching your search.' : 'No extension meetings yet. Use the extension to start transcribing meetings.'}
              </div>
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
            {filteredBotMeetings.map((meeting) => {
              const summary = botSummaries.find(s => s.meetingId === meeting.meetingId);
              return (
                <div key={meeting.meetingId} className="group relative rounded-lg border p-4 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center justify-between pr-10">
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

                  <div className="mt-2 space-y-2 pr-10">
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

                  {/* Delete Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteMeeting(meeting.meetingId, 'bot');
                    }}
                    disabled={isDeleting === meeting.meetingId}
                  >
                    <Trash2 className="size-4" />
                  </Button>
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
