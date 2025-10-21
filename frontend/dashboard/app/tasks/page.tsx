"use client"

import { AppShell } from "@/components/app-shell"
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useSearchParams } from 'next/navigation'

export default function Page() {
  const { summaries, loading, error } = useBotMeetings()
  const searchParams = useSearchParams()
  const meetingId = searchParams.get('meetingId') || searchParams.get('botId')

  // Extract action items from summaries (ignore metadata lines)
  const extractActionItems = (summaryText: string) => {
    const actionItems: string[] = []
    
    // Split by lines and process each line
    const lines = summaryText.split('\n')
      .filter(l => !/^\*\*Meeting ID\*\*:/i.test(l.trim()))
      .filter(l => !/^\*\*Duration\*\*:/i.test(l.trim()))
      .filter(l => !/^\*\*Participants\*\*:/i.test(l.trim()))
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // Look for "Action Items:" section
      if (line.toLowerCase().includes('action items:')) {
        // Get all lines after "Action Items:" until next section or end
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim()
          
          // Stop if we hit another section header
          if (nextLine.toLowerCase().includes(':') && 
              (nextLine.toLowerCase().includes('next steps') || 
               nextLine.toLowerCase().includes('decisions') ||
               nextLine.toLowerCase().includes('key discussion'))) {
            break
          }
          
          // Skip empty lines
          if (!nextLine) continue
          
          // Extract items that start with bullet points, dashes, or numbers
          if (nextLine.match(/^[•\-\*]\s+/) || nextLine.match(/^\d+\.\s+/)) {
            let item = nextLine.replace(/^[•\-\*]\s+/, '').replace(/^\d+\.\s+/, '').trim()
            
            // Look for speaker assignments in the action item
            const speakerMatch = item.match(/(.+?)\s*\(assigned to\s+([^)]+)\)/i)
            if (speakerMatch) {
              const task = speakerMatch[1].trim()
              const speaker = speakerMatch[2].trim()
              item = `${task} (assigned to ${speaker})`
            }
            
            if (item && item.length > 5) {
              actionItems.push(item)
            }
          }
        }
        break
      }
    }
    
    // If no "Action Items:" section found, look for scattered bullet points
    if (actionItems.length === 0) {
      const bulletPattern = /^[•\-\*]\s+(.+)$/gm
      let match
      while ((match = bulletPattern.exec(summaryText)) !== null) {
        let item = match[1].trim()
        
        // Look for speaker assignments in scattered bullet points too
        const speakerMatch = item.match(/(.+?)\s*\(assigned to\s+([^)]+)\)/i)
        if (speakerMatch) {
          const task = speakerMatch[1].trim()
          const speaker = speakerMatch[2].trim()
          item = `${task} (assigned to ${speaker})`
        }
        
        if (item && item.length > 5 && !item.toLowerCase().includes('action items')) {
          actionItems.push(item)
        }
      }
    }

    return actionItems
  }

  if (loading) {
    return (
      <AppShell title="My Tasks" subtitle="Action items extracted from meetings">
        <div className="rounded-xl border p-8 text-sm text-muted-foreground">
          Loading action items...
        </div>
      </AppShell>
    )
  }

  if (error) {
    return (
      <AppShell title="My Tasks" subtitle="Action items extracted from meetings">
        <div className="rounded-xl border p-8 text-sm text-red-500">
          Error loading action items: {error}
        </div>
      </AppShell>
    )
  }

  // Filter summaries by meetingId if provided
  const filteredSummaries = meetingId 
    ? summaries.filter(summary => summary.meetingId === meetingId)
    : summaries

  // Group action items by meeting
  const meetingActionItems = filteredSummaries.map(summary => {
    const actionItems = extractActionItems(summary.summaryText)
    return {
      meetingId: summary.meetingId,
      generatedAt: summary.generatedAt,
      actionItems: actionItems,
      totalItems: actionItems.length
    }
  }).filter(meeting => meeting.totalItems > 0)

  // If viewing a specific meeting and no action items found, show message
  if (meetingId && meetingActionItems.length === 0) {
    return (
      <AppShell 
        title={`Meeting Tasks ${meetingId.substring(0, 8)}...`} 
        subtitle="Action items from this meeting"
      >
        <div className="rounded-xl border p-8 text-sm text-muted-foreground">
          No action items found for meeting {meetingId.substring(0, 8)}...
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell 
      title={meetingId ? `Meeting Tasks ${meetingId.substring(0, 8)}...` : "My Tasks"} 
      subtitle={meetingId ? "Action items from this meeting" : "Action items extracted from meetings"}
    >
      <div className="space-y-4">
        {meetingActionItems.length === 0 ? (
          <div className="rounded-xl border p-8 text-sm text-muted-foreground">
            {meetingId 
              ? `No action items found for meeting ${meetingId.substring(0, 8)}...`
              : "No action items found yet. Start a bot meeting to generate action items from summaries."
            }
          </div>
        ) : (
          meetingActionItems.map((meeting) => (
            <div key={meeting.meetingId} className="rounded-lg border p-4">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg">{(meeting as any).title || `Meeting ${meeting.meetingId.substring(0, 8)}...`}</h3>
                  <div className="text-sm text-muted-foreground">
                  {new Date((meeting as any).generatedAtMs ?? meeting.generatedAt).toLocaleString('en-US', {
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
                <div className="text-sm text-muted-foreground mb-3">
                  {meeting.totalItems} action item{meeting.totalItems !== 1 ? 's' : ''} identified from this meeting
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-gray-700 mb-2">Action Items:</h4>
                {meeting.actionItems.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 border-l-4 border-blue-200 rounded-r">
                    <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    <div className="text-sm text-gray-800 leading-relaxed">{item}</div>
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

