"use client"

import { AppShell } from "@/components/app-shell"
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useSearchParams } from 'next/navigation'

export default function Page() {
  const { summaries, loading, error } = useBotMeetings()
  const searchParams = useSearchParams()
  const meetingId = searchParams.get('meetingId') || searchParams.get('botId')

  if (loading) {
    return (
      <AppShell title="Summary" subtitle="AI-generated notes and insights">
        <div className="rounded-xl border p-8 text-sm text-muted-foreground">
          Loading summaries...
        </div>
      </AppShell>
    )
  }

  if (error) {
    return (
      <AppShell title="Summary" subtitle="AI-generated notes and insights">
        <div className="rounded-xl border p-8 text-sm text-red-500">
          Error loading summaries: {error}
        </div>
      </AppShell>
    )
  }

  // Filter summaries by meetingId if provided
  const filteredSummaries = meetingId 
    ? summaries.filter(summary => summary.meetingId === meetingId)
    : summaries

  // Show specific meeting summary if meetingId provided
  if (meetingId && filteredSummaries.length > 0) {
    const summary = filteredSummaries[0]
    return (
      <AppShell 
        title={`Meeting Summary ${meetingId.substring(0, 8)}...`} 
        subtitle={`Generated ${new Date(summary.generatedAt).toLocaleString('en-US', {
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })}`}
      >
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">Meeting Summary</h3>
              <div className="text-sm text-muted-foreground">
                {new Date(summary.generatedAt).toLocaleString('en-US', {
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
            <div className="text-sm whitespace-pre-line">
              {summary.summaryText}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Model: {summary.model} • Meeting ID: {summary.meetingId}
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Summary" subtitle="AI-generated notes and insights">
      <div className="space-y-4">
        {filteredSummaries.length === 0 ? (
          <div className="rounded-xl border p-8 text-sm text-muted-foreground">
            {meetingId 
              ? `No summary found for meeting ${meetingId.substring(0, 8)}...`
              : "No summaries available yet. Start a bot meeting to generate summaries."
            }
          </div>
        ) : (
          filteredSummaries.map((summary, index) => (
            <div key={index} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium">Meeting Summary</h3>
                <div className="text-sm text-muted-foreground">
                  {new Date(summary.generatedAt).toLocaleString('en-US', {
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
              <div className="text-sm whitespace-pre-line">
                {summary.summaryText}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Model: {summary.model} • Meeting ID: {summary.meetingId}
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  )
}
