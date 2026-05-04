import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();

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
        // Check for token in the new structure (googleCalendar map) or fallback to old root field
        let accessToken = userData?.googleCalendar?.accessToken || userData?.calendarAccessToken;
        const refreshToken = userData?.googleCalendar?.refreshToken || userData?.calendarRefreshToken;

        if (!accessToken) {
            return NextResponse.json({
                error: 'Calendar access not granted',
                needsAuth: true
            }, { status: 403 });
        }

        // Helper function to fetch events
        const fetchEventsFromGoogle = async (token: string) => {
            const { searchParams } = new URL(request.url);
            const timeMin = searchParams.get('timeMin');
            const timeMax = searchParams.get('timeMax');
            const maxResults = parseInt(searchParams.get('maxResults') || '50');

            const params = new URLSearchParams({
                maxResults: maxResults.toString(),
                singleEvents: 'true',
                orderBy: 'startTime',
            });

            if (timeMin) params.append('timeMin', timeMin);
            if (timeMax) params.append('timeMax', timeMax);

            return fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
        };

        let calendarResponse = await fetchEventsFromGoogle(accessToken);

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
                    // Prefer the new structure 'googleCalendar'
                    const updates: any = {
                        'googleCalendar.accessToken': accessToken,
                        'googleCalendar.updatedAt': new Date().toISOString()
                    };

                    if (newTokens.id_token) {
                        updates['googleCalendar.idToken'] = newTokens.id_token;
                    }

                    // Also update root field if it existed, for backward compatibility
                    if (userData?.calendarAccessToken) {
                        updates['calendarAccessToken'] = accessToken;
                    }

                    await db.collection('users').doc(userId).update(updates);

                    // Retry fetch with new token
                    calendarResponse = await fetchEventsFromGoogle(accessToken);
                } else {
                    console.error('Failed to refresh token');
                }
            }
        }

        if (!calendarResponse.ok) {
            if (calendarResponse.status === 401) {
                // Token expired and refresh failed (or no refresh token)
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
