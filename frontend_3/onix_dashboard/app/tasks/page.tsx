"use client"

import { AppShell } from "@/components/app-shell"
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useExtensionMeetings } from '@/hooks/use-extension-meetings'
import { useSearchParams } from 'next/navigation'
import { Calendar, User, ClipboardCheck, Bot, Chrome, ChevronDown, ChevronUp, Plus, Check, CheckCircle2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from "@/lib/utils"

const STORAGE_KEY = 'onix_completed_task_ids'

function getStoredCompletedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveCompletedIds(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch (_) {}
}

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
  const [taskFilter, setTaskFilter] = useState<'pending' | 'completed'>('pending')
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setCompletedIds(getStoredCompletedIds())
  }, [])

  const toggleMeeting = (id: string) => {
    setExpandedMeetings(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const taskKey = (meetingId: string, index: number) => `${meetingId}|${index}`

  const toggleTaskCompleted = useCallback((key: string) => {
    setCompletedIds(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveCompletedIds(next)
      return next
    })
  }, [])

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

  const allSortedTasks = allMeetingTasks.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const baseDisplayTasks = meetingId
    ? allSortedTasks.filter(m => m.id === meetingId)
    : (showAllTasks ? allSortedTasks : allSortedTasks.slice(0, 3))

  const displayTasks = taskFilter === 'pending'
    ? baseDisplayTasks.filter(m => m.actionItems.some((_: any, idx: number) => !completedIds.has(taskKey(m.id, idx))))
    : baseDisplayTasks.filter(m => m.actionItems.some((_: any, idx: number) => completedIds.has(taskKey(m.id, idx))))

  return (
    <AppShell
      title="My Tasks"
      subtitle={meetingId ? "Action items for this meeting" : "Action items aggregated across all meetings"}
    >
      <div className="space-y-6 max-w-5xl">
        {/* Pending / Completed tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit">
            <button
              type="button"
              onClick={() => setTaskFilter('pending')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                taskFilter === 'pending'
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Pending
            </button>
            <button
              type="button"
              onClick={() => setTaskFilter('completed')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                taskFilter === 'completed'
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Completed
            </button>
          </div>
          {taskFilter === 'pending' && displayTasks.length > 0 && (
            <p className="text-xs text-slate-500">
              Tap the circle next to a task to mark it done.
            </p>
          )}
        </div>

        {displayTasks.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              {taskFilter === 'completed' ? (
                <CheckCircle2 className="text-slate-400" size={24} />
              ) : (
                <ClipboardCheck className="text-slate-400" />
              )}
            </div>
            <h3 className="text-slate-900 font-semibold mb-1">
              {taskFilter === 'completed' ? 'No completed tasks yet' : 'No action items found'}
            </h3>
            <p className="text-slate-500 text-sm">
              {taskFilter === 'completed'
                ? 'Mark tasks as done from the Pending tab to see them here.'
                : 'Start a meeting to see your generated tasks here.'}
            </p>
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
                    {taskFilter === 'pending'
                      ? meeting.actionItems.filter((_: any, i: number) => !completedIds.has(taskKey(meeting.id, i))).length
                      : meeting.actionItems.filter((_: any, i: number) => completedIds.has(taskKey(meeting.id, i))).length}{' '}
                    {taskFilter === 'pending' ? 'Pending' : 'Completed'}
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
                    const key = taskKey(meeting.id, idx)
                    const isCompleted = completedIds.has(key)
                    if (taskFilter === 'pending' && isCompleted) return null
                    if (taskFilter === 'completed' && !isCompleted) return null

                    const itemText = typeof item === 'string' ? item : item.text
                    const cleanItem = cleanMarkdownText(itemText)
                    return (
                      <div
                        key={key}
                        className={cn(
                          "flex items-start gap-4 p-4 rounded-xl border transition-all group",
                          isCompleted
                            ? "bg-slate-50/80 border-slate-100"
                            : "bg-slate-50/50 border-slate-100 hover:border-blue-200"
                        )}
                      >
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleTaskCompleted(key); }}
                          title={isCompleted ? 'Mark as pending' : 'Mark as complete'}
                          className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all border-2",
                            isCompleted
                              ? "bg-blue-600 border-blue-600"
                              : "bg-white border-slate-300 hover:border-blue-400 hover:bg-slate-50"
                          )}
                          aria-label={isCompleted ? 'Mark as pending' : 'Mark as complete'}
                        >
                          {isCompleted ? (
                            <Check className="size-4 text-white" strokeWidth={3} />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-blue-400" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              "text-sm font-semibold leading-relaxed",
                              isCompleted ? "text-slate-500 line-through" : "text-slate-800"
                            )}
                          >
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
