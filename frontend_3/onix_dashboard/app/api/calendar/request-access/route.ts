import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();

/**
 * This endpoint initiates the Google Calendar OAuth flow
 * It returns the OAuth URL that the client should redirect to
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
        const email = decodedToken.email;

        if (!email) {
            return NextResponse.json({ error: 'User email not found' }, { status: 400 });
        }

        // Get Google OAuth client ID from environment
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            return NextResponse.json({ error: 'Google OAuth client ID not configured' }, { status: 500 });
        }

        // Build OAuth URL
        const redirectUri = `${request.nextUrl.origin}/api/calendar/oauth-callback`;
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
        ].join(' ');

        const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        oauthUrl.searchParams.set('client_id', clientId);
        oauthUrl.searchParams.set('redirect_uri', redirectUri);
        oauthUrl.searchParams.set('response_type', 'code');
        oauthUrl.searchParams.set('scope', scopes);
        oauthUrl.searchParams.set('access_type', 'offline');
        oauthUrl.searchParams.set('prompt', 'consent');
        oauthUrl.searchParams.set('state', userId); // Pass userId in state for verification

        return NextResponse.json({
            oauthUrl: oauthUrl.toString(),
            redirectUri
        });
    } catch (error: any) {
        console.error('Error generating OAuth URL:', error);
        return NextResponse.json({
            error: 'Failed to generate OAuth URL',
            details: error?.message
        }, { status: 500 });
    }
}
