import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require('../../../../backend/firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

/**
 * Get user's calendar events
 * GET /api/calendar/events?timeMin=...&timeMax=...&maxResults=...
 */
export async function GET(request: NextRequest) {
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

    // Get Firestore instance
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const timeMin = searchParams.get('timeMin');
    const timeMax = searchParams.get('timeMax');
    const maxResults = parseInt(searchParams.get('maxResults') || '50');

    // Build Google Calendar API request
    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    if (timeMin) {
      params.append('timeMin', timeMin);
    }
    if (timeMax) {
      params.append('timeMax', timeMax);
    }

    // Fetch events from Google Calendar API
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
        // Token expired, clear it
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
    return NextResponse.json({
      events: calendarData.items || [],
      nextPageToken: calendarData.nextPageToken,
    });
  } catch (error: any) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch calendar events', 
      details: error?.message 
    }, { status: 500 });
  }
}


