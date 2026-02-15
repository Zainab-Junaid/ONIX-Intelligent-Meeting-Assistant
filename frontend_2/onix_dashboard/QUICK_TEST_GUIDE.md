# Quick Test Guide - Bot Integration

## Easiest Method: Use the Test Page

### Step 1: Use the Test Token Page

1. Navigate to: `http://localhost:3000/test-token`
2. Click "Get Token" button
3. Click "Create Test Data" button
4. Done! Refresh your dashboard to see test meetings.

---

## Alternative Method: Use the Test API Endpoint Directly

### Step 1: Get Your Firebase Token

1. Open your dashboard in the browser
2. Open Developer Console (F12)
3. Run this command to get your token:

```javascript
// Method 1: Access React context (if available)
// First, check if React DevTools can help you access the auth context
// Or use this method:

// Method 2: Use the window object if auth is exposed
// The dashboard uses Firebase v9+ modular SDK, so we need to access it differently

// Try this - it accesses the auth from the React component context
// If this doesn't work, use Method 3 below
(async () => {
  // Get the auth instance from the page
  const { getAuth } = await import('firebase/auth');
  const { initializeApp } = await import('firebase/app');
  
  // Initialize with the same config (you may need to check your .env)
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    // ... other config
  });
  
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    console.log('Your token:', token);
    window.testToken = token;
    return token;
  } else {
    console.error('Not logged in');
  }
})();
```

**Easier Method 3: Use the API directly with a helper function**

```javascript
// Simple helper - just call the API endpoint
async function createTestData() {
  // This will use the browser's cookies/session if you're logged in
  // But we need the token, so let's get it from the page's React context
  
  // Actually, the easiest way is to add this to a React component temporarily
  // Or use the method below that works with the auth provider
}
```

### Step 2: Create Test Data via API (Updated Method)

**EASIEST WAY**: Add this temporary code to get your token. In the browser console:

```javascript
// Access the auth context from the React app
// This works because the dashboard uses React context for auth
(async () => {
  try {
    // Method: Access the auth from the window if exposed, or use fetch with credentials
    // Since we can't easily access React context from console, let's use a workaround:
    
    // Create a test button on the page that gets the token
    const btn = document.createElement('button');
    btn.textContent = 'Get Token & Create Test Data';
    btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;padding:10px;background:#007bff;color:white;border:none;border-radius:5px;cursor:pointer;';
    btn.onclick = async () => {
      try {
        // We'll need to get the token from the auth context
        // For now, let's use a simpler approach - make the API call and it will handle auth
        alert('Please use the method in Step 3 instead - it\'s easier!');
      } catch (e) {
        console.error(e);
      }
    };
    document.body.appendChild(btn);
    console.log('Button added to page - but use Step 3 method instead!');
  } catch (e) {
    console.error('Error:', e);
  }
})();
```

// Create test data
fetch('/api/meeting-bot/test-data', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ count: 2 })
})
.then(res => res.json())
.then(data => {
  console.log('✅ Test data created!', data);
  alert('Test data created! Refresh the page to see meetings.');
})
.catch(err => {
  console.error('❌ Error:', err);
  alert('Error: ' + err.message);
});
```

### Step 3: Refresh Dashboard

Refresh your dashboard page. You should now see:
- **2 test bot meetings** in the Meetings page
- Test meetings in the Home page (recent transcripts)
- Test summaries in the Summaries page

## Alternative: Use the Script

If the API method doesn't work, use the Node.js script:

1. **Set your Firebase UID**:
   ```bash
   export TEST_USER_ID="your-firebase-uid-here"
   ```

2. **Run the script**:
   ```bash
   cd frontend_2/onix_dashboard
   node scripts/test-bot-data.js
   ```

3. **Refresh your dashboard**

## What Gets Created

The test data includes:
- ✅ MeetingJob records in PostgreSQL (with your userId)
- ✅ MeetingSummary records in PostgreSQL
- ✅ MeetingTranscript records in MongoDB (if MongoDB is available)

## Verify It Works

After creating test data, check:

1. **API Endpoint Test** (in browser console):
   ```javascript
   const token = await firebase.auth().currentUser.getIdToken();
   fetch('/api/meeting-bot/meetings', {
     headers: { 'Authorization': `Bearer ${token}` }
   })
   .then(r => r.json())
   .then(data => console.log('Bot meetings:', data));
   ```

2. **Dashboard Pages**:
   - Home page → Should show test meetings in "Recent Transcripts"
   - Meetings page → Bot tab → Should show test meetings
   - Transcripts page → Should show test meetings

## Troubleshooting

### "No token provided"
- Make sure you're logged into the dashboard
- Check that Firebase auth is working

### "Failed to fetch meetings from backend"
- This is OK! The API will still work using database filtering
- The bot backend (port 3001) doesn't need to be running for testing

### "Could not query MeetingJob"
- Check PostgreSQL is running
- Verify DATABASE_URL environment variable
- Default: `postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc`

### No meetings appear
- Check that your Firebase UID matches the userId in the database
- Verify test data was created: Run the GET endpoint to check:
  ```javascript
  const token = await firebase.auth().currentUser.getIdToken();
  fetch('/api/meeting-bot/test-data', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(r => r.json())
  .then(console.log);
  ```

## Clean Up Test Data

To remove test data:

```sql
-- In PostgreSQL
DELETE FROM "MeetingSummary" WHERE "meetingId" LIKE 'test-meeting-%';
DELETE FROM "MeetingJob" WHERE "id" LIKE 'test-job-%';
```

Or use MongoDB:
```javascript
db.meetingtranscripts.deleteMany({ meetingId: /^test-meeting-/ });
```

