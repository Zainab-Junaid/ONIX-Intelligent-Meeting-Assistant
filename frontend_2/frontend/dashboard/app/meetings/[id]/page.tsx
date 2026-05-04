"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { useAuth } from "@/components/auth-provider"
import { useBotMeetings } from "@/hooks/use-bot-meetings"
import { useExtensionMeetings } from "@/hooks/use-extension-meetings"
import { SpeakerTranscript } from "@/components/speaker-transcript"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { 
  ChevronRight, 
  Download, 
  Trash2, 
  Edit2,
  Archive,
  Check,
  X,
  FileText,
  MessageSquare,
  Users,
  BarChart,
  ListTodo,
  ScrollText
} from "lucide-react"
import { io, Socket } from "socket.io-client"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import { toast } from "sonner"

export default function MeetingDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const { authUser, isLoading: authLoading } = useAuth()
  const { meetings: botMeetings, summaries: botSummaries, loading: botLoading, refetch: refetchBot } = useBotMeetings()
  const { meetings: extensionMeetings, loading: extensionLoading, refetch: refetchExt } = useExtensionMeetings()
  
  const [activeTab, setActiveTab] = useState("transcript")
  const [liveSegments, setLiveSegments] = useState<any[]>([])
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  // Identify meeting type and data
  const isBot = id.startsWith("bot_")
  const actualId = id.replace(/^(bot_|ext_)/, "")
  
  const meeting = useMemo(() => {
    if (isBot) {
      return botMeetings.find(m => m.meetingId === actualId)
    } else {
      return extensionMeetings.find(m => m.id === actualId)
    }
  }, [botMeetings, extensionMeetings, isBot, actualId])

  useEffect(() => {
    if (meeting && !isEditingName) {
      setTempName(meeting.title || (isBot ? `Bot Meeting ${actualId.substring(0, 8)}...` : 'Untitled meeting'))
    }
  }, [meeting, isEditingName, isBot, actualId])

  const summary = useMemo(() => {
    const found = botSummaries.find(s => s.meetingId === actualId)
    if (found) return found

    // Fallback: Dummy summary for ALL meetings as requested
    return {
      meetingId: actualId,
      summaryText: `**Executive Summary:**
This is a sample summary generated for demonstration purposes. The meeting covered key updates on the "Zainab-18" project roadmap, resource allocation, and risk mitigation strategies.

**Key Decisions:**
- Approved the new user interface design.
- Prioritized backend optimization tasks for the next sprint.
- Decided to conduct user testing with the new prototype next week.

**Action Items:**
- [ ] @Team to review the latest API specifications.
- [ ] @Design to finalize the icon set by Friday.
- [ ] @QA to prepare the test plan for the upcoming release.`,
      generatedAt: new Date().toISOString(),
      model: "demo-fallback"
    }
  }, [botSummaries, actualId])

  const [localSummary, setLocalSummary] = useState("")
  const [isSavingSummary, setIsSavingSummary] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize summary content
  useEffect(() => {
    if (summary?.summaryText && !localSummary) {
      setLocalSummary(summary.summaryText)
    }
  }, [summary, localSummary])

  const handleEditorChange = (content: string) => {
    setLocalSummary(content)
    
    // Debounced auto-save (every 2 seconds of inactivity)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSavingSummary(true)
      try {
        const token = await authUser?.getIdToken()
        await fetch('/api/meetings/update-summary', {
            method: 'PUT',
            headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            },
            body: JSON.stringify({
            meetingId: actualId,
            summaryText: content,
            }),
        })
        // Quietly saved
      } catch (error) {
        console.error("Auto-save failed", error)
      } finally {
        setIsSavingSummary(false)
      }
    }, 2000)
  }

  const handleDownloadPDF = async () => {
    if (!localSummary) {
        toast.error("No summary content to download")
        return
    }

    const toastId = toast.loading("Generating PDF...")
    try {
        const response = await fetch('/api/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: localSummary })
        })

        if (!response.ok) throw new Error('Failed to generate PDF')

        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `meeting-summary-${actualId}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success("PDF downloaded", { id: toastId })
    } catch (error) {
        console.error("PDF download error:", error)
        toast.error("Failed to download PDF", { id: toastId })
    }
  }

  const handleSaveName = async () => {
    if (!tempName.trim()) {
      toast.error("Meeting name cannot be empty")
      return
    }

    setIsSaving(true)
    try {
      const endpoint = isBot ? "/api/meeting-bot/meetings" : "/api/extension-meetings"
      const token = await authUser?.getIdToken()
      
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ meetingId: actualId, title: tempName }),
      })

      if (res.ok) {
        toast.success("Meeting renamed successfully")
        setIsEditingName(false)
        if (isBot) refetchBot()
        else refetchExt()
      } else {
        const error = await res.json()
        throw new Error(error.error || "Failed to rename meeting")
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsSaving(false)
    }
  }


  // Socket.IO for real-time updates (Bot only)
  useEffect(() => {
    if (!isBot || !actualId || !meeting) return

    setLiveSegments((meeting as any).segments || [])

    const socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001", {
      transports: ["websocket", "polling"],
    })

    socketRef.current = socket

    socket.on("connect", () => {
      socket.emit("join_meeting", actualId)
    })

    socket.on("transcript_update", (data: { meetingId: string; segments: any[] }) => {
      if (data.meetingId === actualId) {
        setLiveSegments(prev => {
          const segmentMap = new Map<string, any>()
          prev.forEach(seg => {
            const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}-${seg.text.substring(0, 30)}` : seg.text.substring(0, 50)
            segmentMap.set(key, seg)
          })
          data.segments.forEach(seg => {
            const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}-${seg.text.substring(0, 30)}` : seg.text.substring(0, 50)
            if (!segmentMap.has(key) || segmentMap.get(key).text !== seg.text) {
              segmentMap.set(key, seg)
            }
          })
          return Array.from(segmentMap.values()).sort((a, b) => (a.start || 0) - (b.start || 0))
        })
      }
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("leave_meeting", actualId)
        socketRef.current.disconnect()
      }
    }
  }, [isBot, actualId, meeting])

  if (authLoading || botLoading || extensionLoading) return <div className="p-6">Loading meeting details...</div>
  if (!authUser) return <div className="p-6">Please sign in to view this meeting.</div>
  if (!meeting) return <div className="p-6">Meeting not found.</div>

  const meetingTitle = meeting.title || (isBot ? `Bot Meeting ${actualId.substring(0, 8)}...` : 'Untitled meeting')
  const segments = isBot ? (liveSegments.length > 0 ? liveSegments : (meeting as any).segments || []) : []

  return (
    <AppShell
      title={
        <nav className="flex items-center text-sm font-normal text-muted-foreground mb-1" aria-label="Breadcrumb">
          <button onClick={() => router.push('/meetings')} className="hover:text-foreground transition-colors">My Meetings</button>
          <ChevronRight className="h-4 w-4 mx-1" />
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                autoFocus
                className="font-semibold text-foreground text-lg bg-transparent border-b border-primary outline-none px-1"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              />
              <button 
                onClick={handleSaveName} 
                disabled={isSaving}
                className="p-1 hover:text-green-600 transition-colors disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
              <button 
                onClick={() => setIsEditingName(false)}
                disabled={isSaving}
                className="p-1 hover:text-destructive transition-colors disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-lg">{meetingTitle}</span>
              <button 
                onClick={() => setIsEditingName(true)}
                className="p-1 text-muted-foreground hover:text-primary transition-colors translate-y-[1px]"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </nav>
      }
    >
      <div className="space-y-6">
        {/* Action Bar */}
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-4 text-sm font-medium">
            <button className="flex items-center gap-1.5 hover:text-primary transition-colors">
              <Download className="h-4 w-4" /> Export
            </button>
            <button className="flex items-center gap-1.5 hover:text-primary transition-colors">
              <Archive className="h-4 w-4" /> Archive
            </button>
            <button className="flex items-center gap-1.5 hover:text-destructive transition-colors">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>

        {/* Tabs Control */}
        <Tabs defaultValue="transcript" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-transparent h-auto p-0 gap-2 mb-6 border-b rounded-none w-full justify-start overflow-x-auto pb-1 no-scrollbar">
            <TabsTrigger 
              value="chats" 
              className="px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none whitespace-nowrap"
            >
              <MessageSquare className="h-4 w-4 mr-2" /> AI Chats
            </TabsTrigger>
            <TabsTrigger 
              value="transcript" 
              className="px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none whitespace-nowrap"
            >
              <FileText className="h-4 w-4 mr-2" /> Transcript
            </TabsTrigger>
            <TabsTrigger 
              value="summary" 
              className="px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none whitespace-nowrap"
            >
              <ScrollText className="h-4 w-4 mr-2" /> Summary
            </TabsTrigger>
            <TabsTrigger 
              value="actions" 
              className="px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none whitespace-nowrap"
            >
              <ListTodo className="h-4 w-4 mr-2" /> Action Items
            </TabsTrigger>
            <TabsTrigger 
              value="participants_stats" 
              className="px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none whitespace-nowrap"
            >
              <Users className="h-4 w-4 mr-2" /> Participants & Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chats" className="mt-0">
            <div className="rounded-xl border p-12 bg-white text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
              <h3 className="text-lg font-medium">AI Chats</h3>
              <p className="text-muted-foreground max-w-xs mx-auto mt-2">
                Interactive AI chat for your meeting insights is coming soon!
              </p>
            </div>
          </TabsContent>

          <TabsContent value="transcript" className="mt-0">
            <div className="rounded-xl border p-6 bg-white min-h-[400px]">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">
                  Meeting Transcript
                  {isBot && liveSegments.length > 0 && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 animate-pulse">
                      ● Live
                    </span>
                  )}
                </h3>
                {isBot && (
                  <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                    {segments.length} segments • {[...new Set(segments.map((s: any) => s.speaker))].length} speakers
                  </div>
                )}
              </div>
              {isBot ? (
                <SpeakerTranscript segments={segments} />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {(meeting as any).transcript || "No transcript available."}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="summary" className="mt-0">
            <div className="rounded-xl border p-6 bg-white min-h-[400px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">AI Summary</h3>
                <div className="flex items-center gap-2">
                    {isSavingSummary && (
                        <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>
                    )}
                    <Button 
                        onClick={handleDownloadPDF} 
                        size="sm" 
                        variant="outline"
                        disabled={!localSummary}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                    </Button>
                </div>
              </div>
              
              <div className="min-h-[400px]">
                <RichTextEditor 
                  content={localSummary} 
                  onChange={handleEditorChange}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="actions" className="mt-0">
            <div className="rounded-xl border p-6 bg-white min-h-[400px]">
              <h3 className="text-lg font-semibold mb-4">Action Items</h3>
              <div className="text-center py-12 text-muted-foreground">
                <ListTodo className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No action items extracted for this meeting yet.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="participants_stats" className="mt-0">
            <div className="rounded-xl border p-12 bg-white text-center min-h-[400px] flex flex-col items-center justify-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
              <h3 className="text-lg font-medium">Participants & Stats</h3>
              <p className="text-muted-foreground max-w-xs mx-auto mt-2">
                Participant engagement and meeting statistics will appear here.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
