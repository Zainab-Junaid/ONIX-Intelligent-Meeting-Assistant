"use client"

import dynamic from "next/dynamic"
import { useState } from 'react'
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Calendar, Users, MapPin, ExternalLink, RefreshCw, Video, Trash2 } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useCalendarEvents } from "@/hooks/use-calendar-events"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

const ScheduleMeetingModal = dynamic(
  () => import("@/components/schedule-meeting-modal").then((m) => ({ default: m.ScheduleMeetingModal })),
  { ssr: false }
)

export default function Page() {
    const { authUser, isLoading, hasCalendarAccess } = useAuth()
    const { toast } = useToast()
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [eventToDelete, setEventToDelete] = useState<{ id: string; title: string } | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Calendar events hook
    const { events: calendarEvents, loading: calendarLoading, error: calendarError, refetch: refetchCalendar } = useCalendarEvents()

    const handleDeleteClick = (eventId: string, eventTitle: string) => {
        setEventToDelete({ id: eventId, title: eventTitle })
        setDeleteDialogOpen(true)
    }

    const handleDeleteConfirm = async () => {
        if (!eventToDelete) return

        setIsDeleting(true)
        try {
            const token = await authUser?.getIdToken()
            if (!token) throw new Error('No auth token')

            const response = await fetch('/api/calendar/delete-event', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ eventId: eventToDelete.id })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to delete event')
            }

            toast({
                title: "Event deleted",
                description: "The meeting has been cancelled and attendees notified."
            })

            // Refresh the calendar events
            refetchCalendar()
        } catch (error: any) {
            console.error('Error deleting event:', error)
            toast({
                title: "Error",
                description: error.message || 'Failed to delete meeting',
                variant: "destructive"
            })
        } finally {
            setIsDeleting(false)
            setDeleteDialogOpen(false)
            setEventToDelete(null)
        }
    }

    if (isLoading) return <div className="p-6">Loading…</div>
    if (!authUser) return <div className="p-6">Please sign in to view your schedule.</div>

    return (
        <AppShell
            title="Schedule"
            actions={
                hasCalendarAccess && (
                    <div className="flex items-center gap-2">
                        <ScheduleMeetingModal />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetchCalendar()}
                            disabled={calendarLoading}
                            className="gap-2"
                        >
                            <RefreshCw className={cn("size-4", calendarLoading && "animate-spin")} />
                            Refresh
                        </Button>
                    </div>
                )
            }
        >
            <div>
                {!hasCalendarAccess ? (
                    <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
                        <Calendar className="size-12 text-blue-400 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Connect your Google Calendar</h3>
                        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                            See your upcoming meetings here and join them directly with Onix.
                        </p>
                        <Button
                            onClick={async () => {
                                console.log('Connect Calendar button clicked');
                                try {
                                    console.log('Getting auth token...');
                                    const token = await authUser?.getIdToken()
                                    console.log('Token received:', token ? 'Yes' : 'No');
                                    if (!token) {
                                        console.error('No token available');
                                        return;
                                    }

                                    console.log('Fetching OAuth URL...');
                                    const res = await fetch('/api/calendar/request-access', {
                                        headers: {
                                            'Authorization': `Bearer ${token}`
                                        }
                                    })
                                    console.log('Response status:', res.status);
                                    const data = await res.json()
                                    console.log('Response data:', data);

                                    if (data.oauthUrl) {
                                        console.log('Redirecting to:', data.oauthUrl);
                                        window.location.href = data.oauthUrl;
                                    } else {
                                        console.error('Failed to get OAuth URL', data);
                                    }
                                } catch (error) {
                                    console.error('Error requesting access', error);
                                }
                            }}
                            variant="default"
                            className="bg-blue-500 hover:bg-blue-600 rounded-lg shadow-sm font-semibold"
                        >
                            Connect Calendar
                        </Button>
                    </div>
                ) : calendarLoading ? (
                    <div className="text-sm text-muted-foreground animate-pulse p-4">Loading scheduled meetings...</div>
                ) : calendarError ? (
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-6 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-red-900 mb-1">Calendar Connection Error</h3>
                            <p className="text-sm text-red-600">{calendarError}</p>
                        </div>
                        <Button asChild variant="outline" size="sm" className="bg-white border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                            <Link href="/settings">Check Settings</Link>
                        </Button>
                    </div>
                ) : calendarEvents.length === 0 ? (
                    <div className="text-center py-16 rounded-3xl border border-dashed border-slate-200 bg-slate-50/50">
                        <Calendar className="size-12 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500 text-base font-medium">No upcoming meetings</p>
                        <p className="text-slate-400 text-sm mt-1">in the next 30 days</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {calendarEvents.map((event) => {
                            const startDate = event.start.dateTime
                                ? new Date(event.start.dateTime)
                                : event.start.date
                                    ? new Date(event.start.date)
                                    : null

                            const endDate = event.end.dateTime
                                ? new Date(event.end.dateTime)
                                : event.end.date
                                    ? new Date(event.end.date)
                                    : null

                            const isAllDay = !event.start.dateTime && event.start.date
                            const isPast = startDate && startDate < new Date()
                            const isToday = startDate &&
                                startDate.toDateString() === new Date().toDateString()

                            // Extract Google Meet URL
                            const meetUrl =
                                event.conferenceData?.entryPoints?.find(
                                    (ep) => ep.entryPointType === "video"
                                )?.uri ||
                                event.description?.match(/https?:\/\/meet\.google\.com\/[a-z-]+/i)?.[0] ||
                                event.location?.match(/https?:\/\/meet\.google\.com\/[a-z-]+/i)?.[0] ||
                                null;

                            return (
                                <div
                                    key={event.id}
                                    className={cn(
                                        "group bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg transition-all duration-300 relative overflow-hidden",
                                        isPast && "opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0",
                                        isToday && "border-blue-200 bg-blue-50/30 shadow-sm"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-3">
                                                <h3 className="font-semibold text-slate-900 text-xl tracking-tight">
                                                    {event.summary || 'Untitled Event'}
                                                </h3>
                                                {isToday && (
                                                    <span className="px-2.5 py-1 text-[10px] font-bold bg-blue-100 text-blue-600 rounded-md uppercase tracking-wider">
                                                        Today
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-5 text-sm text-slate-500 mb-4">
                                                {startDate && (
                                                    <span className="flex items-center gap-2">
                                                        <Calendar className="size-4 text-blue-400" />
                                                        <span className="font-medium">
                                                            {isAllDay
                                                                ? startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                                                                : startDate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                            }
                                                            {endDate && !isAllDay && ` - ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
                                                        </span>
                                                    </span>
                                                )}

                                                {event.location && (
                                                    <span className="flex items-center gap-2 truncate max-w-[250px]">
                                                        <MapPin className="size-4 text-blue-400 flex-shrink-0" />
                                                        <span className="truncate">{event.location}</span>
                                                    </span>
                                                )}

                                                {event.attendees && event.attendees.length > 0 && (
                                                    <span className="flex items-center gap-2">
                                                        <Users className="size-4 text-blue-400" />
                                                        {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>

                                            {event.description && (
                                                <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed mb-4">
                                                    {event.description.replace(/<[^>]*>/g, '')}
                                                </p>
                                            )}

                                            <div className="flex items-center gap-3">
                                                {meetUrl && (
                                                    <Button size="sm" className="h-9 px-4 bg-blue-500 hover:bg-blue-600 rounded-lg gap-2 font-semibold" asChild>
                                                        <a href={meetUrl} target="_blank" rel="noopener noreferrer">
                                                            <Video className="size-4" /> Join Meet
                                                        </a>
                                                    </Button>
                                                )}

                                                {event.htmlLink && (
                                                    <Button size="sm" variant="ghost" className="h-9 px-3 text-slate-600 hover:text-slate-900" asChild>
                                                        <Link href={event.htmlLink || '#'} target="_blank" rel="noopener noreferrer">
                                                            View Details <ExternalLink className="size-3 ml-1" />
                                                        </Link>
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-9 px-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => handleDeleteClick(event.id, event.summary || 'Untitled Event')}
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{eventToDelete?.title}"?
                            {' '}This action cannot be undone and attendees will be notified of the cancellation.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppShell>
    )
}
