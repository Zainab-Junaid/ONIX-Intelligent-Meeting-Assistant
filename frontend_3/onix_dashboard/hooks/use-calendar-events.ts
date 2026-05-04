import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth-provider'

export interface CalendarEvent {
    id: string
    summary: string
    description?: string
    start: {
        dateTime?: string
        date?: string
        timeZone?: string
    }
    end: {
        dateTime?: string
        date?: string
        timeZone?: string
    }
    location?: string
    attendees?: Array<{
        email: string
        displayName?: string
        responseStatus?: string
    }>
    conferenceData?: {
        entryPoints: Array<{
            entryPointType: string
            uri: string
            label?: string
        }>
    }
    htmlLink?: string
    status?: string
}

export function useCalendarEvents() {
    const { authUser, hasCalendarAccess } = useAuth()
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchEvents = async (daysAhead: number = 30) => {
        if (!authUser || !hasCalendarAccess) {
            setEvents([])
            setError(null)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const idToken = await authUser.getIdToken()

            // Calculate time range
            const now = new Date()
            const timeMin = now.toISOString()
            const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString()

            const response = await fetch(
                `/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=50`,
                {
                    headers: {
                        'Authorization': `Bearer ${idToken}`,
                    },
                }
            )

            if (!response.ok) {
                if (response.status === 403) {
                    setError('Calendar not connected. Please connect your calendar in settings.')
                } else if (response.status === 401) {
                    setError('Calendar access expired. Please reconnect your calendar.')
                } else {
                    const errorData = await response.json()
                    setError(errorData.error || 'Failed to fetch calendar events')
                }
                setEvents([])
                return
            }

            const data = await response.json()
            setEvents(data.events || [])
        } catch (err: any) {
            console.error('Error fetching calendar events:', err)
            setError(err.message || 'Failed to fetch calendar events')
            setEvents([])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (authUser && hasCalendarAccess) {
            fetchEvents(30) // Fetch next 30 days
        } else {
            setEvents([])
            setError(null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authUser?.uid, hasCalendarAccess])

    return {
        events,
        loading,
        error,
        refetch: fetchEvents,
    }
}
