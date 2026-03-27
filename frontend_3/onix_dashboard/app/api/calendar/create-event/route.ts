import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();

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

        // Get request body
        const { summary, description, startTime, durationMinutes, attendees } = await request.json();

        if (!summary || !startTime || !durationMinutes) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

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

        // Calculate end time
        const start = new Date(startTime);
        const end = new Date(start.getTime() + durationMinutes * 60000);

        // Helper function to create event
        const createEventInGoogle = async (token: string) => {
            const event = {
                summary,
                description,
                start: {
                    dateTime: start.toISOString(),
                    timeZone: 'UTC',
                },
                end: {
                    dateTime: end.toISOString(),
                    timeZone: 'UTC',
                },
                attendees: attendees && attendees.length > 0 ? attendees.map((email: string) => ({
                    email: email.trim(),
                    responseStatus: 'needsAction'
                })) : [],
                conferenceData: {
                    createRequest: {
                        requestId: Math.random().toString(36).substring(7),
                        conferenceSolutionKey: {
                            type: "hangoutsMeet"
                        }
                    }
                }
            };

            console.log('Creating event with attendees:', attendees);

            return fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(event)
                }
            );
        };

        let calendarResponse = await createEventInGoogle(accessToken);

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

                    // Retry fetch with new token
                    calendarResponse = await createEventInGoogle(accessToken);
                } else {
                    console.error('Failed to refresh token');
                }
            }
        }

        if (!calendarResponse.ok) {
            const errorData = await calendarResponse.json();
            throw new Error(`Google Calendar API error: ${JSON.stringify(errorData)}`);
        }

        const eventData = await calendarResponse.json();
        return NextResponse.json(eventData);

    } catch (error: any) {
        console.error('Error creating calendar event:', error);
        return NextResponse.json({
            error: 'Failed to create calendar event',
            details: error?.message
        }, { status: 500 });
    }
}
