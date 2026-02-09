"use client"

import { AppShell } from "@/components/app-shell"
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

interface ActionItem {
  id: string
  meetingId: string
  meetingTitle?: string
  item: string
  status: string
  assignedTo?: string | null
  createdAt?: string
}

export default function Page() {
  const { meetings, loading, error } = useBotMeetings()
  const searchParams = useSearchParams()
  const meetingId = searchParams.get('meetingId') || searchParams.get('botId')
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [itemsError, setItemsError] = useState<string | null>(null)

  const resolveMeetingTitle = (id: string, fallback?: string) => {
    const meeting = meetings.find(m => m.meetingId === id)
    return meeting?.title || fallback || `Meeting ${id.substring(0, 8)}...`
  }

  useEffect(() => {
    let isMounted = true
    setLoadingItems(true)
    setItemsError(null)

    const url = meetingId
      ? `/api/meeting-bot/action-items/${meetingId}`
      : `/api/meeting-bot/action-items`

    fetch(url)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to fetch action items')))
      .then(data => {
        if (!isMounted) return
        setActionItems(Array.isArray(data) ? data : [])
      })
      .catch(err => {
        if (!isMounted) return
        setItemsError(err?.message || 'Failed to load action items')
        setActionItems([])
      })
      .finally(() => {
        if (!isMounted) return
        setLoadingItems(false)
      })

    return () => { isMounted = false }
  }, [meetingId])

  if (loading || loadingItems) {
    return (
      <AppShell title="My Tasks" subtitle="Action items extracted from meetings">
        <div className="rounded-xl border p-8 text-sm text-muted-foreground">
          Loading action items...
        </div>
      </AppShell>
    )
  }

  if (error || itemsError) {
    return (
      <AppShell title="My Tasks" subtitle="Action items extracted from meetings">
        <div className="rounded-xl border p-8 text-sm text-red-500">
          Error loading action items: {error || itemsError}
        </div>
      </AppShell>
    )
  }

  // Group action items by meeting
  const meetingActionItems = actionItems.reduce((acc, item) => {
    const existing = acc.find(m => m.meetingId === item.meetingId)
    if (existing) {
      existing.actionItems.push(item)
    } else {
      acc.push({
        meetingId: item.meetingId,
        meetingTitle: item.meetingTitle,
        generatedAt: item.createdAt,
        actionItems: [item],
      })
    }
    return acc
  }, [] as Array<{
    meetingId: string
    meetingTitle?: string
    generatedAt?: string
    actionItems: ActionItem[]
  }>)

  // If viewing a specific meeting and no action items found, show message
  if (meetingId && meetingActionItems.length === 0) {
    return (
      <AppShell 
        title={`Meeting Tasks ${resolveMeetingTitle(meetingId)}`} 
        subtitle="Action items from this meeting"
      >
        <div className="rounded-xl border p-8 text-sm text-muted-foreground">
          No action items found for meeting {resolveMeetingTitle(meetingId)}...
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell 
      title={meetingId ? `Meeting Tasks ${resolveMeetingTitle(meetingId)}` : "My Tasks"} 
      subtitle={meetingId ? "Action items from this meeting" : "Action items extracted from meetings"}
    >
      <div className="space-y-4">
        {meetingActionItems.length === 0 ? (
          <div className="rounded-xl border p-8 text-sm text-muted-foreground">
            {meetingId 
              ? `No action items found for meeting ${resolveMeetingTitle(meetingId)}...`
              : "No action items found yet. Start a bot meeting to generate action items from summaries."
            }
          </div>
        ) : (
          meetingActionItems.map((meeting) => (
            <div key={meeting.meetingId} className="rounded-lg border p-4">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg">
                    {resolveMeetingTitle(meeting.meetingId, meeting.meetingTitle)}
                  </h3>
                  <div className="text-sm text-muted-foreground">
                  {meeting.generatedAt ? new Date(meeting.generatedAt).toLocaleString('en-US', {
                      timeZone: 'Asia/Karachi',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    }) : '—'}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground mb-3">
                  {meeting.actionItems.length} action item{meeting.actionItems.length !== 1 ? 's' : ''} identified from this meeting
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-gray-700 mb-2">Action Items:</h4>
                {meeting.actionItems.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 border-l-4 border-blue-200 rounded-r">
                    <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    <div className="text-sm text-gray-800 leading-relaxed">
                      {item.item}
                      {item.assignedTo ? ` — ${item.assignedTo}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  )
}

