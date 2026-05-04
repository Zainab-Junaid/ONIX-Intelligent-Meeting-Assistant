# Troubleshooting: OAuth Callback Not Working

## Problem
After clicking "Allow" on the Google OAuth consent screen, nothing happens - the popup doesn't close or communicate back.

## Fix Applied
I've updated the OAuth callback to properly send messages to the parent window. However, you also need to verify:

## Step 1: Verify Redirect URI in Google Cloud Console

The redirect URI must match **exactly**. Check:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Check **Authorized redirect URIs**

### For Development (localhost):
```
http://localhost:3000/api/calendar/oauth-callback
```

### For Production:
```
https://yourdomain.com/api/calendar/oauth-callback
```

**Important:**
- Must match **exactly** (including http vs https, trailing slashes, etc.)
- If using a different port, update it
- No trailing slash at the end

## Step 2: Check Browser Console

1. Open browser Developer Tools (F12)
2. Go to **Console** tab
3. Look for any errors when you click "Grant Access"
4. Check **Network** tab for failed requests

## Step 3: Verify Environment Variables

Make sure your `.env.local` file has:
```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

**After adding/updating env vars:**
- Restart your development server (`npm run dev`)

## Step 4: Check Server Logs

Look at your terminal where `npm run dev` is running for any errors like:
- "Google OAuth credentials not configured"
- "Token exchange failed"
- Any other error messages

## Step 5: Test the Flow

1. Clear browser cache and cookies
2. Try in an incognito/private window
3. Click "Grant Access" again
4. After clicking "Allow" on Google's page:
   - The popup should close automatically
   - You should see a success message
   - The modal should disappear

## Common Issues

### Issue: Popup stays open with blank page
**Solution:** Check browser console for JavaScript errors. The callback page should send a message and close.

### Issue: "redirect_uri_mismatch" error
**Solution:** The redirect URI in Google Console doesn't match. Update it to match exactly:
- `http://localhost:3000/api/calendar/oauth-callback` (for dev)
- Check for typos, wrong port, http vs https

### Issue: "invalid_client" error
**Solution:** 
- Check `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set correctly
- Check `GOOGLE_CLIENT_SECRET` is set correctly
- Restart dev server after adding env vars

### Issue: Popup closes but nothing happens
**Solution:** 
- Check browser console for errors
- Verify the message is being sent from callback
- Check that `requestCalendarAccess` function is listening for messages

## Debug Steps

1. **Check if callback is being called:**
   - Look at Network tab in DevTools
   - You should see a request to `/api/calendar/oauth-callback?code=...`

2. **Check if token is stored:**
   - Go to Firebase Console → Firestore
   - Check `users/{userId}` document
   - Look for `calendarAccessToken` field

3. **Check server logs:**
   - Look for "Token exchange failed" or other errors
   - Check if credentials are being read correctly

## Still Not Working?

1. Check the browser console for specific error messages
2. Check your terminal/server logs for backend errors
3. Verify the redirect URI matches exactly in Google Console
4. Make sure you restarted the dev server after adding env vars


