"use client"

import { useState } from 'react'
import { AppShell } from "@/components/app-shell"
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useExtensionMeetings } from '@/hooks/use-extension-meetings'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Calendar,
  Bot,
  Chrome,
  LayoutList,
  ChevronDown,
  ChevronUp,
  BadgeAlert
} from "lucide-react"
import { cn } from "@/lib/utils"

export default function Page() {
  const { summaries: botSummaries, loading: botLoading, error: botError } = useBotMeetings()
  const { meetings: extensionMeetings, loading: extensionLoading, error: extensionError } = useExtensionMeetings()
  const searchParams = useSearchParams()
  const meetingId = searchParams.get('meetingId') || searchParams.get('botId')

  // State for accordion
  const [expandedMeetings, setExpandedMeetings] = useState<Record<string, boolean>>({})

  const toggleMeeting = (id: string) => {
    setExpandedMeetings(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Ultra-aggressive parsing to separate sections based on user feedback
  const extractCategorizedItems = (summaryText: string) => {
    const rawSections: { title: string; content: string }[] = []

    // Normalize: ensure every ## or bold section header is on a new line
    let processed = summaryText
      .replace(/([^\n])(##)/g, '$1\n$2')
      .replace(/([^\n])(\*\*)/g, '$1\n$2')
      .replace(/##/g, '') // Remove hashes entirely for cleaner splitting

    // Split by common section delimiters that appear in AI summaries
    const commonDelimiters = [
      'Action Items', 'Next Steps', 'Important Information',
      'Key Discussion', 'Decisions', 'Executive Summary',
      'Key Points', 'Discussion Points'
    ]

    const lines = processed.split('\n').map(l => l.trim()).filter(Boolean)
    let currentTitle = "General Tasks"
    let currentLines: string[] = []

    for (const line of lines) {
      // Check if line is a header
      const cleanLine = line.replace(/[\*:]/g, '').trim()
      const isHeader = commonDelimiters.some(d => cleanLine.toLowerCase().includes(d.toLowerCase()))

      if (isHeader && cleanLine.length < 40) { // Headers are usually short
        if (currentLines.length > 0) {
          rawSections.push({ title: currentTitle, content: currentLines.join('\n') })
        }
        currentTitle = cleanLine
        currentLines = []
      } else {
        currentLines.push(line)
      }
    }
    if (currentLines.length > 0) {
      rawSections.push({ title: currentTitle, content: currentLines.join('\n') })
    }

    // Now convert raw sections into clean items
    return rawSections.map(s => {
      // Split content into items by bullet points or newlines
      const items = s.content
        .split(/[•\-\*]|\d+\.|\n/)
        .map(i => i.trim()
          .replace(/##/g, '') // Double check removal
          .replace(/\*\*/g, '')
        )
        .filter(i => i.length > 5 && !commonDelimiters.some(d => i.toLowerCase() === d.toLowerCase()))

      return {
        title: s.title,
        items
      }
    }).filter(s => s.items.length > 0)
  }

  const isLoading = botLoading || extensionLoading

  if (isLoading && !botSummaries.length && !extensionMeetings.length) {
    return (
      <AppShell title="My Tasks" subtitle="Loading your workspace...">
        <div className="flex items-center justify-center p-12">
          <div className="text-center animate-in fade-in zoom-in duration-500">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-sm text-muted-foreground font-semibold">Organizing your tasks...</p>
          </div>
        </div>
      </AppShell>
    )
  }

  // Process data
  const botActionItems = botSummaries
    .filter(summary => !meetingId || summary.meetingId === meetingId)
    .map(summary => ({
      id: summary.meetingId,
      title: `Bot Meeting ${summary.meetingId.substring(0, 8)}`,
      date: summary.generatedAt,
      sections: extractCategorizedItems(summary.summaryText),
      source: 'Bot' as const
    }))
    .filter(m => m.sections.length > 0)

  const extActionItems = extensionMeetings
    .filter(meeting => !meetingId || meeting.id === meetingId)
    .map(meeting => {
      const sections: { title: string; items: string[] }[] = []
      const items = (meeting.actionItems || []).map(item => typeof item === 'string' ? item : (item.text || '')).filter(Boolean) as string[]
      if (items.length > 0) sections.push({ title: 'Action Items', items })
      if (meeting.summary?.text) {
        const extraSections = extractCategorizedItems(meeting.summary.text)
        extraSections.forEach(es => {
          if (!sections.find(s => s.title.toLowerCase() === es.title.toLowerCase())) sections.push(es)
        })
      }
      return {
        id: meeting.id,
        title: meeting.title || 'Untitled meeting',
        date: meeting.createdAt,
        sections,
        source: 'Extension' as const
      }
    })
    .filter(m => m.sections.length > 0)

  const allMeetingTasks = [...botActionItems, ...extActionItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <AppShell
      title={meetingId ? "Meeting Tasks" : "My Tasks"}
      subtitle={meetingId ? "Action items from this meeting" : "Action items extracted from all meetings"}
    >
      <div className="max-w-4xl mx-auto space-y-4 pb-12">
        {/* Error notifications as small banners */}
        {(botError || extensionError) && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-xs font-medium mb-6">
            <BadgeAlert className="size-4 shrink-0" />
            <span>Some meeting data could not be retrieved. Displaying available offline tasks.</span>
          </div>
        )}

        {allMeetingTasks.length === 0 ? (
          <div className="rounded-[2.5rem] border-2 border-dashed p-20 text-center bg-white shadow-sm">
            <LayoutList className="size-16 text-slate-200 mx-auto mb-6" />
            <h3 className="text-xl font-bold text-slate-900">Workspace empty</h3>
            <p className="text-slate-500 mt-2 max-w-xs mx-auto">Tasks will automatically appear here once meetings are processed.</p>
          </div>
        ) : (
          allMeetingTasks.map((meeting) => {
            const isExpanded = !!expandedMeetings[meeting.id] || meetingId === meeting.id
            const totalItems = meeting.sections.reduce((sum, s) => sum + s.items.length, 0)

            return (
              <div key={meeting.id} className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                {/* Accordion Trigger */}
                <button
                  onClick={() => toggleMeeting(meeting.id)}
                  className="w-full text-left px-8 py-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "size-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                      meeting.source === 'Extension' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                    )}>
                      {meeting.source === 'Extension' ? <Chrome className="size-5" /> : <Bot className="size-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-900 group-hover:text-primary transition-colors">{meeting.title}</h3>
                      <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {new Date(meeting.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span>•</span>
                        <span>{totalItems} Tasks</span>
                      </div>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="size-5 text-slate-400" /> : <ChevronDown className="size-5 text-slate-400" />}
                </button>

                {/* Accordion Content */}
                {isExpanded && (
                  <div className="px-8 pb-10 pt-2 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-10 mt-6 pl-2">
                      {meeting.sections.map((section, sIndex) => (
                        <div key={sIndex} className="space-y-4">
                          {/* Blue Upper-case Header with Dot - Matching Image 3 */}
                          <div className="flex items-center gap-2">
                            <div className="size-1.5 rounded-full bg-blue-500" />
                            <h4 className="text-sm font-black text-blue-500 uppercase tracking-widest">
                              {section.title}
                            </h4>
                          </div>

                          <div className="space-y-2.5 ml-3.5">
                            {section.items.map((item, iIndex) => (
                              <div key={iIndex} className="flex items-start gap-3 group/item">
                                <span className="text-slate-400 mt-1.5 shrink-0 text-xs">•</span>
                                <p className="text-[14px] leading-relaxed text-slate-600 font-medium group-hover/item:text-slate-900 transition-colors">
                                  {item}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </AppShell>
  )
}
