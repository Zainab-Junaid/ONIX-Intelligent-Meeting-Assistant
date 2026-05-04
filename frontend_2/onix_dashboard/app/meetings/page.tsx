"use client"

import { useState, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Search, Trash2, Bot, Chrome, Calendar, Clock, Users, SlidersHorizontal, ArrowUpDown, X, ChevronDown, ChevronUp } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import MeetingUrlPopup from "@/components/meeting-url-popup"
import { useBotMeetings } from "@/hooks/use-bot-meetings"
import { useExtensionMeetings } from "@/hooks/use-extension-meetings"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { MeetingCard } from "@/components/meeting-card"
import { AskOnixPopup } from "@/components/ask-onix-popup"

type DateFilter = 'all' | '7days' | '30days' | '90days'
type SortOption = 'newest' | 'oldest' | 'title-asc' | 'title-desc'

const INITIAL_DISPLAY_COUNT = 3

export default function Page() {
  const { authUser, isLoading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [showBotPopup, setShowBotPopup] = useState(false)
  const [activeTab, setActiveTab] = useState('bot')
  const searchQuery = searchParams.get('q') ?? ''
  const setSearchQuery = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value.trim()) params.set('q', value)
    else params.delete('q')
    const query = params.toString()
    router.replace(`/meetings${query ? `?${query}` : ''}`)
  }, [searchParams, router])
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [sortOption, setSortOption] = useState<SortOption>('newest')

  // State for "View All"
  const [showAllBot, setShowAllBot] = useState(false)
  const [showAllExtension, setShowAllExtension] = useState(false)

  // Bot meetings hook
  const { meetings: botMeetings, summaries: botSummaries, loading: botLoading, refetch: refetchBotMeetings } = useBotMeetings()

  // Extension meetings hook
  const { meetings: extensionMeetings, loading: extensionLoading, refetch: refetchExtensionMeetings } = useExtensionMeetings()

  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [askOnixMeeting, setAskOnixMeeting] = useState<{ meetingId: string; title: string } | null>(null)

  // Filter helper function
  const filterByDate = (date: Date, filter: DateFilter): boolean => {
    if (filter === 'all') return true
    const now = new Date()
    const diffTime = now.getTime() - date.getTime()
    const diffDays = diffTime / (1000 * 60 * 60 * 24)

    switch (filter) {
      case '7days': return diffDays <= 7
      case '30days': return diffDays <= 30
      case '90days': return diffDays <= 90
      default: return true
    }
  }

  // Filter and sort bot meetings
  const processedBotMeetings = useMemo(() => {
    let filtered = botMeetings.filter(m => {
      const createdAt = new Date(((m as any).createdAtMs ?? (m as any).createdAt) as string)
      const matchesDate = filterByDate(createdAt, dateFilter)
      const matchesSearch = searchQuery === '' ||
        (m.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.segments?.some(s => s.text?.toLowerCase().includes(searchQuery.toLowerCase()))
      return matchesDate && matchesSearch
    })

    // Sort
    filtered.sort((a, b) => {
      const aDate = new Date(((a as any).createdAtMs ?? (a as any).createdAt) as string)
      const bDate = new Date(((b as any).createdAtMs ?? (b as any).createdAt) as string)
      const aTitle = (a.title || '').toLowerCase()
      const bTitle = (b.title || '').toLowerCase()

      switch (sortOption) {
        case 'newest': return bDate.getTime() - aDate.getTime()
        case 'oldest': return aDate.getTime() - bDate.getTime()
        case 'title-asc': return aTitle.localeCompare(bTitle)
        case 'title-desc': return bTitle.localeCompare(aTitle)
        default: return 0
      }
    })

    return filtered
  }, [botMeetings, dateFilter, searchQuery, sortOption])

  // Filter and sort extension meetings
  const processedExtensionMeetings = useMemo(() => {
    let filtered = extensionMeetings.filter(m => {
      const createdAt = new Date(m.createdAt)
      const matchesDate = filterByDate(createdAt, dateFilter)
      const matchesSearch = searchQuery === '' ||
        (m.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.transcript || '').toLowerCase().includes(searchQuery.toLowerCase())
      return matchesDate && matchesSearch
    })

    // Sort
    filtered.sort((a, b) => {
      const aDate = new Date(a.createdAt)
      const bDate = new Date(b.createdAt)
      const aTitle = (a.title || '').toLowerCase()
      const bTitle = (b.title || '').toLowerCase()

      switch (sortOption) {
        case 'newest': return bDate.getTime() - aDate.getTime()
        case 'oldest': return aDate.getTime() - bDate.getTime()
        case 'title-asc': return aTitle.localeCompare(bTitle)
        case 'title-desc': return bTitle.localeCompare(aTitle)
        default: return 0
      }
    })

    return filtered
  }, [extensionMeetings, dateFilter, searchQuery, sortOption])

  const totalMeetings = botMeetings.length + extensionMeetings.length
  const hasActiveFilters = searchQuery !== '' || dateFilter !== 'all'

  // Determine which meetings to display based on "Show All" state
  const visibleBotMeetings = showAllBot ? processedBotMeetings : processedBotMeetings.slice(0, INITIAL_DISPLAY_COUNT)
  const visibleExtensionMeetings = showAllExtension ? processedExtensionMeetings : processedExtensionMeetings.slice(0, INITIAL_DISPLAY_COUNT)

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

  function clearFilters() {
    setSearchQuery('')
    setDateFilter('all')
  }

  const dateFilterLabels: Record<DateFilter, string> = {
    'all': 'All time',
    '7days': 'Last 7 days',
    '30days': 'Last 30 days',
    '90days': 'Last 90 days'
  }

  const sortLabels: Record<SortOption, string> = {
    'newest': 'Newest first',
    'oldest': 'Oldest first',
    'title-asc': 'Title A-Z',
    'title-desc': 'Title Z-A'
  }

  if (isLoading) return <div className="p-6">Loading…</div>
  if (!authUser) return <div className="p-6">Please sign in to view your meetings.</div>

  return (
    <AppShell
      title={
        <div className="flex items-center gap-3">
          <span>Meetings</span>
          <span className="text-sm font-normal text-muted-foreground">{totalMeetings} total</span>
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          {/* Filters Dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const dropdown = document.getElementById('filters-dropdown');
                if (dropdown) {
                  dropdown.classList.toggle('hidden');
                }
              }}
            >
              <SlidersHorizontal className="size-4" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {(searchQuery ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0)}
                </span>
              )}
            </Button>

            <div
              id="filters-dropdown"
              className="hidden absolute right-0 top-full mt-2 w-64 bg-white rounded-md border shadow-md z-50"
            >
              <div className="p-3">
                <h3 className="text-sm font-medium mb-2">Filter Meetings</h3>
                <div className="border-t my-2" />

                <div className="mb-3">
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-t my-2" />
                <div className="text-xs font-medium text-muted-foreground mb-2">Date Range</div>
                <div className="space-y-1">
                  {[
                    { value: 'all', label: 'All time' },
                    { value: '7days', label: 'Last 7 days' },
                    { value: '30days', label: 'Last 30 days' },
                    { value: '90days', label: 'Last 90 days' }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setDateFilter(option.value as DateFilter)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent",
                        dateFilter === option.value && "bg-accent font-medium"
                      )}
                    >
                      {dateFilter === option.value && <span className="mr-2">●</span>}
                      {option.label}
                    </button>
                  ))}
                </div>

                {hasActiveFilters && (
                  <>
                    <div className="border-t my-2" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="w-full h-8 text-xs"
                    >
                      Clear all filters
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const dropdown = document.getElementById('sort-dropdown');
                if (dropdown) {
                  dropdown.classList.toggle('hidden');
                }
              }}
            >
              <ArrowUpDown className="size-4" />
              Sort: {sortLabels[sortOption]}
            </Button>

            <div
              id="sort-dropdown"
              className="hidden absolute right-0 top-full mt-2 w-48 bg-white rounded-md border shadow-md z-50"
            >
              <div className="p-3">
                <h3 className="text-sm font-medium mb-2">Sort By</h3>
                <div className="border-t my-2" />
                <div className="space-y-1">
                  {[
                    { value: 'newest', label: 'Newest first' },
                    { value: 'oldest', label: 'Oldest first' },
                    { value: 'title-asc', label: 'Title A-Z' },
                    { value: 'title-desc', label: 'Title Z-A' }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setSortOption(option.value as SortOption)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent",
                        sortOption === option.value && "bg-accent font-medium"
                      )}
                    >
                      {sortOption === option.value && <span className="mr-2">●</span>}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="bot" className="flex-1 gap-2 whitespace-nowrap">
            <Bot className="size-4 shrink-0" />
            Bot Meetings
            {processedBotMeetings.length !== botMeetings.length && (
              <span className="text-xs text-muted-foreground">({processedBotMeetings.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="extension" className="flex-1 gap-2 whitespace-nowrap">
            <Chrome className="size-4 shrink-0" />
            Extension Meetings
            {processedExtensionMeetings.length !== extensionMeetings.length && (
              <span className="text-xs text-muted-foreground">({processedExtensionMeetings.length})</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bot" className="mt-6">
          {botLoading ? (
            <div className="text-sm text-muted-foreground animate-pulse">Loading bot meetings...</div>
          ) : processedBotMeetings.length === 0 ? (
            <div className="text-center py-16 rounded-3xl border border-dashed border-slate-200 bg-slate-50/50">
              <Bot className="size-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-base font-medium">
                {hasActiveFilters ? 'No meetings match your filters' : 'No bot meetings found'}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {hasActiveFilters ? 'Try adjusting your search or filters' : 'Start a bot meeting to get started'}
              </p>
              {hasActiveFilters ? (
                <Button onClick={clearFilters} variant="outline" className="mt-4">
                  Clear filters
                </Button>
              ) : (
                <Button onClick={handleStartBotMeeting} className="mt-4 gap-2">
                  <Bot className="size-4" /> Join Bot
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {visibleBotMeetings.map((meeting) => {
                const summary = botSummaries.find(s => s.meetingId === meeting.meetingId);
                const createdAt = new Date(((meeting as any).createdAtMs ?? (meeting as any).createdAt) as string);
                const status = (meeting as any).status?.toLowerCase?.();
                const isLiveMeeting = status === 'live' || status === 'bot_launched';
                const displayStatus = isLiveMeeting ? 'Live' : 'Completed';

                // Duration: prefer startTime/endTime, then totalDurationSeconds from analytics, then segment-based fallback
                let durationMins = 0;
                const startTime = (meeting as any).startTime ? new Date((meeting as any).startTime).getTime() : null;
                const endTime = (meeting as any).endTime ? new Date((meeting as any).endTime).getTime() : null;
                if (startTime && endTime && endTime > startTime) {
                  durationMins = Math.max(1, Math.round((endTime - startTime) / 60000));
                } else if (typeof (meeting as any).totalDurationSeconds === 'number' && (meeting as any).totalDurationSeconds > 0) {
                  durationMins = Math.max(1, Math.round((meeting as any).totalDurationSeconds / 60));
                } else if (meeting.segments?.length) {
                  const maxEnd = Math.max(...meeting.segments.map((s: any) => s.end || 0));
                  durationMins = maxEnd > 0 ? Math.max(1, Math.ceil(maxEnd / 60)) : 0;
                }
                if (durationMins === 0 && (summary || (meeting as any).segmentCount > 0)) durationMins = 1;

                const attendees = (meeting as any).totalSpeakers ?? (meeting.segments ? [...new Set(meeting.segments.map((s: any) => s.speaker))].length : 0);

                return (
                  <MeetingCard
                    key={meeting.meetingId}
                    title={meeting.title || `Meeting ${meeting.meetingId.substring(0, 8)}`}
                    time={createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    attendees={attendees}
                    duration={durationMins}
                    status={displayStatus}
                    onClick={() => window.location.href = `/transcripts?botId=${meeting.meetingId}`}
                    onActionClick={() => handleDeleteMeeting(meeting.meetingId, 'bot')}
                    onAskOnixClick={() => setAskOnixMeeting({ meetingId: meeting.meetingId, title: meeting.title || `Meeting ${meeting.meetingId.substring(0, 8)}` })}
                  />
                );
              })}

              {/* View All Button for Bot Meetings */}
              {processedBotMeetings.length > INITIAL_DISPLAY_COUNT && (
                <div className="flex justify-center mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllBot(!showAllBot)}
                    className="text-xs text-muted-foreground hover:text-foreground gap-1"
                  >
                    {showAllBot ? (
                      <>
                        <ChevronUp className="size-3" /> Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="size-3" /> View all ({processedBotMeetings.length})
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="extension" className="mt-6">
          {extensionLoading ? (
            <div className="text-sm text-muted-foreground animate-pulse">Loading extension meetings...</div>
          ) : processedExtensionMeetings.length === 0 ? (
            <div className="text-center py-16 rounded-3xl border border-dashed border-slate-200 bg-slate-50/50">
              <Chrome className="size-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-base font-medium">
                {hasActiveFilters ? 'No meetings match your filters' : 'No extension meetings found'}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {hasActiveFilters ? 'Try adjusting your search or filters' : 'Use the Chrome extension to record meetings'}
              </p>
              {hasActiveFilters ? (
                <Button onClick={clearFilters} variant="outline" className="mt-4">
                  Clear filters
                </Button>
              ) : (
                <Button onClick={handleStartMeeting} className="mt-4 gap-2">
                  <Chrome className="size-4" /> Start New
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {visibleExtensionMeetings.map((m) => {
                const extDuration = (() => {
                  const dur = (m as any).duration;
                  if (!dur) return 0;
                  if (typeof dur === 'string' && dur.includes(':')) {
                    const [mins, secs] = dur.split(':').map(Number);
                    return Math.max(1, Math.ceil((mins || 0) + (secs || 0) / 60));
                  }
                  const n = Number(dur);
                  return isFinite(n) ? Math.max(1, Math.ceil(n)) : 0;
                })();
                return (
                  <MeetingCard
                    key={m.id}
                    title={m.title || 'Untitled meeting'}
                    time={(() => {
                      const d = new Date(m.createdAt);
                      return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    })()}
                    attendees={0}
                    duration={extDuration}
                    status="Completed"
                    onClick={() => window.location.href = `/transcripts?extensionId=${m.id}`}
                    onActionClick={() => handleDeleteMeeting(m.id, 'extension')}
                    onAskOnixClick={() => setAskOnixMeeting({ meetingId: m.id, title: m.title || 'Untitled meeting' })}
                  />
                );
              })}

              {/* View All Button for Extension Meetings */}
              {processedExtensionMeetings.length > INITIAL_DISPLAY_COUNT && (
                <div className="flex justify-center mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllExtension(!showAllExtension)}
                    className="text-xs text-muted-foreground hover:text-foreground gap-1"
                  >
                    {showAllExtension ? (
                      <>
                        <ChevronUp className="size-3" /> Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="size-3" /> View all ({processedExtensionMeetings.length})
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Meeting URL Popup */}
      <MeetingUrlPopup
        isOpen={showBotPopup}
        onClose={() => setShowBotPopup(false)}
        onSuccess={handleBotSuccess}
      />

      {/* Ask Onix – Live Q&A per meeting */}
      <AskOnixPopup
        isOpen={askOnixMeeting !== null}
        onClose={() => setAskOnixMeeting(null)}
        meetingId={askOnixMeeting?.meetingId ?? ''}
        meetingTitle={askOnixMeeting?.title ?? ''}
      />
    </AppShell>
  )
}
