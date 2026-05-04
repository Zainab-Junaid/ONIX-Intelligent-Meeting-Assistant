"use client"

import { useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, RefreshCw, ChevronRight, Users, Clock } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useCalendarEvents } from "@/hooks/use-calendar-events"
import Link from "next/link"

export function UpcomingMeetingsCard() {
    const { authUser, isLoading: authLoading, hasCalendarAccess } = useAuth()
    const { events: calendarEvents, loading: calendarLoading, error: calendarError, refetch: refetchCalendar } = useCalendarEvents()
    const [isConnecting, setIsConnecting] = useState(false)
    const now = new Date()

    const allUpcoming = calendarEvents
        .filter(event => {
            const startDate = event.start.dateTime
                ? new Date(event.start.dateTime)
                : event.start.date
                    ? new Date(event.start.date)
                    : null
            return startDate && startDate >= new Date()
        })
        .sort((a, b) => {
            const startA = a.start.dateTime ? new Date(a.start.dateTime).getTime() : new Date(a.start.date!).getTime()
            const startB = b.start.dateTime ? new Date(b.start.dateTime).getTime() : new Date(b.start.date!).getTime()
            return startA - startB
        })
    const MAX_VISIBLE = 2
    const upcomingEvents = allUpcoming.slice(0, MAX_VISIBLE)
    const hasMore = allUpcoming.length > MAX_VISIBLE

    if (authLoading) return null

    const handleConnectCalendar = async () => {
        try {
            setIsConnecting(true)
            const token = await authUser?.getIdToken()
            if (!token) return

            const res = await fetch('/api/calendar/request-access', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            const data = await res.json()

            if (data.oauthUrl) {
                window.location.href = data.oauthUrl
            }
        } catch (error) {
            console.error('Error requesting access', error)
        } finally {
            setIsConnecting(false)
        }
    }

    if (!hasCalendarAccess) {
        return (
            <Card className="rounded-2xl shadow-sm overflow-hidden h-full flex flex-col min-h-[280px]">
                <CardContent className="p-6 flex-1 flex flex-col items-center justify-center text-center">
                    <div className="size-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-500 dark:text-blue-400 mb-3">
                        <Calendar className="size-5" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-1">Connect Calendar</h3>
                    <p className="text-sm text-muted-foreground mb-5 max-w-[200px]">
                        See upcoming meetings and join them from here.
                    </p>
                    <Button
                        onClick={handleConnectCalendar}
                        disabled={isConnecting}
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium w-full h-11"
                    >
                        {isConnecting ? (
                            <RefreshCw className="mr-2 size-4 animate-spin" />
                        ) : (
                            <Calendar className="mr-2 size-4" />
                        )}
                        Connect Google Calendar
                    </Button>
                </CardContent>
            </Card>
        )
    }

    const getTimePillLabel = (start: Date) => {
        const today = new Date()
        const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        if (start.toDateString() === today.toDateString()) return `TODAY ${timeStr}`
        return start.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() + ' ' + timeStr
    }

    const isLive = (start: Date, end: Date | null) => {
        if (!end) return false
        return start <= now && now <= end
    }

    return (
        <Card className="rounded-2xl border border-slate-200/80 bg-white dark:bg-card shadow-sm overflow-hidden h-full min-h-[220px] flex flex-col">
            <CardContent className="p-4 flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between mb-3 shrink-0">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">Upcoming</h3>
                    <Link href="/schedule" className="text-sm font-medium text-slate-600 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 flex items-center gap-0.5 transition-colors">
                        Schedule <ChevronRight className="size-4" />
                    </Link>
                </div>

                {calendarLoading ? (
                    <div className="space-y-1.5">
                        {[1, 2].map((i) => (
                            <div key={i} className="animate-pulse flex items-center gap-2.5">
                                <div className="h-6 w-14 rounded-full bg-slate-100 dark:bg-slate-800" />
                                <div className="flex-1">
                                    <div className="h-3.5 bg-slate-100 dark:bg-slate-800 rounded w-2/3" />
                                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/3 mt-1" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : calendarError ? (
                    <div className="text-center py-3">
                        <p className="text-sm text-red-500 mb-2">{calendarError}</p>
                        <Button variant="outline" size="sm" onClick={() => refetchCalendar()}>
                            Try Again
                        </Button>
                    </div>
                ) : upcomingEvents.length === 0 ? (
                    <div className="text-center py-4">
                        <p className="text-slate-500 text-sm">No upcoming meetings</p>
                        <p className="text-slate-400 text-xs mt-0.5">Enjoy your free time</p>
                    </div>
                ) : (
                    <div className="flex flex-col flex-1 min-h-0">
                        <div className="space-y-1.5 overflow-y-auto min-h-0 flex-1">
                            {upcomingEvents.map((event) => {
                            const startDate = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date!)
                            const endDate = event.end.dateTime ? new Date(event.end.dateTime) : (event.end.date ? new Date(event.end.date) : null)
                            let durationMins = 60
                            if (startDate && endDate) {
                                durationMins = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
                            }
                            const live = isLive(startDate, endDate)
                            const meetUrl = event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === "video")?.uri ||
                                event.description?.match(/https?:\/\/meet\.google\.com\/[a-z-]+/i)?.[0]

                            return (
                                <button
                                    key={event.id}
                                    type="button"
                                    onClick={() => meetUrl && window.open(meetUrl, '_blank')}
                                    className="w-full text-left flex items-center gap-2.5 py-2 px-3 rounded-xl bg-muted/50 border border-border hover:bg-muted transition-colors"
                                >
                                    <span className="shrink-0 text-[11px] font-semibold text-muted-foreground bg-background border border-border rounded-lg px-2 py-1 leading-tight inline-flex items-center">
                                        {getTimePillLabel(startDate)}
                                    </span>
                                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-foreground text-sm truncate">
                                                {event.summary || 'Untitled Event'}
                                            </span>
                                            {live && (
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 shrink-0 uppercase tracking-wide">
                                                    <span className="size-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Users className="size-3.5" /> {event.attendees?.length || 0}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="size-3.5" /> {durationMins}m
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                        </div>
                        {hasMore && (
                            <Link
                                href="/schedule"
                                className="mt-2 pt-2 border-t border-border shrink-0 text-xs font-medium text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-0.5 transition-colors"
                            >
                                View more <ChevronRight className="size-3" />
                            </Link>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
