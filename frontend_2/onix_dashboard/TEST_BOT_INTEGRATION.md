# Testing Bot Integration Without Running the Bot

This guide explains how to test the bot integration with the dashboard without actually running the bot.

## Prerequisites

1. **PostgreSQL Database**: The bot database should be running and accessible
   - Default connection: `postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc`
   - Or set `DATABASE_URL` environment variable

2. **MongoDB Database** (Optional but recommended):
   - Default connection: `mongodb://localhost:27017/meeting-transcripts`
   - Or set `MONGODB_URI` environment variable
   - If MongoDB is not available, test data will still be created in PostgreSQL

3. **Firebase Authentication**: You need to be logged into the dashboard

## Method 1: Using the Test API Endpoint (Recommended)

### Step 1: Open Browser Console

1. Open your dashboard in the browser
2. Open Developer Tools (F12)
3. Go to the Console tab

### Step 2: Get Your Firebase Token

Run this in the console to get your auth token:

```javascript
// Get the current user's token
const auth = firebase.auth();
const user = auth.currentUser;
if (user) {
  user.getIdToken().then(token => {
    console.log('Your token:', token);
    window.testToken = token; // Save for later use
  });
} else {
  console.error('Not logged in');
}
```

### Step 3: Create Test Data

Run this in the console (or use a tool like Postman):

```javascript
// Create 2 test meetings
fetch('/api/meeting-bot/test-data', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${window.testToken}`
  },
  body: JSON.stringify({ count: 2 })
})
.then(res => res.json())
.then(data => {
  console.log('Test data created:', data);
  // Refresh the page to see the meetings
  window.location.reload();
})
.catch(err => console.error('Error:', err));
```

### Step 4: Verify Test Data

Check if test data was created:

```javascript
fetch('/api/meeting-bot/test-data', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${window.testToken}`
  }
})
.then(res => res.json())
.then(data => console.log('Test data status:', data))
.catch(err => console.error('Error:', err));
```

## Method 2: Using a Simple Test Script

Create a file `test-bot-integration.js` in the dashboard root:

```javascript
// test-bot-integration.js
// Run with: node test-bot-integration.js

const { Pool } = require('pg');
const mongoose = require('mongoose');

// Configuration
const userId = 'YOUR_FIREBASE_USER_ID'; // Replace with your actual Firebase UID
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/meeting-transcripts';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc';

async function createTestData() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Define schema
    const SegmentSchema = new mongoose.Schema({
      segmentId: String,
      start: Number,
      end: Number,
      text: String,
      speaker: String,
    }, { _id: false });

    const MeetingTranscriptSchema = new mongoose.Schema({
      meetingId: { type: String, unique: true },
      userId: String,
      meetingTitle: String,
      segments: [SegmentSchema],
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    });

    const MeetingTranscript = mongoose.models.MeetingTranscript || 
      mongoose.model('MeetingTranscript', MeetingTranscriptSchema);

    // Create test meeting
    const meetingId = `test-meeting-${userId}-${Date.now()}`;
    const segments = [
      { segmentId: '1', start: 0, end: 5, text: 'Hello everyone', speaker: 'John Doe' },
      { segmentId: '2', start: 5, end: 10, text: 'Thank you for joining', speaker: 'Jane Smith' },
    ];

    // Create in MongoDB
    await MeetingTranscript.findOneAndUpdate(
      { meetingId },
      { meetingId, userId, meetingTitle: 'Test Meeting', segments, createdAt: new Date(), updatedAt: new Date() },
      { upsert: true }
    );
    console.log('✅ Created MongoDB transcript');

    // Create in PostgreSQL
    await pool.query(`
      INSERT INTO "MeetingJob" ("id", "userId", "meetingUrl", "meetingTitle", "status", "meetingId", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [`test-job-${meetingId}`, userId, 'https://meet.google.com/test', 'Test Meeting', 'summarized', meetingId]);

    await pool.query(`
      INSERT INTO "MeetingSummary" ("id", "meetingId", "summaryText", "generatedAt", "model", "isFallback")
      VALUES ($1, $2, $3, NOW(), $4, false)
    `, [`test-summary-${meetingId}`, meetingId, 'Test summary text', 'test-model']);

    console.log('✅ Created PostgreSQL records');
    console.log(`✅ Test meeting created: ${meetingId}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
    await mongoose.disconnect();
  }
}

createTestData();
```

## Method 3: Direct Database Insertion

If you prefer to insert data directly into the database:

### PostgreSQL (MeetingJob and MeetingSummary)

```sql
-- Replace 'YOUR_USER_ID' with your Firebase UID
INSERT INTO "MeetingJob" ("id", "userId", "meetingUrl", "meetingTitle", "status", "meetingId", "createdAt", "updatedAt")
VALUES (
  'test-job-123',
  'YOUR_USER_ID',
  'https://meet.google.com/test',
  'Test Bot Meeting',
  'summarized',
  'test-meeting-123',
  NOW(),
  NOW()
);

INSERT INTO "MeetingSummary" ("id", "meetingId", "summaryText", "generatedAt", "model", "isFallback")
VALUES (
  'test-summary-123',
  'test-meeting-123',
  'This is a test summary for testing the bot integration.',
  NOW(),
  'test-model',
  false
);
```

### MongoDB (Transcripts)

```javascript
// In MongoDB shell or using a MongoDB client
db.meetingtranscripts.insertOne({
  meetingId: 'test-meeting-123',
  userId: 'YOUR_USER_ID',
  meetingTitle: 'Test Bot Meeting',
  segments: [
    {
      segmentId: 'seg-1',
      start: 0,
      end: 5,
      text: 'Hello everyone, welcome to the test meeting.',
      speaker: 'John Doe'
    },
    {
      segmentId: 'seg-2',
      start: 5,
      end: 10,
      text: 'Thank you for joining us today.',
      speaker: 'Jane Smith'
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
});
```

## Verifying the Integration

After creating test data:

1. **Refresh the Dashboard**: The test meetings should appear in:
   - Home page (recent transcripts)
   - Meetings page (bot meetings tab)
   - Transcripts page (bot meetings)

2. **Check API Endpoints**:
   - `/api/meeting-bot/meetings` - Should return your test meetings
   - `/api/meeting-bot/summaries` - Should return your test summaries

3. **Verify Filtering**: 
   - Only meetings with your `userId` should appear
   - Other users' meetings should not be visible

## Troubleshooting

### "No token provided" error
- Make sure you're logged into the dashboard
- Check that the Authorization header is being sent correctly

### "Failed to fetch meetings from backend"
- Ensure the bot backend is running on `http://localhost:3001`
- Check that `/list/meetings` endpoint is accessible

### "Could not query MeetingJob"
- Verify PostgreSQL connection string is correct
- Check that the `MeetingJob` table exists
- Ensure database credentials are correct

### MongoDB connection issues
- MongoDB is optional - if it fails, PostgreSQL data will still work
- Check `MONGODB_URI` environment variable
- Ensure MongoDB is running and accessible

## Cleaning Up Test Data

To remove test data:

```sql
-- PostgreSQL
DELETE FROM "MeetingSummary" WHERE "meetingId" LIKE 'test-meeting-%';
DELETE FROM "MeetingJob" WHERE "id" LIKE 'test-job-%';
```

```javascript
// MongoDB
db.meetingtranscripts.deleteMany({ meetingId: /^test-meeting-/ });
```

