import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  return !!getFirebaseAdmin();
}

/**
 * Get attendees for a meeting from Google Calendar
 * POST /api/meeting-bot/attendees
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
    initFirebase();
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const { meetingId } = await request.json();
    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID required' }, { status: 400 });
    }

    const db = admin.firestore();
    
    // 1. Get meeting doc
    let meetingDoc = await db.collection('meetings').doc(meetingId).get();
    let meetingData = meetingDoc.exists ? meetingDoc.data() : null;

    // Fallback: If not in Firestore, try to fetch from Bot Backend and sync
    if (!meetingData) {
        console.log(`⚠️ Meeting ${meetingId} not found in Firestore, attempting to fetch from Bot Backend...`);
        try {
            const { getBackendUrl } = await import('@/lib/backend');
            const backendUrl = getBackendUrl();
            const res = await fetch(`${backendUrl}/list/meetings`, { 
                cache: 'no-store',
                signal: AbortSignal.timeout(5000) 
            });
            
            if (res.ok) {
                const allMeetings = await res.json();
                const backendMeeting = allMeetings.find((m: any) => m.meetingId === meetingId);
                
                if (backendMeeting) {
                    console.log(`✅ Found meeting ${meetingId} in Bot Backend, syncing to Firestore...`);
                    
                    const newMeetingData = {
                        meetingId: backendMeeting.meetingId,
                        userId: backendMeeting.userId,
                        title: backendMeeting.title || 'Untitled Meeting',
                        meetingUrl: backendMeeting.meetingUrl,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        status: backendMeeting.status || 'ended',
                        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
                    };

                    await db.collection('meetings').doc(meetingId).set(newMeetingData, { merge: true });
                    meetingData = newMeetingData;
                }
            }
        } catch (backendError) {
            console.error('Failed to fetch/sync from backend:', backendError);
        }
    }

    if (!meetingData) {
        console.warn(`⚠️ Meeting ${meetingId} still not found after fallback checks. Returning empty attendees list to allow manual entry.`);
        return NextResponse.json({ attendees: [], warning: 'Meeting details not found' });
    }
    
    let calendarEventId = meetingData?.calendarEventId;
    const meetingUrl = meetingData?.meetingUrl;

    // 2. Get User Tokens (Use meeting owner's credentials to ensure access to the calendar event)
    const meetingOwnerId = meetingData?.userId || userId;
    const userDoc = await db.collection('users').doc(meetingOwnerId).get();
    const userData = userDoc.data();
    
    console.log(`👤 Fetching calendar for meeting owner: ${meetingOwnerId}`);
    
    const accessToken = userData?.googleAccessToken || userData?.calendarAccessToken;
    const refreshToken = userData?.googleRefreshToken || userData?.refreshToken;

    if (!accessToken) {
         console.log('⚠️ No Google tokens found for user');
         return NextResponse.json({ attendees: [], error: 'No calendar access token found' });
    }

    const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 3. Match Calendar Event if missing
    if (!calendarEventId && meetingUrl) {
        console.log(`🔍 Calendar event not linked, attempting to match for meeting ${meetingId}`);
        try {
            const meetCodeMatch = meetingUrl.match(/meet\.google\.com\/([a-z-]+)/i);
            if (meetCodeMatch) {
                 const meetCode = meetCodeMatch[1];
                 const now = new Date();
                 const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                 const timeMax = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();

                 const events = await calendar.events.list({
                     calendarId: 'primary',
                     timeMin,
                     timeMax,
                     maxResults: 50,
                     singleEvents: true,
                     orderBy: 'startTime'
                 });

                 const matchedEvent = events.data.items?.find(event => {
                     return event.conferenceData?.entryPoints?.some(
                         ep => ep.entryPointType === 'video' && ep.uri && ep.uri.includes(meetCode)
                     );
                 });

                 if (matchedEvent) {
                     calendarEventId = matchedEvent.id;
                     console.log(`✅ Matched calendar event ${matchedEvent.id} to meeting ${meetingId}`);
                     
                     await db.collection('meetings').doc(meetingId).update({
                         calendarEventId: matchedEvent.id,
                         calendarEventTitle: matchedEvent.summary || 'Untitled Event',
                         matchedAt: admin.firestore.FieldValue.serverTimestamp()
                     });
                 }
            }
        } catch (matchError) {
            console.error('⚠️ Failed to match calendar event:', matchError);
        }
    }

    // 4. Fetch Attendees if event ID is now available
    if (calendarEventId) {
        try {
            const event = await calendar.events.get({
                calendarId: 'primary',
                eventId: calendarEventId
            });

            if (event.data.attendees) {
                const attendees = event.data.attendees
                    .map(a => a.email)
                    .filter(email => email && !email.includes('resource.calendar.google.com')) as string[];
                
                console.log(`📧 Found ${attendees.length} attendees for event ${calendarEventId}`);
                return NextResponse.json({ attendees });
            }
        } catch (calError: any) {
             console.error('⚠️ Failed to fetch calendar event details:', calError);
             if (calError.code === 404 || calError.code === 410) {
                 return NextResponse.json({ attendees: [], error: 'Calendar event not found' });
             }
        }
    } else {
        console.log(`ℹ️ No calendar event linked for meeting ${meetingId} after matching attempt.`);
    }

    return NextResponse.json({ attendees: [] });

  } catch (error: any) {
    console.error('Error fetching attendees:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch attendees', 
      details: error?.message 
    }, { status: 500 });
  }
}
