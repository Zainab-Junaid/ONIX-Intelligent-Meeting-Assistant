"use client"

import { useState, useMemo } from 'react'
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/components/auth-provider"
import { useBotMeetings } from "@/hooks/use-bot-meetings"
import { useExtensionMeetings } from "@/hooks/use-extension-meetings"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Calendar, SlidersHorizontal, X, ArrowUpDown, Check, Bot, Chrome } from "lucide-react"

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
  const [filterName, setFilterName] = useState("")
  const [filterDate, setFilterDate] = useState("")
  const [sortOption, setSortOption] = useState<"newest" | "oldest" | "shortest" | "longest">("newest")

  // Bot meetings hook
  const { meetings: botMeetings, summaries: botSummaries, loading: botLoading, refetch: refetchBotMeetings } = useBotMeetings()

  // Extension meetings hook
  const { meetings: extensionMeetings, loading: extensionLoading, refetch: refetchExtensionMeetings } = useExtensionMeetings()

  // Helper to parse duration string (e.g., "5:20" or "10") to minutes
  const parseDuration = (duration?: string) => {
    if (!duration) return 0;
    if (duration.includes(':')) {
      const [m, s] = duration.split(':').map(Number);
      return m + (s / 60);
    }
    return Number(duration);
  };

  // Helper to get bot meeting duration in minutes
  const getBotDuration = (meeting: any) => {
    const segments = meeting.segments || [];
    if (segments.length === 0) return 0;
    const maxEndSec = Math.max(...segments.map((s: any) => s.end || 0));
    return maxEndSec / 60;
  };

  // Helper to get a stable Date object from a meeting
  const getMeetingDate = (meeting: any) => {
    const raw = meeting.createdAtMs ?? meeting.createdAt;
    if (!raw) return new Date(0);
    
    // If it's a numeric string, convert to number
    const isNumericString = typeof raw === 'string' && /^\d+$/.test(raw);
    const numericRaw = isNumericString ? Number(raw) : raw;
    
    const d = new Date(numericRaw);
    return isNaN(d.getTime()) ? new Date(0) : d;
  };

  // Filter and Sort logic
  const filteredAndSortedExtensionMeetings = useMemo(() => {
    const searchTerm = filterName.trim().toLowerCase();
    
    let filtered = extensionMeetings.filter(m => {
      const title = (m.title || 'Untitled meeting').toLowerCase();
      const nameMatch = !searchTerm || title.includes(searchTerm);
      
      let dateMatch = true;
      if (filterDate) {
        const d = getMeetingDate(m);
        // Use Asia/Karachi to match the user's context for date comparisons
        const meetingDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
        dateMatch = meetingDate === filterDate;
      }
      
      return nameMatch && dateMatch;
    });

    return [...filtered].sort((a, b) => {
      if (sortOption === "newest") return getMeetingDate(b).getTime() - getMeetingDate(a).getTime();
      if (sortOption === "oldest") return getMeetingDate(a).getTime() - getMeetingDate(b).getTime();
      if (sortOption === "shortest") return parseDuration(a.duration) - parseDuration(b.duration);
      if (sortOption === "longest") return parseDuration(b.duration) - parseDuration(a.duration);
      return 0;
    });
  }, [extensionMeetings, filterName, filterDate, sortOption]);

  const filteredAndSortedBotMeetings = useMemo(() => {
    const searchTerm = filterName.trim().toLowerCase();

    let filtered = botMeetings.filter(m => {
      const title = (m.title || `Bot Meeting ${m.meetingId.substring(0, 8)}...`).toLowerCase();
      const nameMatch = !searchTerm || title.includes(searchTerm);
      
      let dateMatch = true;
      if (filterDate) {
        const d = getMeetingDate(m);
        const meetingDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
        dateMatch = meetingDate === filterDate;
      }
      
      return nameMatch && dateMatch;
    });

    return [...filtered].sort((a, b) => {
      if (sortOption === "newest") return getMeetingDate(b).getTime() - getMeetingDate(a).getTime();
      if (sortOption === "oldest") return getMeetingDate(a).getTime() - getMeetingDate(b).getTime();
      if (sortOption === "shortest") return getBotDuration(a) - getBotDuration(b);
      if (sortOption === "longest") return getBotDuration(b) - getBotDuration(a);
      return 0;
    });
  }, [botMeetings, filterName, filterDate, sortOption]);

  if (isLoading) return <div className="p-6 text-center text-muted-foreground">Loading authentication...</div>
  if (!authUser) return <div className="p-6 text-center text-muted-foreground">Please sign in to view your meetings.</div>

  return (
    <AppShell
      title={
        <div className="flex items-baseline gap-2">
          <span>Meetings</span>
          <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {botMeetings.length + extensionMeetings.length} total
          </span>
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="relative">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Filters
                {(filterName || filterDate) && (
                  <span className="absolute -right-1 -top-1 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Filter Meetings</h4>
                  <p className="text-sm text-muted-foreground">
                    Search by name or filter by creation date.
                  </p>
                </div>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input 
                        placeholder="Search by name..." 
                        value={filterName}
                        onChange={(e) => setFilterName(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input 
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  {(filterName || filterDate) && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => { setFilterName(""); setFilterDate(""); }}
                      className="w-full justify-center text-muted-foreground"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Clear all filters
                    </Button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowUpDown className="mr-2 h-4 w-4" />
                Sort: {sortOption === "newest" ? "Newest first" : 
                        sortOption === "oldest" ? "Oldest first" :
                        sortOption === "shortest" ? "Shortest first" : "Longest first"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setSortOption("newest")} className="justify-between">
                Newest first {sortOption === "newest" && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOption("oldest")} className="justify-between">
                Oldest first {sortOption === "oldest" && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOption("shortest")} className="justify-between">
                Shortest first {sortOption === "shortest" && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOption("longest")} className="justify-between">
                Longest first {sortOption === "longest" && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Active filter tags */}
        {(filterName || filterDate) && (
          <div className="flex gap-2">
            {filterName && (
              <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
                <span className="text-muted-foreground">Name:</span> {filterName}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-foreground" 
                  onClick={() => setFilterName("")} 
                />
              </div>
            )}
            {filterDate && (
              <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
                <span className="text-muted-foreground">Date:</span> {filterDate}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-foreground" 
                  onClick={() => setFilterDate("")} 
                />
              </div>
            )}
          </div>
        )}

        <Tabs defaultValue="bot" className="w-full">
          <TabsList className="bg-transparent h-auto p-0 gap-2 mb-6 border-b rounded-none w-full justify-start">
            <TabsTrigger 
              value="bot" 
              className="px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none"
            >
              <Bot className="h-4 w-4 mr-2" /> Bot Meetings
            </TabsTrigger>
            <TabsTrigger 
              value="extension" 
              className="px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none"
            >
              <Chrome className="h-4 w-4 mr-2" /> Extension Meetings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bot" className="space-y-3 mt-0">
            {botLoading && (
              <div className="text-sm text-muted-foreground py-12 text-center">Loading bot meetings...</div>
            )}
            <div className="grid gap-3">
              {filteredAndSortedBotMeetings.map((meeting) => (
                <a key={meeting.meetingId} href={`/meetings/bot_${meeting.meetingId}`} className="rounded-lg border p-4 hover:bg-muted/40 transition-colors block bg-white">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{meeting.title || `Bot Meeting ${meeting.meetingId.substring(0, 8)}...`}</div>
                    <div className="text-sm text-muted-foreground">
                      {(() => {
                        const d = getMeetingDate(meeting);
                        return d.toLocaleString('en-US', {
                          timeZone: 'Asia/Karachi',
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

                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    <span>⏱️ {(() => {
                      const segments = meeting.segments || [];
                      if (segments.length === 0) return '0';
                      const maxEndSec = Math.max(...segments.map(s => s.end || 0));
                      const mins = Math.ceil(maxEndSec / 60);
                      return mins || '< 1';
                    })()} min</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">👥 {meeting.segments ? [...new Set(meeting.segments.map(s => s.speaker))].length : 0} speakers</span>
                  </div>
                </a>
              ))}
              {!botLoading && filteredAndSortedBotMeetings.length === 0 && (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg bg-white/50">
                  {filterName || filterDate ? "No meetings match your filters." : "No bot meetings yet. Start a bot meeting to begin capturing."}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="extension" className="space-y-3 mt-0">
            {extensionLoading && (
              <div className="text-sm text-muted-foreground py-12 text-center">Loading extension meetings...</div>
            )}
            <div className="grid gap-3">
              {filteredAndSortedExtensionMeetings.map((m) => (
                <a key={m.id} href={`/meetings/ext_${m.id}`} className="rounded-lg border p-4 hover:bg-muted/40 transition-colors block bg-white">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{m.title || 'Untitled meeting'}</div>
                    <div className="text-sm text-muted-foreground">
                      {(() => {
                        const d = getMeetingDate(m);
                        return d.toLocaleString('en-US', {
                          timeZone: 'Asia/Karachi',
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
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    {m.duration && (
                      <span className="flex items-center gap-1">⏱️ {m.duration}</span>
                    )}
                  </div>
                </a>
              ))}
              {!extensionLoading && filteredAndSortedExtensionMeetings.length === 0 && (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg bg-white/50">
                  {filterName || filterDate ? "No meetings match your filters." : "No extension meetings yet. Use the extension to start transcribing meetings."}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
