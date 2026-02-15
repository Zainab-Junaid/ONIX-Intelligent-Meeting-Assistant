"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, RefreshCw, Video, MapPin, ExternalLink, ChevronRight } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useCalendarEvents } from "@/hooks/use-calendar-events"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { MeetingCard } from "@/components/meeting-card"

export function UpcomingMeetingsCard() {
    const { authUser, isLoading: authLoading, hasCalendarAccess } = useAuth()
    const { events: calendarEvents, loading: calendarLoading, error: calendarError, refetch: refetchCalendar } = useCalendarEvents()
    const [isConnecting, setIsConnecting] = useState(false)

    // Filter for future events only
    const upcomingEvents = calendarEvents.filter(event => {
        const startDate = event.start.dateTime
            ? new Date(event.start.dateTime)
            : event.start.date
                ? new Date(event.start.date)
                : null
        return startDate && startDate >= new Date()
    }).slice(0, 3) // Show top 3

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
            <Card className="rounded-[32px] border-slate-100 shadow-sm bg-white overflow-hidden h-full">
                <CardContent className="p-8 h-full flex flex-col items-center justify-center text-center">
                    <div className="size-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 mb-4">
                        <Calendar className="size-6" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">Connect Calendar</h3>
                    <p className="text-sm text-slate-500 mb-6 max-w-[200px]">
                        See upcoming meetings and join them directly from here.
                    </p>
                    <Button
                        onClick={handleConnectCalendar}
                        disabled={isConnecting}
                        className="rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full"
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

    return (
        <Card className="rounded-[32px] border-slate-100 shadow-sm bg-white overflow-hidden h-full flex flex-col">
            <CardContent className="p-8 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Upcoming Meetings</h3>
                        <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-wider">Next 30 days</p>
                    </div>
                    <Link href="/schedule" className="text-sm font-semibold text-blue-500 hover:text-blue-600 transition-colors">
                        View Schedule
                    </Link>
                </div>

                <div className="space-y-6 flex-1">
                    {calendarLoading ? (
                        <div className="space-y-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="animate-pulse flex items-center gap-4">
                                    <div className="size-12 bg-slate-100 rounded-xl" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-slate-100 rounded w-3/4" />
                                        <div className="h-3 bg-slate-100 rounded w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : calendarError ? (
                        <div className="text-center py-8">
                            <p className="text-sm text-red-500 mb-2">{calendarError}</p>
                            <Button variant="outline" size="sm" onClick={() => refetchCalendar()}>
                                Try Again
                            </Button>
                        </div>
                    ) : upcomingEvents.length === 0 ? (
                        <div className="text-center py-8 flex-1 flex flex-col items-center justify-center">
                            <p className="text-slate-400 font-medium text-sm">No upcoming meetings</p>
                            <p className="text-slate-400 text-xs mt-1">Enjoy your free time! 🎉</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {upcomingEvents.map((event) => {
                                const startDate = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date!)
                                const endDate = event.end.dateTime ? new Date(event.end.dateTime) : (event.end.date ? new Date(event.end.date) : null)

                                // Calculate duration in minutes
                                let duration = 60; // Default
                                if (startDate && endDate) {
                                    duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
                                }

                                return (
                                    <MeetingCard
                                        key={event.id}
                                        title={event.summary || 'Untitled Event'}
                                        time={startDate.toLocaleDateString('en-US', { weekday: 'long' }) + ' at ' + startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                        attendees={event.attendees?.length || 0}
                                        duration={duration}
                                        status="Scheduled"
                                        onClick={() => {
                                            const meetUrl = event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === "video")?.uri ||
                                                event.description?.match(/https?:\/\/meet\.google\.com\/[a-z-]+/i)?.[0];
                                            if (meetUrl) window.open(meetUrl, '_blank');
                                        }}
                                    />
                                )
                            })}
                        </div>
                    )}
                </div>

                {upcomingEvents.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-center">
                        <Link href="/schedule" className="text-xs font-semibold text-slate-400 hover:text-blue-500 flex items-center gap-1 transition-colors uppercase tracking-wider">
                            View All Events <ChevronRight className="size-3" />
                        </Link>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
