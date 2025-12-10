# How to View Database Transcripts

## Option 1: Prisma Studio (Easiest - Visual UI)

```bash
cd google-meet-meeting-bot
docker exec -it meetingbot-backend npx prisma studio --schema=/app/src/backend/schema.prisma --browser none
```

This opens a web interface at `http://localhost:5556` where you can:
- Browse all `MeetingTranscript` records
- View all `Segment` records
- Filter, search, and edit data
- See relationships between tables

## Option 2: Backend Debug Endpoint

After starting the backend, visit:
```
http://localhost:3001/debug/transcripts
```

This returns JSON with:
- Last 10 meetings
- First 100 segments per meeting
- Truncated text previews (first 100 chars)

## Option 3: Direct PostgreSQL Query

### Connect to Database
```bash
# Find PostgreSQL container name
docker ps | grep postgres

# Connect to database
docker exec -it <postgres-container-name> psql -U meetingbot -d meetingbotpoc
```

### Useful Queries

```sql
-- View all transcripts with segment counts
SELECT 
  "meetingId", 
  "meetingTitle", 
  "createdAt",
  (SELECT COUNT(*) FROM "Segment" WHERE "Segment"."meetingId" = "MeetingTranscript"."meetingId") as segment_count
FROM "MeetingTranscript"
ORDER BY "createdAt" DESC
LIMIT 20;

-- View all segments for a specific meeting
SELECT 
  speaker, 
  text, 
  start, 
  end,
  (end - start) as duration_seconds
FROM "Segment" 
WHERE "meetingId" = '<your-meeting-id>'
ORDER BY start ASC;

-- View segments grouped by speaker
SELECT 
  speaker,
  COUNT(*) as segment_count,
  SUM(end - start) as total_duration_seconds,
  STRING_AGG(text, ' | ' ORDER BY start) as all_text
FROM "Segment" 
WHERE "meetingId" = '<your-meeting-id>'
GROUP BY speaker
ORDER BY MIN(start);

-- Find meetings with duplicate/repeated text in segments
SELECT 
  mt."meetingId",
  mt."meetingTitle",
  s.speaker,
  COUNT(*) as segment_count,
  AVG(LENGTH(s.text)) as avg_text_length
FROM "MeetingTranscript" mt
JOIN "Segment" s ON s."meetingId" = mt."meetingId"
GROUP BY mt."meetingId", mt."meetingTitle", s.speaker
HAVING COUNT(*) > 50  -- Meetings with many segments
ORDER BY COUNT(*) DESC;

-- View full transcript for a meeting (all segments in order)
SELECT 
  s.speaker,
  s.text,
  s.start,
  s.end,
  TO_CHAR(INTERVAL '1 second' * s.start, 'MI:SS') as start_time,
  TO_CHAR(INTERVAL '1 second' * s.end, 'MI:SS') as end_time
FROM "Segment" s
WHERE s."meetingId" = '<your-meeting-id>'
ORDER BY s.start ASC;
```

## Option 4: Export to CSV

```bash
docker exec -it <postgres-container-name> psql -U meetingbot -d meetingbotpoc -c "
COPY (
  SELECT 
    mt.\"meetingId\",
    mt.\"meetingTitle\",
    s.speaker,
    s.text,
    s.start,
    s.end
  FROM \"MeetingTranscript\" mt
  JOIN \"Segment\" s ON s.\"meetingId\" = mt.\"meetingId\"
  ORDER BY mt.\"createdAt\" DESC, s.start ASC
) TO STDOUT WITH CSV HEADER
" > transcripts_export.csv
```

