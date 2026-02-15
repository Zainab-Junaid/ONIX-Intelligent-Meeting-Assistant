/**
 * Google Calendar API Service
 * Handles interactions with Google Calendar API
 */

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
  }>
  conferenceData?: {
    entryPoints: Array<{
      entryPointType: string
      uri: string
    }>
  }
}

/**
 * Get user's calendar events
 */
export async function getCalendarEvents(
  accessToken: string,
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 50
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  })

  if (timeMin) {
    params.append('timeMin', timeMin)
  }
  if (timeMax) {
    params.append('timeMax', timeMax)
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Calendar access token expired. Please reconnect your calendar.')
    }
    throw new Error(`Failed to fetch calendar events: ${response.statusText}`)
  }

  const data = await response.json()
  return data.items || []
}

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  accessToken: string,
  event: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  )

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Calendar access token expired. Please reconnect your calendar.')
    }
    throw new Error(`Failed to create calendar event: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Update a calendar event
 */
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  )

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Calendar access token expired. Please reconnect your calendar.')
    }
    throw new Error(`Failed to update calendar event: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Calendar access token expired. Please reconnect your calendar.')
    }
    throw new Error(`Failed to delete calendar event: ${response.statusText}`)
  }
}

/**
 * Get calendar event by ID
 */
export async function getCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<CalendarEvent> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Calendar access token expired. Please reconnect your calendar.')
    }
    throw new Error(`Failed to fetch calendar event: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Extract Google Meet URL from calendar event
 */
export function extractMeetUrl(event: CalendarEvent): string | null {
  // Check conference data
  if (event.conferenceData?.entryPoints) {
    const meetEntry = event.conferenceData.entryPoints.find(
      (ep) => ep.entryPointType === 'video'
    )
    if (meetEntry?.uri) {
      return meetEntry.uri
    }
  }

  // Check description for meet links
  if (event.description) {
    const meetRegex = /https?:\/\/(meet\.google\.com\/[a-z-]+|.*meet\.google\.com\/.*)/i
    const match = event.description.match(meetRegex)
    if (match) {
      return match[0]
    }
  }

  // Check location
  if (event.location) {
    const meetRegex = /https?:\/\/(meet\.google\.com\/[a-z-]+|.*meet\.google\.com\/.*)/i
    const match = event.location.match(meetRegex)
    if (match) {
      return match[0]
    }
  }

  return null
}


