"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Bot, CalendarPlus, Video, BarChart3, FileText, CheckSquare, Sparkles, ClipboardList, ChevronRight, Users } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { useBotMeetings } from "@/hooks/use-bot-meetings"
import { useExtensionMeetings } from "@/hooks/use-extension-meetings"
import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { UpcomingMeetingsCard } from "@/components/upcoming-meetings-card"
import { StartMeetingModal } from "@/components/start-meeting-modal"
import { DarkModeToggle } from "@/components/dark-mode-toggle"
import { useState } from "react"

export default function Page() {
    const { authUser } = useAuth()
    const { summaries: botMeetings, meetings: botDetailedMeetings } = useBotMeetings()
    const { meetings: extensionMeetings } = useExtensionMeetings()
    const [isStartMeetingOpen, setIsStartMeetingOpen] = useState(false)
    const [startMeetingTab, setStartMeetingTab] = useState<'selection' | 'bot'>('selection')

    const getGreeting = () => {
        const hour = new Date().getHours()
        if (hour < 12) return "Good morning"
        if (hour < 18) return "Good afternoon"
        return "Good evening"
    }

    const firstName = authUser?.displayName?.split(' ')[0] || 'there'

    const dashboardData = useMemo(() => {
        // 1. Calculate Total Tasks & Recent Action Item
        let totalTasks = 0
        let allActionItems: { text: string; date: Date }[] = []

        // Helper function to extract action items from text
        const extractActionItems = (text: string) => {
            // potential headers for action items
            const headers = ["Action Items", "Next Steps", "To-Do", "Tasks", "Follow-up"];
            const lowerText = text.toLowerCase();

            let startIndex = -1;
            for (const header of headers) {
                const idx = lowerText.indexOf(header.toLowerCase());
                if (idx !== -1) {
                    startIndex = idx;
                    break;
                }
            }

            if (startIndex === -1) return [];

            // Get text after the header
            const sectionText = text.substring(startIndex);
            // Stop at the next double newline or distinct section header if possible
            // specific regex to find bullet points in this section
            const bulletPoints = sectionText.match(/^[•\-\*]\s+(.*)$/gm);

            if (!bulletPoints) return [];

            // Filter out "empty" or "no action" placeholders
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

            return bulletPoints.filter(bp => {
                const cleanText = bp.replace(/^[•\-\*]\s+/, "").toLowerCase();
                return !negativePhrases.some(phrase => cleanText.includes(phrase));
            });
        }

        botMeetings.forEach((m: any) => {
            const summary = m.summaryText || ""
            // First try to find explicit Action Items section
            let actionItems = extractActionItems(summary);

            // Fallback: If no section found but summary exists, check if the ENTIRE summary is very short (likely just action items) 
            // or just strict parsing if needed. 
            // For now, if no explicit section, we assume NO action items to be safe and "real".

            if (actionItems.length > 0) {
                totalTasks += actionItems.length
                actionItems.forEach((bp: string) => {
                    allActionItems.push({
                        text: bp.replace(/^[•\-\*]\s+/, "").trim(),
                        date: new Date(m.generatedAtMs || m.generatedAt)
                    })
                })
            }
        })

        extensionMeetings.forEach((m: any) => {
            if (m.actionItems && m.actionItems.length > 0) {
                // Filter extension action items
                const realActionItems = m.actionItems.filter((ai: any) => {
                    const text = typeof ai === 'string' ? ai : ai.text || "";
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
                    const cleanText = text.toLowerCase();
                    return !negativePhrases.some(phrase => cleanText.includes(phrase)) && text.length > 5;
                });

                if (realActionItems.length > 0) {
                    totalTasks += realActionItems.length;
                    realActionItems.forEach((ai: any) => {
                        allActionItems.push({
                            text: typeof ai === 'string' ? ai : ai.text || "",
                            date: new Date(m.createdAt)
                        })
                    });
                }
            }
        })

        const mostRecentActionItem = allActionItems
            .sort((a, b) => b.date.getTime() - a.date.getTime())[0]?.text || null

        // 2. Combine and Sort Recent Transcripts
        const recentTranscripts = [
            ...botMeetings.map((m: any) => ({
                id: m.meetingId,
                title: m.title || `Meeting ${m.meetingId.substring(0, 8)}`,
                date: new Date(m.generatedAtMs || m.generatedAt),
                type: 'bot' as const,
                link: `/transcripts?botId=${m.meetingId}`
            })),
            ...extensionMeetings.map((m: any) => ({
                id: m.id,
                title: m.title || 'Untitled meeting',
                date: new Date(m.createdAt),
                type: 'extension' as const,
                link: `/transcripts?extensionId=${m.id}`
            }))
        ].sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, 4)



        // 4. Total Meetings Count
        const totalMeetings = botMeetings.length + extensionMeetings.length

        return {
            totalTasks,
            mostRecentActionItem,
            recentTranscripts,

            totalMeetings
        }
    }, [botMeetings, botDetailedMeetings, extensionMeetings, firstName])

    return (
        <AppShell
            title={
                <div className="flex items-center gap-2 font-semibold tracking-tight">
                    <span className="text-blue-600">
                        {getGreeting()},
                    </span>
                    <span className="text-blue-600">
                        {firstName}
                    </span>
                </div>
            }
            subtitle="Here's what's happening with your meetings."
            actions={<DarkModeToggle />}
        >
            <div className="space-y-12">
                {/* TOP SECTION: UPCOMING, QUICK ACTIONS, KEY METRICS */}
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* 1. UPCOMING MEETINGS */}
                    <UpcomingMeetingsCard />

                    {/* 2. QUICK ACTIONS */}
                    <Card className="rounded-[32px] border-slate-100 shadow-sm bg-gradient-to-br from-white to-blue-50/50 overflow-hidden flex flex-col h-full transition-all duration-300">
                        <CardContent className="p-8 flex-1 flex flex-col justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-2">Quick Actions</h3>
                                <p className="text-sm text-slate-500">Start or schedule a meeting instantly.</p>
                            </div>

                            <div className="space-y-3 mt-6">
                                <Button size="lg" className="w-full rounded-2xl font-semibold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 h-14 text-base" onClick={() => { setStartMeetingTab('selection'); setIsStartMeetingOpen(true); }}>
                                    <Video className="mr-2 size-5" /> Start New Meeting
                                </Button>
                                <Button size="lg" variant="outline" className="w-full rounded-2xl font-semibold border-slate-200 text-slate-700 hover:bg-white hover:text-blue-600 hover:border-blue-200 h-14 text-base shadow-sm transition-all" asChild>
                                    <Link href="/schedule">
                                        <CalendarPlus className="mr-2 size-5" /> Schedule Meeting
                                    </Link>
                                </Button>
                                <Button size="sm" variant="ghost" className="w-full rounded-xl font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 h-10 text-sm transition-all" onClick={() => { setStartMeetingTab('bot'); setIsStartMeetingOpen(true); }}>
                                    <Bot className="mr-2 size-4" /> Join with Bot
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 3. KEY METRICS */}
                    <Card className="rounded-[32px] border-slate-100 shadow-sm bg-white overflow-hidden flex flex-col h-full hover:shadow-md transition-all duration-300">
                        <CardContent className="p-8 flex-1 flex flex-col justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-2">At a Glance</h3>
                                <p className="text-sm text-slate-500">Your meeting activity summary.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-6">
                                <div className="bg-blue-50/50 border border-blue-100 rounded-3xl p-5 flex flex-col justify-center transition-all hover:bg-blue-50 hover:scale-[1.02]">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="size-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                                            <CheckSquare className="size-4" />
                                        </div>
                                    </div>
                                    <div className="text-3xl font-bold text-slate-900 mb-1 leading-none">{dashboardData.totalTasks}</div>
                                    <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Action Items</div>
                                </div>
                                <div className="bg-indigo-50/50 border border-indigo-100 rounded-3xl p-5 flex flex-col justify-center transition-all hover:bg-indigo-50 hover:scale-[1.02]">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="size-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                            <Video className="size-4" />
                                        </div>
                                    </div>
                                    <div className="text-3xl font-bold text-slate-900 mb-1 leading-none">{dashboardData.totalMeetings}</div>
                                    <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Total Meetings</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* MAIN CONTENT GRID */}
                <div className="grid gap-8 lg:grid-cols-3 items-start">

                    {/* LEFT COLUMN (2/3): RECENT TRANSCRIPTS */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                Recent Transcripts
                                <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    Last 4
                                </span>
                            </h3>
                            <Link href="/transcripts" className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1">
                                View All <ChevronRight className="size-4" />
                            </Link>
                        </div>

                        <Card className="rounded-[32px] border-slate-100 shadow-sm bg-white overflow-hidden">
                            <CardContent className="p-0">
                                {dashboardData.recentTranscripts.length > 0 ? (
                                    <div className="divide-y divide-slate-50">
                                        {dashboardData.recentTranscripts.map((t, i) => (
                                            <Link key={`${t.type}-${t.id}-${i}`} href={t.link} className="flex items-center p-6 hover:bg-slate-50/50 transition-all group relative overflow-hidden">
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />

                                                <div className="size-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mr-5 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-blue-200 transition-all duration-300">
                                                    {t.type === 'bot' ? <Bot size={24} /> : <FileText size={24} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-slate-900 text-lg mb-1 truncate group-hover:text-blue-600 transition-colors">
                                                        {t.title}
                                                    </h4>
                                                    <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                                                        <span>{t.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                        <span className="size-1 rounded-full bg-slate-300"></span>
                                                        <span>{t.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                                                        <span className="size-1 rounded-full bg-slate-300"></span>
                                                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                                            t.type === 'bot' ? "bg-blue-100 text-blue-600" : "bg-blue-50 text-blue-600"
                                                        )}>
                                                            {t.type === 'bot' ? 'Bot' : 'Extension'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="size-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 opacity-0 group-hover:opacity-100 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all transform translate-x-4 group-hover:translate-x-0">
                                                    <ChevronRight className="size-5" />
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-16 text-center flex flex-col items-center justify-center">
                                        <div className="size-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-6 relative">
                                            <FileText size={40} />
                                            <div className="absolute -bottom-1 -right-1 size-8 bg-white rounded-full flex items-center justify-center border-2 border-slate-50 text-blue-500">
                                                <Sparkles size={16} />
                                            </div>
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 mb-2">No transcripts yet</h3>
                                        <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6">
                                            Start a meeting to see your summaries and transcripts here. They'll appear automatically.
                                        </p>
                                        <Button variant="outline" size="sm" className="rounded-xl" asChild>
                                            <a href="https://meet.new" target="_blank" rel="noopener noreferrer">
                                                Start a test meeting
                                            </a>
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT COLUMN (1/3): WIDGET STACK */}
                    <div className="space-y-6">

                        {/* PENDING TASKS */}
                        <Link href="/tasks" className="block group">
                            <Card className="rounded-[32px] border-slate-100 shadow-sm bg-white overflow-hidden hover:shadow-lg transition-all duration-300 group-hover:-translate-y-1">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="size-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 shadow-sm group-hover:scale-110 transition-transform">
                                                <CheckSquare size={20} />
                                            </div>
                                            <h3 className="font-bold text-slate-900">Pending Tasks</h3>
                                        </div>
                                        <span className="text-2xl font-bold text-slate-900 group-hover:text-green-600 transition-colors">{dashboardData.totalTasks}</span>
                                    </div>

                                    <div className="space-y-4">
                                        {dashboardData.mostRecentActionItem ? (
                                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 relative group-hover:bg-green-50/30 group-hover:border-green-100 transition-colors">
                                                <div className="absolute top-0 right-0 -mt-2 -mr-2 bg-white shadow-sm border border-slate-100 rounded-lg px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                    New
                                                </div>
                                                <p className="text-sm font-medium text-slate-700 line-clamp-2 leading-relaxed">
                                                    "{dashboardData.mostRecentActionItem}"
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-50 p-4 rounded-2xl border border-dashed border-slate-200 text-center">
                                                <p className="text-xs text-slate-400 italic">No pending tasks</p>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-end">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-green-600 transition-colors flex items-center gap-1">
                                                Review All <ChevronRight size={14} strokeWidth={3} />
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>



                        {/* ASK AI */}
                        <Link href="/search" className="block group">
                            <Card className="rounded-[32px] border-slate-100 shadow-sm bg-gradient-to-br from-blue-600 to-indigo-600 text-white overflow-hidden hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300 group-hover:scale-[1.02]">
                                <CardContent className="p-6 relative overflow-hidden">
                                    {/* Decorative circles */}
                                    <div className="absolute top-0 right-0 -mt-10 -mr-10 size-32 bg-white/10 rounded-full blur-2xl" />
                                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 size-32 bg-blue-400/20 rounded-full blur-2xl" />

                                    <Sparkles className="absolute top-6 right-6 text-white/20 size-8 animate-pulse" />

                                    <div className="relative z-10">
                                        <div className="size-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-white mb-4 shadow-inner ring-1 ring-white/20">
                                            <Bot size={20} />
                                        </div>
                                        <h3 className="font-bold text-lg mb-1">Ask AI</h3>
                                        <p className="text-blue-100 text-xs mb-5">Uncover insights from your meeting history.</p>

                                        <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 text-xs font-medium text-white/90 border border-white/10 group-hover:bg-white/20 transition-colors flex items-center justify-between">
                                            <span>"What did we decide?"</span>
                                            <ChevronRight className="size-3 opacity-60" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>

                    </div>
                </div>
            </div>

            <StartMeetingModal
                isOpen={isStartMeetingOpen}
                onClose={() => setIsStartMeetingOpen(false)}
                defaultTab={startMeetingTab}
                key={startMeetingTab + (isStartMeetingOpen ? 'open' : 'closed')}
            />
        </AppShell>
    )
}
