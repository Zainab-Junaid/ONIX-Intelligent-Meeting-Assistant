import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const code = searchParams.get('code');
        const state = searchParams.get('state'); // specific user ID
        const error = searchParams.get('error');

        if (error) {
            return NextResponse.redirect(`${request.nextUrl.origin}/settings?error=${error}`);
        }

        if (!code) {
            return NextResponse.redirect(`${request.nextUrl.origin}/settings?error=no_code`);
        }

        if (!state) {
            return NextResponse.redirect(`${request.nextUrl.origin}/settings?error=no_state`);
        }

        // Verify the user exists
        try {
            await getAuth().getUser(state);
        } catch (error) {
            console.error('Invalid user ID in state:', state);
            return NextResponse.redirect(`${request.nextUrl.origin}/settings?error=invalid_user`);
        }

        // Exchange code for tokens
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = `${request.nextUrl.origin}/api/calendar/oauth-callback`;

        if (!clientId || !clientSecret) {
            console.error('Missing Google OAuth credentials');
            return NextResponse.redirect(`${request.nextUrl.origin}/settings?error=configuration_error`);
        }

        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });

        const tokens = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error('Token exchange failed:', tokens);
            const errorMsg = tokens.error_description || tokens.error || 'token_exchange_failed';
            return NextResponse.redirect(`${request.nextUrl.origin}/settings?error=${errorMsg}`);
        }

        // Prepare token data
        const tokenData: any = {
            accessToken: tokens.access_token,
            expiryDate: Date.now() + (tokens.expires_in * 1000),
            connected: true,
            updatedAt: new Date().toISOString()
        };

        // Only update refresh token if present (usually only on first consent)
        if (tokens.refresh_token) {
            tokenData.refreshToken = tokens.refresh_token;
        }

        // Store tokens securely in user document under 'integrations.googleCalendar'
        // Using a map field is cleaner than a subcollection for simple integrations
        // We'll also keep the old field for backward compatibility if needed, but let's stick to the structure
        // defined in the previous attempts to be safe: 'googleCalendar' field in root of user doc

        await getFirestore().collection('users').doc(state).set({
            googleCalendar: tokenData
        }, { merge: true });

        // Redirect back to dashboard/schedule with success
        return NextResponse.redirect(`${request.nextUrl.origin}/schedule?success=true`);

    } catch (error: any) {
        console.error('Callback error:', error);
        return NextResponse.redirect(`${request.nextUrl.origin}/settings?error=server_error`);
    }
}
