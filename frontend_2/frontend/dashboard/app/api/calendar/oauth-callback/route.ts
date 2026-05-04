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
 * OAuth callback handler for Google Calendar
 * Exchanges authorization code for access token and stores it
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // userId
    const error = searchParams.get('error');

    if (error) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'CALENDAR_AUTH_ERROR', error: '${error}' }, '*');
                window.close();
              } else {
                window.location.href = '/?calendar_error=${encodeURIComponent(error)}';
              }
            </script>
            <p>Error: ${error}</p>
          </body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (!code || !state) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'CALENDAR_AUTH_ERROR', error: 'missing_parameters' }, '*');
                window.close();
              } else {
                window.location.href = '/?calendar_error=missing_parameters';
              }
            </script>
            <p>Error: Missing parameters</p>
          </body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const userId = state;

    // Exchange authorization code for access token
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${request.nextUrl.origin}/api/calendar/oauth-callback`;

    if (!clientId || !clientSecret) {
      console.error('Google OAuth credentials not configured');
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'CALENDAR_AUTH_ERROR', error: 'server_configuration' }, '*');
                window.close();
              } else {
                window.location.href = '/?calendar_error=server_configuration';
              }
            </script>
            <p>Error: Server configuration issue</p>
          </body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Exchange code for tokens
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

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'CALENDAR_AUTH_ERROR', error: 'token_exchange_failed' }, '*');
                window.close();
              } else {
                window.location.href = '/?calendar_error=token_exchange_failed';
              }
            </script>
            <p>Error: Token exchange failed</p>
          </body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'CALENDAR_AUTH_ERROR', error: 'no_access_token' }, '*');
                window.close();
              } else {
                window.location.href = '/?calendar_error=no_access_token';
              }
            </script>
            <p>Error: No access token received</p>
          </body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Store tokens in Firestore
    const db = admin.firestore();
    const expiresAt = expires_in 
      ? new Date(Date.now() + expires_in * 1000)
      : null;

    await db.collection('users').doc(userId).set({
      calendarAccessToken: access_token,
      calendarRefreshToken: refresh_token || null,
      calendarAccessGranted: true,
      calendarAccessGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
      calendarTokenExpiresAt: expiresAt,
    }, { merge: true });

    // Return HTML page that sends message to parent window and closes
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Calendar Access Granted</title>
        </head>
        <body>
          <script>
            // Send success message to parent window
            if (window.opener) {
              window.opener.postMessage({ type: 'CALENDAR_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              // If no opener, redirect to main app
              window.location.href = '/?calendar_success=true';
            }
          </script>
          <p>Calendar access granted! You can close this window.</p>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error in OAuth callback:', error);
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Error</title></head>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'CALENDAR_AUTH_ERROR', error: '${error.message}' }, '*');
              window.close();
            } else {
              window.location.href = '/?calendar_error=${encodeURIComponent(error.message)}';
            }
          </script>
          <p>Error: ${error.message}</p>
        </body>
      </html>
    `;
    return new NextResponse(errorHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

