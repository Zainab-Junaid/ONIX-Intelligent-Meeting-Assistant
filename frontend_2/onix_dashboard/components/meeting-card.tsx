"use client"

import { Clock, Users, MoreVertical, CheckCircle2, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface MeetingCardProps {
    title: string
    time: string
    attendees: number
    duration: number
    status?: "Scheduled" | "Completed" | "Live"
    onClick?: () => void
    onActionClick?: () => void
}

export function MeetingCard({
    title,
    time,
    attendees,
    duration,
    status = "Scheduled",
    onClick,
    onActionClick
}: MeetingCardProps) {
    const isCompleted = status === "Completed"
    const isLive = status === "Live"

    return (
        <div
            onClick={onClick}
            className="group relative bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 transition-all duration-300 hover:border-blue-500/50 hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-blue-500/10 cursor-pointer overflow-hidden"
        >
            {/* Background Subtle Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative flex flex-col gap-4">
                {/* Header: Title and Menu */}
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                            {title}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5 font-medium">
                            {time}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            isCompleted
                                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-white"
                                : isLive
                                    ? "bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-white"
                                    : "bg-slate-500/10 border border-slate-500/20 text-slate-600 dark:text-white"
                        )}>
                            {isCompleted ? <CheckCircle2 className="size-3" /> : isLive ? <span className="size-2 rounded-full bg-blue-500 animate-pulse" /> : <CalendarDays className="size-3" />}
                            {status}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-10 rounded-2xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-white dark:hover:bg-slate-800 transition-all"
                            onClick={(e) => {
                                e.stopPropagation();
                                onActionClick?.();
                            }}
                        >
                            <MoreVertical className="size-5" />
                        </Button>
                    </div>
                </div>

                {/* Footer: Metrics */}
                <div className="flex items-center gap-5 mt-2">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                        <div className="size-8 rounded-xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center text-slate-500 dark:text-slate-300">
                            <Users className="size-4" />
                        </div>
                        <span className="text-sm font-medium">{attendees} attendees</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                        <div className="size-8 rounded-xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center text-slate-500 dark:text-slate-300">
                            <Clock className="size-4" />
                        </div>
                        <span className="text-sm font-medium">{duration > 0 ? `${duration} min` : '—'}</span>
                    </div>
                </div>
            </div>

            {/* Hover Status for Mobile (visible when sm is hidden) */}
            <div className="sm:hidden mt-4 flex items-center gap-1.5 text-slate-900 dark:text-white text-[10px] font-bold uppercase tracking-wider">
                <div className={isCompleted ? "text-emerald-500 dark:text-emerald-400" : isLive ? "text-blue-500 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"}>
                    {isCompleted ? <CheckCircle2 className="size-3" /> : isLive ? <span className="size-2 rounded-full bg-blue-500 animate-pulse" /> : <CalendarDays className="size-3" />}
                </div>
                {status}
            </div>
        </div>
    )
}
