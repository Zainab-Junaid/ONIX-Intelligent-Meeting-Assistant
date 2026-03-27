import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();

export async function DELETE(request: NextRequest) {
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

        // Get event ID from request body
        const { eventId } = await request.json();

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
        }

        // Get Firestore instance
        const db = admin.firestore();

        // Get user's calendar access token
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const userData = userDoc.data();
        let accessToken = userData?.googleCalendar?.accessToken || userData?.calendarAccessToken;
        const refreshToken = userData?.googleCalendar?.refreshToken || userData?.calendarRefreshToken;

        if (!accessToken) {
            return NextResponse.json({
                error: 'Calendar access not granted',
                needsAuth: true
            }, { status: 403 });
        }

        // Helper function to delete event
        const deleteEventFromGoogle = async (token: string) => {
            return fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    }
                }
            );
        };

        let calendarResponse = await deleteEventFromGoogle(accessToken);

        // If 401, try to refresh token
        if (calendarResponse.status === 401 && refreshToken) {
            console.log('Access token expired, refreshing...');

            const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

            if (clientId && clientSecret) {
                const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        client_id: clientId,
                        client_secret: clientSecret,
                        refresh_token: refreshToken,
                        grant_type: 'refresh_token',
                    }),
                });

                if (refreshResponse.ok) {
                    const newTokens = await refreshResponse.json();
                    accessToken = newTokens.access_token;

                    // Update Firestore with new token
                    const updates: any = {
                        'googleCalendar.accessToken': accessToken,
                        'googleCalendar.updatedAt': new Date().toISOString()
                    };

                    if (newTokens.id_token) {
                        updates['googleCalendar.idToken'] = newTokens.id_token;
                    }

                    await db.collection('users').doc(userId).update(updates);

                    // Retry delete with new token
                    calendarResponse = await deleteEventFromGoogle(accessToken);
                } else {
                    console.error('Failed to refresh token');
                }
            }
        }

        if (!calendarResponse.ok) {
            if (calendarResponse.status === 404) {
                return NextResponse.json({ error: 'Event not found' }, { status: 404 });
            }
            const errorData = await calendarResponse.json().catch(() => ({}));
            throw new Error(`Google Calendar API error: ${JSON.stringify(errorData)}`);
        }

        return NextResponse.json({ success: true, message: 'Event deleted successfully' });

    } catch (error: any) {
        console.error('Error deleting calendar event:', error);
        return NextResponse.json({
            error: 'Failed to delete calendar event',
            details: error?.message
        }, { status: 500 });
    }
}
