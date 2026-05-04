import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { getFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  return !!getFirebaseAdmin();
}

/**
 * Match a meeting URL to a calendar event and store the event ID
 * POST /api/meetings/match-calendar-event
 */
export async function POST(request: NextRequest) {
  try {
    // Get Firebase token from headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    // Get meeting URL and meeting ID from request body
    const { meetingUrl, meetingId } = await request.json();
    if (!meetingUrl || !meetingId) {
      return NextResponse.json({ error: 'Meeting URL and meeting ID required' }, { status: 400 });
    }

    // Get Firestore instance
    initFirebase();
    const db = admin.firestore();
    
    // Get user's calendar access token
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const accessToken = userData?.calendarAccessToken;

    if (!accessToken) {
      return NextResponse.json({ 
        error: 'Calendar access not granted',
        needsAuth: true 
      }, { status: 403 });
    }

    // Extract Google Meet code from URL
    // URL format: https://meet.google.com/abc-defg-hij
    const meetCodeMatch = meetingUrl.match(/meet\.google\.com\/([a-z-]+)/i);
    if (!meetCodeMatch) {
      return NextResponse.json({ error: 'Invalid Google Meet URL' }, { status: 400 });
    }

    const meetCode = meetCodeMatch[1];

    // Search for calendar events with matching Google Meet URL
    // We'll search events from the past 7 days to future 1 day
    const now = new Date();
    const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();

    const params = new URLSearchParams({
      maxResults: '50',
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
      timeMax,
    });

    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!calendarResponse.ok) {
      if (calendarResponse.status === 401) {
        await db.collection('users').doc(userId).update({
          calendarAccessToken: admin.firestore.FieldValue.delete(),
        });
        return NextResponse.json({ 
          error: 'Calendar access token expired',
          needsAuth: true 
        }, { status: 401 });
      }
      throw new Error(`Google Calendar API error: ${calendarResponse.statusText}`);
    }

    const calendarData = await calendarResponse.json();
    const events = calendarData.items || [];

    // Find matching event by checking conference data and description/location
    let matchedEvent = null;
    
    for (const event of events) {
      // Check conference data for video entry point
      if (event.conferenceData?.entryPoints) {
        const videoEntry = event.conferenceData.entryPoints.find(
          (ep: any) => ep.entryPointType === 'video' && ep.uri
        );
        if (videoEntry?.uri && videoEntry.uri.includes(meetCode)) {
          matchedEvent = event;
          break;
        }
      }

      // Check description for meet link
      if (!matchedEvent && event.description) {
        const meetRegex = new RegExp(`meet\\.google\\.com/${meetCode.replace(/-/g, '[-]')}`, 'i');
        if (meetRegex.test(event.description)) {
          matchedEvent = event;
          break;
        }
      }

      // Check location for meet link
      if (!matchedEvent && event.location) {
        const meetRegex = new RegExp(`meet\\.google\\.com/${meetCode.replace(/-/g, '[-]')}`, 'i');
        if (meetRegex.test(event.location)) {
          matchedEvent = event;
          break;
        }
      }
    }

    if (!matchedEvent) {
      console.log(`⚠️ No matching calendar event found for meeting URL: ${meetingUrl}`);
      return NextResponse.json({ 
        matched: false,
        message: 'No matching calendar event found'
      });
    }

    // Store calendar event ID with the meeting
    // Store in Firestore under meetings collection
    const meetingRef = db.collection('meetings').doc(meetingId);
    await meetingRef.set({
      meetingId,
      userId,
      meetingUrl,
      calendarEventId: matchedEvent.id,
      calendarEventTitle: matchedEvent.summary || 'Untitled Event',
      matchedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`✅ Matched calendar event ${matchedEvent.id} to meeting ${meetingId}`);

    return NextResponse.json({
      matched: true,
      calendarEventId: matchedEvent.id,
      calendarEventTitle: matchedEvent.summary,
      attendees: matchedEvent.attendees || [],
    });

  } catch (error: any) {
    console.error('Error matching calendar event:', error);
    return NextResponse.json({ 
      error: 'Failed to match calendar event', 
      details: error?.message 
    }, { status: 500 });
  }
}
