# Transcript Fixes Applied

## Problems Identified

1. **Accumulated Text Issue**: Caption scraping was getting the entire caption region (all previous text), not just new text
2. **System Messages**: Messages like "X joined", "X has raised a hand" were being captured
3. **No Text Tracking**: No mechanism to track what text was already processed
4. **Duplicate Segments**: Same text appearing in multiple segments

## Fixes Applied

### 1. Added Text Difference Tracking
**File**: `google-meet-meeting-bot/src/playwright/runBot.ts`

- Added `lastSeenText` Map to track processed text per speaker in browser context
- Created `extractNewText()` function that:
  - Compares current text with last seen text
  - Extracts only the NEW portion (difference)
  - Handles cases where text is completely new vs. continuation

### 2. Enhanced System Message Filtering
**File**: `google-meet-meeting-bot/src/playwright/runBot.ts`

- Updated `isNotRealCaption()` regex to filter:
  - "joined" messages
  - "has raised a hand" messages
  - "Reactions are not being announced"
  - UI elements like "keep_outline", "pin", "mic_none", "more_vert"
  - "Combat." and "Hello. Hello. For." patterns

### 3. Improved Caption Detection
**File**: `google-meet-meeting-bot/src/playwright/runBot.ts`

- Modified `checkForCaptions()` to:
  - Process individual caption nodes instead of entire regions
  - Filter out system messages before processing
  - Only check aria-live regions for actual announcements

### 4. Smarter Segment Creation
**File**: `google-meet-meeting-bot/src/playwright/runBot.ts`

- Updated segment creation logic to:
  - Append new text to existing segment if it's a continuation
  - Create new segment if new text looks like a new sentence (starts with capital, previous ends with punctuation)
  - Only process meaningful text (length > 5, not system messages)

### 5. Reduced Mutation Observer Frequency
**File**: `google-meet-meeting-bot/src/playwright/runBot.ts`

- Changed `checkForCaptions()` to run every 3 mutations instead of every mutation
- Prevents excessive processing of DOM changes

### 6. Added Database Viewing Tools
**Files**: 
- `google-meet-meeting-bot/VIEW_DATABASE.md` - Guide for viewing database
- `google-meet-meeting-bot/src/backend/server.ts` - Added `/debug/transcripts` endpoint

## How It Works Now

1. **Caption Scraping**:
   - Browser tracks `lastSeenText` per speaker
   - When caption updates, `extractNewText()` calculates difference
   - Only NEW text is sent to `onCaption()` handler

2. **Segment Creation**:
   - New text is appended to active segment if it's a continuation
   - New segment is created if text looks like a new sentence
   - Segments are finalized when speaker changes

3. **Database Storage**:
   - Segments stored with `speaker`, `text`, `start`, `end`
   - Ordered by `start` time when retrieved
   - No duplicate accumulated text

## Testing

After rebuilding the bot container, test with a new meeting:

1. Start a new meeting
2. Have different speakers talk
3. Check transcript in frontend - should show:
   - Clean separation between speakers
   - No repeated/accumulated text
   - No system messages
   - Proper sentence breaks

## Viewing Database

See `VIEW_DATABASE.md` for instructions on:
- Using Prisma Studio
- Querying PostgreSQL directly
- Using the `/debug/transcripts` endpoint

