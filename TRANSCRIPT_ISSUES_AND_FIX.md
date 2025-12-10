# Transcript Issues Analysis and Fix

## Where the Issue Lies

### Problem 1: Caption Scraping Gets Entire Caption Region
**Location**: `google-meet-meeting-bot/src/playwright/runBot.ts` (lines 530-590)

**Issue**: Google Meet's caption region s   hows ALL previous captions accumulated. When we scrape it, we get the entire history, not just new text.

**Example**: 
- First caption: "Hello"
- Second caption: "Hello. How are you?"
- Third caption: "Hello. How are you? I'm fine."

Our scraper sends all three as separate segments, but they all contain the accumulated text.

### Problem 2: System Messages Not Filtered
**Location**: `google-meet-meeting-bot/src/playwright/runBot.ts` (line 151)

**Issue**: Messages like "X joined", "X has raised a hand", "Reactions are not being announced" are being captured as segments.

### Problem 3: No Text Difference Tracking
**Location**: `google-meet-meeting-bot/src/playwright/runBot.ts` (line 187-277)

**Issue**: We don't track what text we've already seen, so we can't extract only the NEW part.

## How Segments Are Stored in Database

### Database Schema (PostgreSQL via Prisma)
```prisma
model Segment {
    id                String            @id @default(uuid())
    meetingId         String
    start             Int               // Start time in seconds
    end               Int               // End time in seconds
    text              String            // The transcript text
    speaker           String            // Speaker name
}
```

### Storage Flow
1. Bot scrapes captions → `createCaptionHandler()` processes them
2. Segments are stored in memory (`activeSegments` map)
3. When speaker changes or segment finalizes → moved to `segments` array
4. Every 5 seconds → `flushTimer` saves to database via `saveTranscriptBatch()`
5. Database stores segments with `meetingId`, `speaker`, `text`, `start`, `end`

### Retrieval Flow
1. Frontend calls `/api/meeting-bot/meetings`
2. Backend `/list/meetings` queries PostgreSQL:
   ```typescript
   const transcripts = await prisma.meetingTranscript.findMany({
     include: { segments: { orderBy: { start: "asc" } } }
   });
   ```
3. Segments are returned ordered by `start` time

## How to View Database

### Option 1: Using Prisma Studio (Recommended)
```bash
cd google-meet-meeting-bot
npx prisma studio
```
This opens a web UI at `http://localhost:5555` where you can:
- View all `MeetingTranscript` records
- View all `Segment` records
- Filter and search

### Option 2: Direct PostgreSQL Query
```bash
# Connect to PostgreSQL container
docker exec -it <postgres-container-name> psql -U meetingbot -d meetingbotpoc

# View all transcripts
SELECT meetingId, "meetingTitle", "createdAt", 
       (SELECT COUNT(*) FROM "Segment" WHERE "Segment"."meetingId" = "MeetingTranscript"."meetingId") as segment_count
FROM "MeetingTranscript"
ORDER BY "createdAt" DESC;

# View segments for a specific meeting
SELECT speaker, text, start, end 
FROM "Segment" 
WHERE "meetingId" = '<your-meeting-id>'
ORDER BY start ASC;

# View all segments with transcript info
SELECT 
  mt."meetingId",
  mt."meetingTitle",
  s.speaker,
  s.text,
  s.start,
  s.end
FROM "MeetingTranscript" mt
JOIN "Segment" s ON s."meetingId" = mt."meetingId"
ORDER BY mt."createdAt" DESC, s.start ASC;
```

### Option 3: Backend API Endpoint
Add this to `google-meet-meeting-bot/src/backend/server.ts`:
```typescript
app.get("/debug/transcripts", async (_req, res) => {
  const transcripts = await prisma.meetingTranscript.findMany({
    include: { segments: { orderBy: { start: "asc" } } },
    orderBy: { createdAt: "desc" }
  });
  res.json(transcripts);
});
```

## The Fix

### Solution: Track Last Seen Text and Extract Only New Content

1. **Track last seen text per speaker** - Store what we've already processed
2. **Extract only new text** - Calculate the difference between current and last seen
3. **Better system message filtering** - Enhanced regex patterns
4. **Smart segment creation** - Only create new segments for genuinely new sentences

### Implementation Changes

1. Add `lastSeenText` map to track processed text per speaker
2. In `createCaptionHandler()`, extract only NEW text:
   ```typescript
   const lastText = lastSeenText.get(speaker) || "";
   let newText = caption;
   if (caption.startsWith(lastText)) {
     newText = caption.substring(lastText.length).trim();
   }
   ```
3. Only process if `newText` is meaningful and different
4. Update `lastSeenText` after processing

