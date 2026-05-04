import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { getFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  const app = getFirebaseAdmin();
  if (!app) {
    console.error('❌ Failed to initialize Firebase Admin via helper');
    return false;
  }
  return true;
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

    initFirebase();
    
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
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f9ff; color: #0369a1; }
            .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; }
            .icon { font-size: 3rem; margin-bottom: 1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h2>Calendar Connected!</h2>
            <p>You can close this window now.</p>
          </div>
          <script>
            // Send success message to parent window
            if (window.opener) {
              window.opener.postMessage({ type: 'CALENDAR_AUTH_SUCCESS' }, '*');
              setTimeout(() => window.close(), 1500);
            } else {
              // If no opener, redirect to main app
              setTimeout(() => window.location.href = '/settings?calendar_success=true', 1500);
            }
          </script>
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
