"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Bot, CalendarPlus, Video, FileText, CheckSquare, ChevronRight, Mic, ArrowUpRight, ListTodo, Circle } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { useBotMeetings } from "@/hooks/use-bot-meetings"
import { useExtensionMeetings } from "@/hooks/use-extension-meetings"
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { UpcomingMeetingsCard } from "@/components/upcoming-meetings-card"


const StartMeetingModal = dynamic(
  () => import("@/components/start-meeting-modal").then((m) => ({ default: m.StartMeetingModal })),
  { ssr: false }
)

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

        const sortedActionItems = [...allActionItems].sort((a, b) => b.date.getTime() - a.date.getTime())
        const mostRecentActionItem = sortedActionItems[0]?.text || null
        const recentActionItems = sortedActionItems.slice(0, 3)

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
            recentActionItems,
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
        >
            <div className="space-y-8">
                {/* TOP SECTION: UPCOMING, QUICK ACTIONS, AT A GLANCE - equal height */}
                <div className="grid gap-5 lg:grid-cols-3 lg:gap-6 items-stretch">
                    <UpcomingMeetingsCard />

                    <Card className="rounded-2xl shadow-sm overflow-hidden h-full min-h-[220px] flex flex-col">
                        <CardContent className="p-4 flex flex-col flex-1 min-h-0">
                            <h3 className="text-base font-semibold text-foreground mb-3 shrink-0">Quick Actions</h3>
                            <div className="grid grid-cols-2 gap-2 flex-1 min-h-0 content-start">
                                <button
                                    type="button"
                                    onClick={() => { setStartMeetingTab('selection'); setIsStartMeetingOpen(true); }}
                                    className="flex flex-col items-center justify-center gap-1 py-2.5 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors"
                                >
                                    <Video className="size-5" />
                                    <span className="text-xs font-medium">New Meeting</span>
                                </button>
                                <Link
                                    href="/schedule"
                                    className="flex flex-col items-center justify-center gap-1 py-2.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                                >
                                    <CalendarPlus className="size-5" />
                                    <span className="text-xs font-medium">Schedule</span>
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => { setStartMeetingTab('bot'); setIsStartMeetingOpen(true); }}
                                    className="flex flex-col items-center justify-center gap-1 py-2.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                                >
                                    <Bot className="size-5" />
                                    <span className="text-xs font-medium">Join Bot</span>
                                </button>
                                <a
                                    href="https://meet.new"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col items-center justify-center gap-1 py-2.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                                >
                                    <Mic className="size-5" />
                                    <span className="text-xs font-medium">Record</span>
                                </a>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl shadow-sm overflow-hidden h-full min-h-[220px] flex flex-col">
                        <CardContent className="p-4 flex flex-col flex-1 min-h-0">
                            <h3 className="text-base font-semibold text-foreground mb-3 shrink-0">At a Glance</h3>
                            <div className="grid grid-cols-2 gap-3 flex-1 min-h-0 content-start">
                                <Link href="/tasks" className="group flex flex-col rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-800/50 p-4 min-h-[100px] transition-all duration-200 shadow-[0_2px_12px_rgba(14,165,233,0.12)] hover:shadow-[0_4px_16px_rgba(14,165,233,0.18)] hover:bg-sky-100/80 dark:hover:bg-sky-900/40 dark:shadow-[0_2px_12px_rgba(14,165,233,0.15)] dark:hover:shadow-[0_4px_16px_rgba(14,165,233,0.22)]">
                                    <div className="text-base font-bold text-foreground">Action Items</div>
                                    <div className="text-xs text-foreground/80 mt-0.5">Tasks from your meetings.</div>
                                    <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                                        <span className="text-2xl font-bold text-foreground tabular-nums">{dashboardData.totalTasks}</span>
                                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity group-hover:opacity-90">
                                            <ArrowUpRight className="size-3" />
                                        </span>
                                    </div>
                                </Link>
                                <Link href="/meetings" className="group flex flex-col rounded-2xl bg-blue-100/80 dark:bg-blue-900/40 border border-blue-200/70 dark:border-blue-800/50 p-4 min-h-[100px] transition-all duration-200 shadow-[0_2px_12px_rgba(59,130,246,0.15)] hover:shadow-[0_4px_16px_rgba(59,130,246,0.22)] hover:bg-blue-200/80 dark:hover:bg-blue-800/50 dark:shadow-[0_2px_12px_rgba(59,130,246,0.2)] dark:hover:shadow-[0_4px_16px_rgba(59,130,246,0.28)]">
                                    <div className="text-base font-bold text-foreground">Total Meetings</div>
                                    <div className="text-xs text-foreground/80 mt-0.5">All your meetings.</div>
                                    <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                                        <span className="text-2xl font-bold text-foreground tabular-nums">{dashboardData.totalMeetings}</span>
                                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity group-hover:opacity-90">
                                            <ArrowUpRight className="size-3" />
                                        </span>
                                    </div>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* MAIN CONTENT GRID */}
                <div className="grid gap-6 lg:grid-cols-3 items-start">
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                Recent Transcripts
                                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Last 4</span>
                            </h3>
                            <Link href="/transcripts" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1">
                                View all <ChevronRight className="size-4" />
                            </Link>
                        </div>

                        <Card className="rounded-2xl shadow-sm overflow-hidden max-h-[340px] flex flex-col">
                            <CardContent className="p-0 flex flex-col min-h-0">
                                {dashboardData.recentTranscripts.length > 0 ? (
                                    <div className="divide-y divide-border overflow-y-auto min-h-0 max-h-[300px]">
                                        {dashboardData.recentTranscripts.map((t) => (
                                            <Link key={t.id} href={t.link} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors group border-b border-border last:border-0">
                                                <div className="size-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                    {t.type === 'bot' ? <Bot size={20} /> : <FileText size={20} />}
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                    <h4 className="font-semibold text-foreground text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                                        {t.title}
                                                    </h4>
                                                    <div className="text-xs text-muted-foreground">
                                                        <span>{t.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                        <span> · </span>
                                                        <span>{t.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center",
                                                        t.type === 'bot' ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground"
                                                    )}>
                                                        {t.type === 'bot' ? 'Bot' : 'Extension'}
                                                    </span>
                                                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-blue-500" />
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-12 px-6 text-center">
                                        <div className="size-14 bg-muted rounded-xl flex items-center justify-center text-muted-foreground mx-auto mb-4">
                                            <FileText size={28} />
                                        </div>
                                        <h3 className="font-semibold text-foreground mb-1">No transcripts yet</h3>
                                        <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-4">
                                            Start a meeting to see summaries and transcripts here.
                                        </p>
                                        <Button variant="outline" size="sm" className="rounded-lg" asChild>
                                            <a href="https://meet.new" target="_blank" rel="noopener noreferrer">
                                                Start a test meeting
                                            </a>
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-5">
                        <Link href="/tasks" className="block group">
                            <Card className="rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-all flex flex-col max-h-[280px]">
                                <CardContent className="p-4 flex flex-col flex-1 min-h-0">
                                    <div className="flex items-center justify-between mb-2 shrink-0">
                                        <div className="flex items-center gap-2.5">
                                            <div className="size-9 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                                <ListTodo size={18} />
                                            </div>
                                            <h3 className="font-semibold text-foreground">Pending Tasks</h3>
                                        </div>
                                        <span className="min-w-[1.75rem] rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-200 text-sm font-semibold tabular-nums text-center px-2 py-0.5">
                                            {dashboardData.totalTasks}
                                        </span>
                                    </div>
                                    {dashboardData.recentActionItems.length > 0 ? (
                                        <ul className="space-y-0.5 flex-1 min-h-0 overflow-hidden mb-2">
                                            {dashboardData.recentActionItems.map((item, i) => (
                                                <li key={i} className="flex items-start gap-2 py-1 px-2 -mx-2 rounded-lg group-hover:bg-muted/50 transition-colors">
                                                    <Circle className="size-4 shrink-0 text-muted-foreground/50 mt-0.5" strokeWidth={2} />
                                                    <span className="text-sm text-muted-foreground line-clamp-2 break-words flex-1 min-w-0">{item.text}</span>
                                                    {i === 0 && (
                                                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 rounded px-1.5 py-0.5">New</span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-muted-foreground italic mb-2 flex-1 min-h-0">No pending tasks</p>
                                    )}
                                    <div className="flex items-center justify-between pt-2 border-t border-border/60 shrink-0">
                                        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-1">
                                            Review all <ChevronRight className="size-3.5" />
                                        </span>
                                        <span className="flex size-9 items-center justify-center rounded-full bg-foreground text-background group-hover:opacity-90 transition-colors shrink-0">
                                            <ArrowUpRight className="size-4" />
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>

                        <Link href="/search" className="block group outline-none focus-visible:outline-none focus-visible:ring-0">
                            <Card className="rounded-2xl !border-0 border-transparent shadow-md overflow-hidden flex flex-col max-h-[240px] bg-gradient-to-br from-sky-100 via-blue-100 to-blue-200/90 dark:from-sky-900/90 dark:via-blue-900/85 dark:to-indigo-900/90 hover:shadow-lg transition-all duration-300 outline-none ring-0">
                                <CardContent className="p-4 relative flex flex-col flex-1 min-h-0">
                                    {/* Lighter blue merged orbs */}
                                    <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                                        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-sky-300/35 dark:bg-sky-500/25 blur-3xl animate-[ask-ai-glow_6s_ease-in-out_infinite]" />
                                        <div className="absolute top-1/2 -left-6 w-28 h-28 rounded-full bg-blue-300/30 dark:bg-blue-500/20 blur-3xl" />
                                        <div className="absolute -bottom-4 right-1/3 w-24 h-24 rounded-full bg-sky-400/25 dark:bg-sky-600/20 blur-3xl animate-[ask-ai-glow_8s_ease-in-out_infinite_0.5s]" />
                                    </div>
                                    <div className="relative z-10 flex items-start gap-2.5">
                                        <div className="flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400">
                                            <Bot size={20} />
                                        </div>
                                        <div className="min-w-0 flex-1 min-h-0">
                                            <h3 className="font-semibold text-blue-900 dark:text-white text-sm mb-0.5">Ask AI</h3>
                                            <p className="text-blue-700/80 dark:text-white/70 text-xs mb-1.5">Insights from your meeting history.</p>
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 dark:text-white/90">
                                                "What did we decide?" <ChevronRight className="size-3" />
                                            </span>
                                        </div>
                                    </div>
                                    <div className="relative z-10 flex justify-end pt-2 shrink-0">
                                        <span className="flex size-9 items-center justify-center rounded-full text-blue-700 dark:text-white/90 group-hover:text-blue-900 dark:group-hover:text-white transition-colors">
                                            <ArrowUpRight className="size-4" />
                                        </span>
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
