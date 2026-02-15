"use client"

import { AppShell } from "@/components/app-shell"
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useExtensionMeetings } from '@/hooks/use-extension-meetings'
import { useSearchParams } from 'next/navigation'
import { Calendar, User, ClipboardCheck, Bot, Chrome, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from "@/lib/utils"

// Helper to cleaning text and removing markdown junk
const cleanMarkdownText = (text: string) => {
  if (!text) return "";
  return text
    .replace(/##/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .trim();
};

// Simplified renderer for Tasks page
const renderTextWithMarkdown = (text: string, themeHeaderColor: string = 'text-blue-600', themeDotColor: string = 'bg-blue-500') => {
  if (!text) return null;

  const commonHeaders = [
    'Next Steps', 'Important Information', 'Decisions Made',
    'Action Items', 'Executive Summary', 'Key Discussion', 'Key Points',
    'Discussion Points', 'Overview'
  ];

  let processed = text.replace(/([^\n])(##)/g, '$1\nFORCE_NEW_LINE_$2');

  commonHeaders.forEach(header => {
    const regex = new RegExp(`([^\\n])(${header})([:\\-\n])`, 'gi');
    processed = processed.replace(regex, '$1\nFORCE_NEW_LINE_$2$3');
  });

  processed = processed.replace(/##/g, '').replace(/\*\*/g, '').replace(/\*/g, '').trim();
  const lines = processed.split('\n').filter(Boolean);

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const isForcedHeader = trimmed.startsWith('FORCE_NEW_LINE_');
        const displayLine = trimmed.replace('FORCE_NEW_LINE_', '');

        const matchedHeader = commonHeaders.find(h => displayLine.toLowerCase().startsWith(h.toLowerCase()));
        const isHeader = (isForcedHeader || (matchedHeader && displayLine.length < 50)) &&
          !displayLine.toLowerCase().startsWith('no specific');

        if (isHeader) {
          return (
            <div key={i} className="mt-4 first:mt-0 pt-2 border-t border-slate-100/50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className={`size-1.5 rounded-full ${themeDotColor} shadow-sm`} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${themeHeaderColor}`}>
                  {displayLine.replace(/[:\-]/g, '').trim()}
                </span>
              </div>
            </div>
          );
        }

        return (
          <div key={i} className="text-slate-700 leading-relaxed pl-3 border-l border-slate-100">
            {displayLine}
          </div>
        );
      })}
    </div>
  );
};

export default function Page() {
  const { summaries: botMeetings, loading: botLoading } = useBotMeetings()
  const { meetings: extensionMeetings, loading: extensionLoading } = useExtensionMeetings()
  const searchParams = useSearchParams()
  const meetingId = searchParams.get('meetingId') || searchParams.get('botId')

  const [expandedMeetings, setExpandedMeetings] = useState<Record<string, boolean>>({})
  const [showAllTasks, setShowAllTasks] = useState(false)

  const toggleMeeting = (id: string) => {
    setExpandedMeetings(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  // Extract action items from messy bot summary text
  const extractBotActionItems = (summaryText: string) => {
    const actionItems: string[] = []
    const lines = summaryText.split('\n')

    // Negative phrases to filter out
    const negativePhrases = [
      "no specific action",
      "no action items",
      "no follow-up",
      "no tasks",
      "none identified",
      "no specific facts",
      "no deadlines",
      "not specified"
    ];

    const isValidTask = (text: string) => {
      const lower = text.toLowerCase();
      // Must not contain negative phrases AND must be reasonably long/contentful
      return !negativePhrases.some(p => lower.includes(p)) && text.length > 5;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.toLowerCase().includes('action items:') || line.toLowerCase().includes('next steps:') || line.toLowerCase().includes('to-do:')) {
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim()
          // Stop at next main header
          if (nextLine.toLowerCase().includes(':') &&
            (nextLine.toLowerCase().includes('next steps') ||
              nextLine.toLowerCase().includes('decisions') ||
              nextLine.toLowerCase().includes('important info'))) break

          if (!nextLine) continue

          if (nextLine.match(/^[•\-\*]\s+/) || nextLine.match(/^\d+\.\s+/)) {
            const cleanLine = nextLine.replace(/^[•\-\*]\s+/, '').replace(/^\d+\.\s+/, '').trim();
            if (isValidTask(cleanLine)) {
              actionItems.push(cleanLine)
            }
          }
        }
        // If we found a specific header section, we can stop or continue depending on structure. 
        // Usually safer to break if we assume one main block, but some summaries split them.
        // Let's just break for the first main "Action Items" block found to avoid dupes/noise.
        break
      }
    }

    if (actionItems.length === 0) {
      // Fallback: loose bullet point finding if no header found
      const bulletPattern = /^[•\-\*]\s+(.+)$/gm
      let match
      while ((match = bulletPattern.exec(summaryText)) !== null) {
        const item = match[1].trim()
        // Stronger filtering for fallback
        if (item && isValidTask(item) && !item.toLowerCase().includes('action items')) {
          actionItems.push(item)
        }
      }
    }
    return actionItems
  }

  const loading = botLoading || extensionLoading

  if (loading) {
    return (
      <AppShell title="My Tasks" subtitle="Loading action items...">
        <div className="flex flex-col items-center justify-center p-20 text-slate-400 gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="text-sm font-medium">Synchronizing your tasks...</p>
        </div>
      </AppShell>
    )
  }

  // Consolidated aggregation logic
  const allMeetingTasks: any[] = []

  // Process Bot Meetings
  botMeetings.forEach(meeting => {
    const tasks = extractBotActionItems(meeting.summaryText)
    if (tasks.length > 0) {
      allMeetingTasks.push({
        id: meeting.meetingId,
        title: (meeting as any).title || `Bot Meeting ${meeting.meetingId.substring(0, 8)}`,
        date: (meeting as any).generatedAtMs || meeting.generatedAt,
        type: 'bot',
        actionItems: tasks.map(t => ({ text: t }))
      })
    }
  })

  // Process Extension Meetings
  extensionMeetings.forEach(meeting => {
    if (meeting.actionItems && meeting.actionItems.length > 0) {
      const negativePhrases = [
        "no specific action",
        "no action items",
        "no follow-up",
        "no tasks",
        "none identified",
        "no specific facts",
        "no deadlines",
        "not specified",
        "not provided"
      ];

      const realActionItems = meeting.actionItems.filter((ai: any) => {
        const text = typeof ai === 'string' ? ai : ai.text || "";
        const cleanText = text.toLowerCase();
        return !negativePhrases.some(phrase => cleanText.includes(phrase)) && text.length > 5;
      });

      if (realActionItems.length > 0) {
        allMeetingTasks.push({
          id: meeting.id,
          title: meeting.title || `Google Meet ${meeting.id.substring(0, 8)}`,
          date: meeting.createdAt,
          type: 'extension',
          actionItems: realActionItems
        })
      }
    }
  })

  // Filter if specific ID requested
  const allSortedTasks = allMeetingTasks.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const displayTasks = meetingId
    ? allSortedTasks.filter(m => m.id === meetingId)
    : (showAllTasks ? allSortedTasks : allSortedTasks.slice(0, 3))

  return (
    <AppShell
      title="My Tasks"
      subtitle={meetingId ? "Action items for this meeting" : "Action items aggregated across all meetings"}
    >
      <div className="space-y-8 max-w-5xl">
        {displayTasks.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ClipboardCheck className="text-slate-400" />
            </div>
            <h3 className="text-slate-900 font-semibold mb-1">No action items found</h3>
            <p className="text-slate-500 text-sm">Start a meeting to see your generated tasks here.</p>
          </div>
        ) : (
          displayTasks.map((meeting) => (
            <div key={meeting.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200">
              {/* Meeting Header - Clickable Accordion */}
              <div
                className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between cursor-pointer hover:bg-slate-100/50 transition-colors"
                onClick={() => toggleMeeting(meeting.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meeting.type === 'bot' ? 'bg-indigo-100 text-indigo-600' : 'bg-chrome-100 text-blue-600'
                    }`}>
                    {meeting.type === 'bot' ? <Bot size={20} /> : <Chrome size={20} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 tracking-tight">{meeting.title}</h3>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                      <Calendar size={10} />
                      {new Date(meeting.date).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-sm">
                    {meeting.actionItems.length} Tasks
                  </div>
                  {expandedMeetings[meeting.id] ? (
                    <ChevronUp className="text-slate-400" size={18} />
                  ) : (
                    <ChevronDown className="text-slate-400" size={18} />
                  )}
                </div>
              </div>

              {/* Tasks List - Conditionally Rendered */}
              {expandedMeetings[meeting.id] && (
                <div className="p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {meeting.actionItems.map((item: any, idx: number) => {
                    const itemText = typeof item === 'string' ? item : item.text;
                    const cleanItem = cleanMarkdownText(itemText);
                    return (
                      <div key={idx} className="flex items-start gap-4 p-4 bg-slate-50/50 rounded-xl border border-slate-100 hover:border-blue-200 transition-all group">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-800 leading-relaxed">
                            {renderTextWithMarkdown(cleanItem, 'text-blue-600', 'bg-blue-500')}
                          </div>
                          {item.assignedTo && (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-3 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                              <User className="h-3 w-3" />
                              <span>{item.assignedTo}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))
        )}

        {/* View All Button */}
        {!meetingId && !showAllTasks && allSortedTasks.length > 3 && (
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              className="rounded-xl border-2 border-slate-200 font-bold uppercase tracking-widest text-[10px] px-8 py-6 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all gap-2"
              onClick={() => setShowAllTasks(true)}
            >
              <Plus size={14} />
              View All Meetings ({allSortedTasks.length})
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
