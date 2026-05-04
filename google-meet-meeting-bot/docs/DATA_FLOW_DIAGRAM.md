# Complete Data Flow Diagram - Meeting Transcripts System

## Overview
This document provides a complete visualization of how meeting data flows from Google Meet through the bot, into PostgreSQL database, and finally displayed on the dashboard.

---

## 1. PostgreSQL Database Schema

### Database: `meetingbotpoc`
**Connection:** `postgresql://meetingbot:supersecret@postgres:5432/meetingbotpoc`

### Tables Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    MeetingTranscript                         │
├─────────────────────────────────────────────────────────────┤
│ id              String (UUID, Primary Key)                 │
│ meetingId       String (Unique)                             │
│ userId          String? (Optional)                          │
│ meetingTitle    String? (Optional)                          │
│ createdAt       DateTime                                     │
│                                                              │
│ Relationships:                                               │
│ └─ segments → Segment[] (One-to-Many)                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 1:N
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        Segment                               │
├─────────────────────────────────────────────────────────────┤
│ id              String (UUID, Primary Key)                  │
│ meetingId       String (Foreign Key → MeetingTranscript)     │
│ start           Int (seconds from meeting start)             │
│ end             Int (seconds from meeting start)            │
│ text            String (transcript text)                    │
│ speaker         String (speaker name)                        │
│                                                              │
│ Constraints:                                                 │
│ └─ @@unique([meetingId, start])                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     MeetingSummary                          │
├─────────────────────────────────────────────────────────────┤
│ id              String (UUID, Primary Key)                  │
│ meetingId       String (not unique - can have multiple)     │
│ userId          String? (Optional)                          │
│ meetingTitle    String? (Optional)                          │
│ summaryText     String (AI-generated summary)              │
│ generatedAt     DateTime                                     │
│ model           String (e.g., "gpt-4", "gpt-3.5-turbo")    │
│ isFallback      Boolean (default: false)                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      MeetingJob                             │
├─────────────────────────────────────────────────────────────┤
│ id              String (UUID, Primary Key)                  │
│ userId          String? (Optional)                          │
│ meetingUrl      String (Google Meet URL)                    │
│ meetingTitle    String? (Optional)                          │
│ status          String (default: "pending")                  │
│                 Values: "pending", "transcript_saved",       │
│                        "summarizing", "summarized"          │
│ meetingId       String? (Linked to MeetingTranscript)      │
│ createdAt       DateTime (default: now())                    │
│ updatedAt       DateTime (auto-updated)                     │
│                                                              │
│ Note: Also used to store Action Items                       │
│       (when meetingUrl starts with "action-item-")          │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STEP 1: USER INITIATES MEETING                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ User submits Google Meet URL
                                    │ POST /submit-link
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STEP 2: BACKEND SERVER                              │
│                         (src/backend/server.ts)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Validates Google Meet URL                                               │
│  2. Creates MeetingJob record in PostgreSQL:                                │
│     └─ status: "pending"                                                    │
│     └─ meetingUrl: <Google Meet URL>                                        │
│     └─ userId, meetingTitle: <from request>                                 │
│  3. Launches Bot Container (Docker)                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Docker container launch
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STEP 3: BOT CONTAINER                                │
│                      (src/playwright/runBot.ts)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Generates unique meetingId (UUID)                                       │
│  2. Creates initial MeetingTranscript record:                               │
│     └─ meetingId: <UUID>                                                    │
│     └─ createdAt: <current timestamp>                                       │
│     └─ userId, meetingTitle: <from env vars>                               │
│  3. Launches Playwright browser                                              │
│  4. Authenticates with Google (using auth.json)                             │
│  5. Joins Google Meet meeting                                               │
│  6. Enables captions (Shift+C or button click)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Captions enabled, DOM observer active
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 4: CAPTION CAPTURE (REAL-TIME)                       │
│                      (Browser DOM Observer)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  MutationObserver watches for caption changes:                              │
│                                                                              │
│  For each caption update:                                                    │
│  ├─ Extract speaker name (from badge/aria-label)                           │
│  ├─ Extract text (clean UI elements)                                        │
│  ├─ Filter system messages (e.g., "joined", "raised hand")                │
│  ├─ Extract only NEW text (compare with last seen)                          │
│  └─ Call onCaption(speaker, newText) → Node.js handler                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ onCaption callback
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 5: SEGMENT PROCESSING                                │
│                  (createCaptionHandler in runBot.ts)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  Segment Management Logic:                                                  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────┐                │
│  │ Active Segments Map:                                   │                │
│  │ Key: speaker name                                      │                │
│  │ Value: { speaker, text, start, end }                 │                │
│  └──────────────────────────────────────────────────────┘                │
│                                                                              │
│  When caption received:                                                      │
│  ├─ If speaker changed → Finalize previous speaker's segment              │
│  ├─ If new sentence detected → Finalize & create new segment              │
│  ├─ Otherwise → Append text to existing active segment                     │
│  └─ Update end time to current timestamp                                  │
│                                                                              │
│  Finalized segments → moved to segments[] array                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Every 1 second (FLUSH_EVERY_MS)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 6: PERIODIC FLUSH TO DATABASE                        │
│                      (saveTranscriptBatch in storage.ts)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Timer-based flush (every 1000ms):                                         │
│                                                                              │
│  1. Get finalized segments (not active ones)                              │
│  2. For each segment:                                                       │
│     ├─ Upsert MeetingTranscript (ensure meeting exists)                     │
│     ├─ Check if segment exists (meetingId + speaker + start)               │
│     ├─ If exists → Update (if text/end changed)                            │
│     └─ If new → Create new Segment record                                  │
│                                                                              │
│  Database Operations:                                                        │
│  ┌──────────────────────────────────────────────────────┐                │
│  │ MeetingTranscript.upsert({                             │                │
│  │   where: { meetingId },                                │                │
│  │   update: { createdAt, userId, meetingTitle },          │                │
│  │   create: { meetingId, createdAt, userId, meetingTitle}│                │
│  │ })                                                     │                │
│  └──────────────────────────────────────────────────────┘                │
│  ┌──────────────────────────────────────────────────────┐                │
│  │ Segment.create({                                       │                │
│  │   meetingId,                                           │                │
│  │   speaker,                                             │                │
│  │   text,                                                │                │
│  │   start,  // seconds from meeting start                │                │
│  │   end     // seconds from meeting start                │                │
│  │ })                                                     │                │
│  └──────────────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Meeting ends (exit phrase, timeout, removed)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 7: MEETING END & FINAL FLUSH                         │
│                      (leaveCall, emergencyFlushAndSummarize)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Finalize all active segments                                            │
│  2. Final flush to database (force=true)                                    │
│  3. Trigger summary generation:                                             │
│     └─ POST http://backend:3001/debug/generate-summary/{meetingId}         │
│  4. Notify backend:                                                         │
│     └─ POST http://backend:3001/bot-done                                    │
│        Body: { jobId, meetingId }                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ POST /debug/generate-summary/{meetingId}
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 8: SUMMARY GENERATION                                │
│                    (processSummaryForMeeting in server.ts)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Fetch transcript from database:                                         │
│     └─ getTranscript(meetingId) → MeetingTranscript with segments          │
│  2. Trim transcript if too long (>16,000 chars)                           │
│  3. Call summarizeTranscript() → AI summary generation                      │
│  4. Save summary to MeetingSummary table:                                   │
│     └─ summaryText: <AI-generated summary>                                 │
│     └─ model: "gpt-4" or "gpt-3.5-turbo"                                    │
│     └─ generatedAt: <current timestamp>                                     │
│  5. Save action items to MeetingJob table:                                 │
│     └─ meetingUrl: "action-item-{meetingId}-{timestamp}"                  │
│     └─ meetingTitle: <action item text>                                    │
│     └─ status: "pending"                                                   │
│  6. Update MeetingJob status: "summarized"                                  │
│  7. Trigger email sending (non-blocking)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Data now in PostgreSQL
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 9: DASHBOARD DISPLAY                                │
│                    (Frontend Dashboard)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  User visits dashboard:                                                     │
│                                                                              │
│  1. Frontend calls: GET /api/meeting-bot/meetings                         │
│     └─ Proxies to: GET http://localhost:3001/list/meetings                │
│                                                                              │
│  2. Backend queries PostgreSQL:                                             │
│     ┌──────────────────────────────────────────────────────┐              │
│     │ prisma.meetingTranscript.findMany({                    │              │
│     │   orderBy: { createdAt: "desc" },                     │              │
│     │   include: { segments: { orderBy: { start: "asc" } } } │              │
│     │ })                                                     │              │
│     └──────────────────────────────────────────────────────┘              │
│     ┌──────────────────────────────────────────────────────┐              │
│     │ prisma.meetingJob.findMany({                          │              │
│     │   where: { meetingId: { in: meetingIds } }            │              │
│     │ })                                                     │              │
│     └──────────────────────────────────────────────────────┘              │
│                                                                              │
│  3. Response format:                                                        │
│     [                                                                        │
│       {                                                                      │
│         meetingId: "uuid-123",                                              │
│         title: "Team Standup",                                              │
│         createdAtMs: 1234567890,                                          │
│         meetingUrl: "https://meet.google.com/...",                          │
│         status: "summarized",                                               │
│         segments: [                                                         │
│           { speaker: "John", text: "Hello", start: 0, end: 2 },            │
│           { speaker: "Jane", text: "Hi", start: 2, end: 4 },               │
│           ...                                                                │
│         ]                                                                   │
│       },                                                                     │
│       ...                                                                    │
│     ]                                                                        │
│                                                                              │
│  4. Frontend displays:                                                      │
│     ├─ Meeting list with titles, dates, status                             │
│     ├─ Click meeting → Show transcript page                                │
│     ├─ Transcript page shows:                                              │
│     │   ├─ Segments grouped by speaker                                     │
│     │   ├─ Timestamps (start/end in seconds)                               │
│     │   ├─ Full text for each segment                                      │
│     │   └─ Summary (fetched from /api/meeting-bot/summaries)              │
│     └─ Action items (fetched separately)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Data Flow: Caption to Database

### Real-Time Caption Processing Flow

```
Google Meet Caption DOM
        │
        │ MutationObserver detects change
        ▼
┌───────────────────────────────────────┐
│  Caption Node                          │
│  ├─ Speaker badge: "John Doe"          │
│  └─ Text: "Hello everyone, welcome..." │
└───────────────────────────────────────┘
        │
        │ Extract & clean
        ▼
┌───────────────────────────────────────┐
│  Processing                            │
│  ├─ Filter system messages            │
│  ├─ Extract speaker: "John Doe"      │
│  ├─ Extract text: "Hello everyone..." │
│  └─ Compare with lastSeenText         │
└───────────────────────────────────────┘
        │
        │ Only NEW text extracted
        ▼
┌───────────────────────────────────────┐
│  onCaption(speaker, newText)          │
│  └─ newText: "welcome..."             │
└───────────────────────────────────────┘
        │
        │ Check active segments
        ▼
┌───────────────────────────────────────┐
│  Segment Logic                        │
│                                        │
│  IF speaker changed:                  │
│    └─ Finalize previous segment        │
│    └─ Create new segment              │
│                                        │
│  IF new sentence:                     │
│    └─ Finalize current segment        │
│    └─ Create new segment              │
│                                        │
│  ELSE:                                 │
│    └─ Append to existing segment      │
│                                        │
│  Update:                              │
│    └─ segment.end = currentTime       │
└───────────────────────────────────────┘
        │
        │ Segment finalized
        ▼
┌───────────────────────────────────────┐
│  segments[] array                      │
│  [                                     │
│    {                                   │
│      speaker: "John Doe",              │
│      text: "Hello everyone, welcome...",│
│      start: 0,  // seconds            │
│      end: 5    // seconds              │
│    },                                  │
│    ...                                 │
│  ]                                     │
└───────────────────────────────────────┘
        │
        │ Timer flush (every 1 second)
        ▼
┌───────────────────────────────────────┐
│  saveTranscriptBatch()                │
│                                        │
│  1. Upsert MeetingTranscript           │
│     └─ Ensure meeting record exists   │
│                                        │
│  2. For each segment:                  │
│     ├─ Check if exists                │
│     │   └─ WHERE meetingId + speaker + start│
│     ├─ IF exists: Update             │
│     └─ IF new: Create                 │
│                                        │
│  3. Database writes:                   │
│     └─ INSERT/UPDATE Segment rows     │
└───────────────────────────────────────┘
        │
        │ Prisma ORM
        ▼
┌───────────────────────────────────────┐
│  PostgreSQL Database                   │
│                                        │
│  MeetingTranscript                     │
│  └─ meetingId: "uuid-123"             │
│                                        │
│  Segment (multiple rows)               │
│  ├─ { meetingId, speaker, text, start, end }│
│  ├─ { meetingId, speaker, text, start, end }│
│  └─ ...                                │
└───────────────────────────────────────┘
```

---

## 4. Database Query Patterns

### Common Queries Used by System

#### 1. Create Meeting Job
```sql
INSERT INTO "MeetingJob" (id, "meetingUrl", "userId", "meetingTitle", status, "createdAt", "updatedAt")
VALUES (uuid_generate_v4(), 'https://meet.google.com/...', 'user123', 'Team Standup', 'pending', NOW(), NOW());
```

#### 2. Upsert Meeting Transcript
```sql
INSERT INTO "MeetingTranscript" (id, "meetingId", "userId", "meetingTitle", "createdAt")
VALUES (uuid_generate_v4(), 'meeting-uuid', 'user123', 'Team Standup', NOW())
ON CONFLICT ("meetingId") 
DO UPDATE SET "userId" = EXCLUDED."userId", "meetingTitle" = EXCLUDED."meetingTitle";
```

#### 3. Insert/Update Segment
```sql
-- Check if exists
SELECT id FROM "Segment" 
WHERE "meetingId" = 'meeting-uuid' 
  AND speaker = 'John Doe' 
  AND start = 0;

-- If exists, update
UPDATE "Segment" 
SET text = 'Updated text', end = 5
WHERE id = 'segment-id';

-- If new, insert
INSERT INTO "Segment" (id, "meetingId", speaker, text, start, end)
VALUES (uuid_generate_v4(), 'meeting-uuid', 'John Doe', 'Hello everyone', 0, 5);
```

#### 4. Fetch Transcript for Dashboard
```sql
SELECT 
  mt."meetingId",
  mt."meetingTitle",
  mt."createdAt",
  mt."userId",
  json_agg(
    json_build_object(
      'speaker', s.speaker,
      'text', s.text,
      'start', s.start,
      'end', s.end
    ) ORDER BY s.start
  ) as segments
FROM "MeetingTranscript" mt
LEFT JOIN "Segment" s ON s."meetingId" = mt."meetingId"
GROUP BY mt."meetingId", mt."meetingTitle", mt."createdAt", mt."userId"
ORDER BY mt."createdAt" DESC;
```

#### 5. Fetch Summary
```sql
SELECT "meetingId", "summaryText", "generatedAt", model
FROM "MeetingSummary"
WHERE "meetingId" = 'meeting-uuid'
  AND "isFallback" = false
ORDER BY "generatedAt" DESC
LIMIT 1;
```

#### 6. Fetch Action Items
```sql
SELECT id, "meetingTitle", status, "createdAt"
FROM "MeetingJob"
WHERE "meetingId" = 'meeting-uuid'
  AND "meetingUrl" LIKE 'action-item-%'
ORDER BY "createdAt" ASC;
```

---

## 5. Frontend to Database Flow

### Dashboard Data Retrieval

```
User opens Dashboard
        │
        │ GET /api/meeting-bot/meetings
        ▼
┌───────────────────────────────────────┐
│  Next.js API Route                     │
│  (app/api/meeting-bot/meetings/route.ts)│
└───────────────────────────────────────┘
        │
        │ Proxy to backend
        ▼
┌───────────────────────────────────────┐
│  Backend: GET /list/meetings           │
│  (src/backend/server.ts)                │
└───────────────────────────────────────┘
        │
        │ Prisma queries
        ▼
┌───────────────────────────────────────┐
│  Database Queries                      │
│                                        │
│  1. Find all MeetingTranscript         │
│     └─ Include segments (ordered)     │
│                                        │
│  2. Find related MeetingJob            │
│     └─ Match by meetingId              │
│                                        │
│  3. Join data:                        │
│     └─ Combine transcript + job info  │
└───────────────────────────────────────┘
        │
        │ JSON response
        ▼
┌───────────────────────────────────────┐
│  Response Format                       │
│  [                                     │
│    {                                   │
│      meetingId: "uuid",                │
│      title: "Meeting Title",           │
│      createdAtMs: 1234567890,         │
│      meetingUrl: "https://...",         │
│      status: "summarized",              │
│      segments: [                        │
│        { speaker, text, start, end },  │
│        ...                              │
│      ]                                 │
│    }                                   │
│  ]                                     │
└───────────────────────────────────────┘
        │
        │ React component
        ▼
┌───────────────────────────────────────┐
│  Frontend Display                     │
│  (app/transcripts/page.tsx)            │
│                                        │
│  ├─ Meeting list                       │
│  ├─ Click meeting → Show transcript   │
│  └─ SpeakerTranscript component      │
│     └─ Groups segments by speaker     │
│     └─ Displays with timestamps       │
└───────────────────────────────────────┘
```

### Summary Retrieval

```
User views meeting transcript
        │
        │ GET /api/meeting-bot/summaries
        ▼
┌───────────────────────────────────────┐
│  Backend: GET /list/summaries          │
│  (src/backend/server.ts)                │
└───────────────────────────────────────┘
        │
        │ Prisma query
        ▼
┌───────────────────────────────────────┐
│  SELECT "meetingId", "summaryText",   │
│         "generatedAt", model          │
│  FROM "MeetingSummary"                 │
│  ORDER BY "generatedAt" DESC           │
└───────────────────────────────────────┘
        │
        │ JSON response
        ▼
┌───────────────────────────────────────┐
│  Frontend displays summary text       │
│  in transcript page                    │
└───────────────────────────────────────┘
```

---

## 6. Key Data Transformations

### 1. Caption Text → Segment
```
Input: DOM caption node
  ├─ Speaker: "John Doe"
  └─ Text: "Hello everyone, welcome to the meeting"

Processing:
  ├─ Filter system messages
  ├─ Extract only new text (compare with last seen)
  └─ Calculate timestamps (seconds from meeting start)

Output: Segment object
  {
    speaker: "John Doe",
    text: "welcome to the meeting",  // Only new part
    start: 5,  // seconds
    end: 8     // seconds
  }
```

### 2. Segments → Database Rows
```
Input: Segment[]
  [
    { speaker: "John", text: "Hello", start: 0, end: 2 },
    { speaker: "Jane", text: "Hi", start: 2, end: 4 }
  ]

Database Operations:
  1. MeetingTranscript.upsert({ meetingId, ... })
  2. For each segment:
     Segment.create({
       meetingId: "uuid",
       speaker: "John",
       text: "Hello",
       start: 0,
       end: 2
     })
```

### 3. Database → Dashboard Format
```
Input: Prisma query result
  {
    meetingId: "uuid",
    meetingTitle: "Team Standup",
    createdAt: Date,
    segments: [
      { speaker: "John", text: "Hello", start: 0, end: 2 },
      ...
    ]
  }

Transformation:
  ├─ Convert createdAt to milliseconds
  ├─ Join with MeetingJob for status/URL
  └─ Format segments array

Output: Dashboard JSON
  {
    meetingId: "uuid",
    title: "Team Standup",
    createdAtMs: 1234567890,
    status: "summarized",
    segments: [...]
  }
```

---

## 7. Summary Generation Flow

```
Meeting ends
        │
        │ Final flush completed
        ▼
┌───────────────────────────────────────┐
│  Bot calls:                            │
│  POST /debug/generate-summary/{id}    │
└───────────────────────────────────────┘
        │
        │ Backend receives request
        ▼
┌───────────────────────────────────────┐
│  processSummaryForMeeting()            │
│                                        │
│  1. Fetch transcript:                 │
│     └─ getTranscript(meetingId)        │
│        └─ Prisma: MeetingTranscript    │
│           with segments                │
│                                        │
│  2. Trim if needed (>16K chars)       │
│                                        │
│  3. Call AI:                           │
│     └─ summarizeTranscript(transcript) │
│        └─ Uses AssemblyAI or OpenAI   │
│                                        │
│  4. Save summary:                      │
│     └─ saveSummary()                   │
│        └─ INSERT INTO MeetingSummary  │
│                                        │
│  5. Save action items:                 │
│     └─ saveActionItems()               │
│        └─ INSERT INTO MeetingJob      │
│           (with "action-item-" prefix)│
│                                        │
│  6. Update job status:                 │
│     └─ status = "summarized"          │
└───────────────────────────────────────┘
        │
        │ Summary saved to database
        ▼
┌───────────────────────────────────────┐
│  MeetingSummary table                  │
│  └─ meetingId: "uuid"                │
│  └─ summaryText: "AI-generated..."   │
│  └─ model: "gpt-4"                    │
│  └─ generatedAt: timestamp           │
└───────────────────────────────────────┘
```

---

## 8. Database Relationships Summary

```
MeetingTranscript (1) ────< (N) Segment
     │
     │ meetingId (Foreign Key)
     │
     └───> MeetingSummary (N)  [One meeting can have multiple summaries]
     │
     └───> MeetingJob (N)      [One meeting can have multiple jobs/action items]
```

**Key Relationships:**
- `MeetingTranscript.meetingId` → `Segment.meetingId` (One-to-Many)
- `MeetingTranscript.meetingId` → `MeetingSummary.meetingId` (One-to-Many, not enforced by FK)
- `MeetingTranscript.meetingId` → `MeetingJob.meetingId` (One-to-Many, not enforced by FK)

**Constraints:**
- `MeetingTranscript.meetingId` is UNIQUE
- `Segment` has composite unique constraint: `[meetingId, start]`
- `MeetingSummary.meetingId` is NOT unique (can have multiple summaries per meeting)

---

## 9. Data Flow Summary

**Complete Journey:**
1. **User** submits Google Meet URL
2. **Backend** creates MeetingJob (status: "pending")
3. **Bot** joins meeting, enables captions
4. **DOM Observer** captures captions in real-time
5. **Bot** processes captions into segments
6. **Bot** flushes segments to PostgreSQL every 1 second
7. **Meeting ends** → Final flush + summary generation triggered
8. **Backend** generates AI summary → Saves to MeetingSummary
9. **Frontend** queries database → Displays transcripts on dashboard

**Database Tables Involved:**
- `MeetingJob` - Tracks meeting processing status
- `MeetingTranscript` - Stores meeting metadata
- `Segment` - Stores individual caption segments
- `MeetingSummary` - Stores AI-generated summaries

**Key Timestamps:**
- `MeetingTranscript.createdAt` - When meeting started
- `Segment.start/end` - Relative to meeting start (in seconds)
- `MeetingSummary.generatedAt` - When summary was generated
- `MeetingJob.createdAt/updatedAt` - Job lifecycle timestamps

---

## 10. Viewing Data in Prisma Studio

To view the database:

```bash
docker exec -it meetingbot-backend npx prisma studio --schema=/app/src/backend/schema.prisma --browser none
```

Then open: **http://localhost:5556**

You can browse:
- **MeetingTranscript** - All meetings
- **Segment** - All caption segments (linked to meetings)
- **MeetingSummary** - AI-generated summaries
- **MeetingJob** - Job status and action items

