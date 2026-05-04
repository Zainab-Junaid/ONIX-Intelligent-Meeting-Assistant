# Fix: OAuth 403 Error - Access Denied

## Problem
You're seeing this error:
```
Access blocked: ONIX has not completed the Google verification process
Error 403: access_denied
```

This happens because your Google OAuth consent screen is in **Testing** mode and you haven't added yourself as a test user.

## Solution: Add Yourself as a Test User

### Step 1: Go to OAuth Consent Screen
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **OAuth consent screen**

### Step 2: Add Test Users
1. Scroll down to the **Test users** section
2. Click **+ ADD USERS**
3. Add your email address: `laraibzafarlaraibb@gmail.com`
4. Click **ADD**
5. Click **SAVE** at the bottom of the page

### Step 3: Try Again
1. Go back to your app
2. Try signing in again
3. The OAuth flow should work now

## Alternative: Publish Your App (For Production)

If you want anyone to use your app (not just test users), you need to publish it:

### Option A: Keep Testing Mode (Recommended for Development)
- Add all test users manually
- Good for development and testing
- No verification needed

### Option B: Publish to Production (For Public Use)
1. Go to **OAuth consent screen**
2. Scroll to the bottom
3. Click **PUBLISH APP**
4. Confirm the warning
5. Your app will be available to all Google users
6. **Note**: You may need to complete Google's verification process if you request sensitive scopes

## Quick Fix Steps (Summary)

1. **Google Cloud Console** → Your Project
2. **APIs & Services** → **OAuth consent screen**
3. Scroll to **Test users** section
4. Click **+ ADD USERS**
5. Add: `laraibzafarlaraibb@gmail.com`
6. Click **SAVE**
7. Try signing in again

## Important Notes

- **Testing Mode**: Only approved test users can access (up to 100 users)
- **Production Mode**: Anyone with a Google account can access
- For development, **Testing Mode** is usually fine
- You can add multiple test users if needed

## If You Still Have Issues

1. Make sure you're using the correct Google account
2. Clear browser cache and cookies
3. Try in an incognito/private window
4. Check that the email matches exactly (case-sensitive)


