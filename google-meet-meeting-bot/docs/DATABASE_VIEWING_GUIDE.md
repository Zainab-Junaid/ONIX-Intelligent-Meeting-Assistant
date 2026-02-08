# Database Viewing Guide

## How to View Data in Each Database

---

## 1. PostgreSQL (PgAdmin) ✅ Already Setup

You have PgAdmin running. To view the new tables:

### Key Tables to Check:
```sql
-- View all Meetings (new lifecycle table)
SELECT id, title, status, "startTime", "endTime", "mongoTranscriptId" 
FROM "Meeting" ORDER BY "createdAt" DESC;

-- View Meeting Jobs (legacy)
SELECT id, "meetingId", "meetingUrl", status 
FROM "MeetingJob" ORDER BY "createdAt" DESC;

-- View Summaries
SELECT id, "meetingId", "summaryText", "generatedAt" 
FROM "MeetingSummary" ORDER BY "generatedAt" DESC;

-- View Action Items
SELECT id, "meetingId", title, status 
FROM "ActionItem" ORDER BY "createdAt" DESC;

-- Check legacy tables are NOT growing
SELECT COUNT(*) FROM "Segment";
SELECT COUNT(*) FROM "MeetingTranscript";
```

---

## 2. MongoDB (MongoDB Compass)

### Install MongoDB Compass
Download from: https://www.mongodb.com/try/download/compass

### Connect
Connection string: `mongodb://localhost:27017`

### View Transcripts
1. Open Compass → Connect
2. Select database: `meeting-transcripts`
3. Click collection: `meetingtranscripts`
4. You'll see documents like:
```json
{
  "meetingId": "abc123",
  "userId": "user456",
  "meetingTitle": "Team Standup",
  "segments": [
    { "speaker": "John", "text": "Hello everyone", "start": 0, "end": 5 },
    { "speaker": "Jane", "text": "Hi John", "start": 5, "end": 8 }
  ],
  "createdAt": "2024-01-21T10:00:00Z"
}
```

### Useful Queries (in Compass filter bar):
```javascript
// Find all transcripts
{}

// Find by meetingId
{ "meetingId": "your-meeting-id" }

// Find transcripts with more than 10 segments
{ "segments.10": { "$exists": true } }

// Sort by newest first
// Click the dropdown and select "createdAt" descending
```

---

## 3. Redis (RedisInsight)

### Install RedisInsight
Download from: https://redis.io/insight/

### Connect
- Host: `localhost`
- Port: `6379`
- Name: `Local Redis`

### What to Look For:

#### Active Meetings Set
- Key: `active_meetings`
- Type: Set
- Contains: Meeting IDs currently being processed

#### Caption Buffers (DURING meeting)
- Key: `meeting:{meetingId}:buffer`
- Type: List
- Contains: Pending captions waiting to be flushed

#### Last Active Timestamp
- Key: `meeting:{meetingId}:last_active`
- Type: String
- Contains: Unix timestamp of last caption

#### Dead Letter Queue (if errors)
- Key: `meeting:{meetingId}:failed`
- Type: List
- Contains: Failed items for retry

---

## Does Redis Data Disappear After Meeting?

**YES - by design!** Here's the flow:

```
DURING MEETING:
┌─────────────┐
│ Redis Queue │ ← Captions arrive here
│ (temporary) │
└──────┬──────┘
       │ flushWorker runs every 1-5 seconds
       ▼
┌─────────────┐
│  MongoDB    │ ← Transcripts persisted here
│ (permanent) │
└─────────────┘

AFTER MEETING:
- Redis buffers: EMPTIED (flushed to MongoDB)
- MongoDB: KEEPS all transcript data
- PostgreSQL: KEEPS meeting metadata + summaries
```

### To See Real-time Redis Data:
You must check Redis **DURING** an active meeting. After flushing, the data moves to MongoDB.

---

## Summary/Action Items Pipeline Status

The pipeline IS working correctly with new PostgreSQL:

```
/bot-done endpoint:
1. ✅ Updates PostgreSQL Meeting status → 'completed'
2. ✅ Calls processSummaryForMeeting()
3. ✅ Fetches transcript from MongoDB
4. ✅ Runs AI summarizer
5. ✅ Saves MeetingSummary to PostgreSQL
6. ✅ Saves ActionItems to PostgreSQL
```

### To Verify:
```sql
-- Check if summaries are being generated
SELECT COUNT(*) FROM "MeetingSummary";

-- View latest summary
SELECT "meetingId", LEFT("summaryText", 200), "generatedAt" 
FROM "MeetingSummary" 
ORDER BY "generatedAt" DESC LIMIT 1;
```

---

## Quick Test Commands

```bash
# Run the comprehensive test suite
cd google-meet-meeting-bot
npx ts-node tests/integration-test-suite.ts

# Check PostgreSQL directly
docker exec -it meetingbot-db psql -U meetingbot -d meetingbotpoc -c "SELECT * FROM \"Meeting\";"

# Check MongoDB directly
mongosh --eval "db.getMongo().getDB('meeting-transcripts').meetingtranscripts.find().count()"

# Check Redis directly
redis-cli SMEMBERS active_meetings
redis-cli KEYS "meeting:*"
```
