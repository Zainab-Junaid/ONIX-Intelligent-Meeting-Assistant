# Google Calendar Integration Setup Guide

This guide explains how to set up Google Calendar integration for the ONIX Meeting Assistant application.

## Overview

The Google Calendar integration allows users to:
- Grant calendar access during first-time signup
- View and manage calendar events
- Sync meeting transcripts with calendar events
- Automatically identify meetings from calendar

## Prerequisites

1. **Google Cloud Console Project**
   - You need a Google Cloud Project with the Calendar API enabled
   - OAuth 2.0 credentials configured

2. **Firebase Project**
   - Firebase Authentication configured
   - Firestore database set up

## Step-by-Step Setup

### Step 1: Enable Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** > **Library**
4. Search for "Google Calendar API"
5. Click **Enable**

### Step 2: Create OAuth 2.0 Credentials

1. In Google Cloud Console, go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen:
   - Choose **External** (unless you have a Google Workspace)
   - Fill in required fields (App name, User support email, Developer contact)
   - Add scopes:
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/calendar.events`
   - Add test users (if in testing mode)
   - Save and continue

4. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: "ONIX Calendar Integration"
   - Authorized JavaScript origins:
     - `http://localhost:3000` (for development)
     - `https://yourdomain.com` (for production)
   - Authorized redirect URIs:
     - `http://localhost:3000/api/calendar/oauth-callback` (for development)
     - `https://yourdomain.com/api/calendar/oauth-callback` (for production)
   - Click **Create**
   - **Save the Client ID and Client Secret** (you'll need these)

### Step 3: Configure Environment Variables

Add the following environment variables to your `.env.local` file in `frontend/dashboard/`:

```env
# Google OAuth Credentials
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Firebase Configuration (if not already set)
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

### Step 4: Update Firebase Authentication

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Authentication** > **Sign-in method**
4. Ensure **Google** provider is enabled
5. Add the same OAuth Client ID from Step 2 to the Firebase Google provider settings

### Step 5: Firestore Security Rules

Update your Firestore security rules to allow users to read/write their own calendar tokens:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Users can read/write their own meetings
      match /meetings/{meetingId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

### Step 6: Test the Integration

1. Start your development server:
   ```bash
   cd frontend/dashboard
   npm run dev
   ```

2. Sign up with a new Google account
3. You should see the calendar permission modal
4. Click "Grant Access"
5. Complete the OAuth flow
6. Verify the token is stored in Firestore under `users/{userId}`

## How It Works

### First-Time Signup Flow

1. User signs in with Google (via Firebase Auth)
2. System detects first-time user (no document in `users/{userId}`)
3. Calendar permission modal appears
4. User clicks "Grant Access"
5. OAuth popup opens with Google consent screen
6. User grants calendar permissions
7. OAuth callback stores access token in Firestore
8. Modal closes, user can now use calendar features

### Calendar Access Flow

1. User clicks "Grant Access" in the modal
2. Frontend calls `/api/calendar/request-access`
3. Backend generates OAuth URL with calendar scopes
4. Popup window opens for OAuth consent
5. User grants permissions
6. Google redirects to `/api/calendar/oauth-callback`
7. Backend exchanges authorization code for access token
8. Token stored in Firestore: `users/{userId}.calendarAccessToken`
9. User redirected back to app with success

### Using Calendar API

Once access is granted, you can use the calendar service:

```typescript
import { getCalendarEvents } from '@/lib/calendar-service'

// Get access token from Firestore
const userDoc = await getDoc(doc(db, 'users', userId))
const accessToken = userDoc.data()?.calendarAccessToken

// Fetch events
const events = await getCalendarEvents(accessToken, timeMin, timeMax)
```

Or use the API endpoint:

```typescript
const response = await fetch('/api/calendar/events?timeMin=...&timeMax=...', {
  headers: {
    'Authorization': `Bearer ${firebaseIdToken}`
  }
})
const { events } = await response.json()
```

## API Endpoints

### `GET /api/calendar/request-access`
Initiates OAuth flow. Returns OAuth URL to redirect to.

**Headers:**
- `Authorization: Bearer <firebase-id-token>`

**Response:**
```json
{
  "oauthUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "redirectUri": "https://yourdomain.com/api/calendar/oauth-callback"
}
```

### `GET /api/calendar/oauth-callback`
OAuth callback handler. Exchanges code for token and stores it.

**Query Parameters:**
- `code`: Authorization code from Google
- `state`: User ID

### `POST /api/calendar/store-token`
Manually store calendar access token (alternative method).

**Headers:**
- `Authorization: Bearer <firebase-id-token>`

**Body:**
```json
{
  "accessToken": "ya29.a0...",
  "refreshToken": "1//0..." // optional
}
```

### `GET /api/calendar/events`
Get user's calendar events.

**Headers:**
- `Authorization: Bearer <firebase-id-token>`

**Query Parameters:**
- `timeMin`: ISO 8601 datetime (optional)
- `timeMax`: ISO 8601 datetime (optional)
- `maxResults`: Number (default: 50)

**Response:**
```json
{
  "events": [...],
  "nextPageToken": "..."
}
```

## Troubleshooting

### "Popup blocked" error
- Ensure popups are allowed for your domain
- Check browser popup blocker settings

### "Calendar access token expired"
- Tokens expire after 1 hour
- Implement refresh token logic (see Google OAuth docs)
- User needs to re-authenticate

### "OAuth client ID not configured"
- Check environment variables are set correctly
- Restart development server after adding env vars
- Verify `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set

### "Redirect URI mismatch"
- Ensure redirect URI in Google Console matches exactly
- Check for trailing slashes
- Verify protocol (http vs https)

### Modal not showing
- Check `isFirstTimeUser` state in auth provider
- Verify user document doesn't exist in Firestore
- Check browser console for errors

## Security Considerations

1. **Never expose Client Secret** in client-side code
2. **Store tokens securely** in Firestore (server-side only)
3. **Use HTTPS** in production
4. **Implement token refresh** for long-lived sessions
5. **Validate user permissions** before calendar operations
6. **Rate limit** calendar API calls

## Next Steps

- Implement token refresh logic
- Add calendar event creation for meetings
- Sync meeting transcripts with calendar events
- Add calendar settings page
- Implement calendar webhook for real-time updates

## Support

For issues or questions:
1. Check Firebase Console logs
2. Check Google Cloud Console logs
3. Review browser console errors
4. Verify OAuth consent screen configuration


