# Deepgram Speaker Diarization Integration Plan

## 📋 Overview

This document outlines the complete plan to integrate Deepgram's `nova-2` model with streaming speaker diarization into the ONIX Meeting Assistant, while maintaining the existing caption scraping as a fallback mechanism.

---

## 🎯 Goals

1. **Integrate Deepgram Streaming Transcription** with speaker diarization
2. **Group words into sentences** based on speaker changes
3. **Display speaker names** above transcript text (Otter-style)
4. **Color-code speakers** (Speaker 0 = Blue, Speaker 1 = Orange, etc.)
5. **Enable speaker renaming** - click to rename, updates all instances
6. **Maintain caption scraping** as fallback/backup

---

## 🏗️ Architecture Changes

### Current Flow:
```
Google Meet → Playwright Bot → Caption Scraping → Segments → PostgreSQL → Frontend Display
```

### New Flow (Dual Mode):
```
Google Meet → Playwright Bot → ┌─→ Caption Scraping (Fallback)
                                │
                                └─→ Audio Capture → Deepgram Streaming → 
                                    Speaker Diarization → Sentence Grouping → 
                                    Segments → PostgreSQL → Frontend Display
```

---

## 📝 Detailed Implementation Plan

### Phase 1: Backend - Deepgram Integration

#### 1.1 Install Dependencies
**File:** `google-meet-meeting-bot/package.json`
- Add `@deepgram/sdk` package
- Add `puppeteer-stream` or similar for audio capture
- Add `fluent-ffmpeg` for audio processing (if needed)

#### 1.2 Create Deepgram Service
**New File:** `google-meet-meeting-bot/src/deepgram-service.ts`
- Initialize Deepgram client with API key
- Create streaming transcription function
- Handle speaker diarization (enable `diarize: true`)
- Process real-time transcription results
- Group words into sentences by speaker

**Key Features:**
- Use `nova-2` model
- Enable `diarize: true` for speaker identification
- Enable `punctuate: true` for better sentence detection
- Handle streaming chunks and finalize segments

#### 1.3 Audio Capture from Playwright
**Modify:** `google-meet-meeting-bot/src/playwright/runBot.ts`
- Capture audio stream from Google Meet tab
- Use Playwright's CDP (Chrome DevTools Protocol) to capture audio
- Stream audio to Deepgram in real-time
- Handle audio stream errors gracefully

**Implementation Options:**
1. **CDP Audio Capture** - Use `Page.cdpSession()` to capture audio
2. **Tab Audio Capture** - Use browser's `getDisplayMedia` API
3. **WebRTC Interception** - Intercept WebRTC audio streams

#### 1.4 Sentence Grouping Logic
**New File:** `google-meet-meeting-bot/src/sentence-grouper.ts`
- Receive word-level transcription from Deepgram
- Group words into sentences based on:
  - Speaker changes
  - Punctuation marks (periods, question marks, exclamation)
  - Natural pauses (configurable silence threshold)
- Create `Segment` objects with complete sentences

**Algorithm:**
```
For each word from Deepgram:
  - If speaker changes → Finalize current sentence, start new segment
  - If punctuation detected → Finalize current sentence, continue same speaker
  - If silence > threshold → Finalize current sentence, continue same speaker
  - Otherwise → Append word to current sentence
```

#### 1.5 Database Schema Updates
**Modify:** `google-meet-meeting-bot/src/backend/schema.prisma`

**Add new model:**
```prisma
model SpeakerMapping {
  id          String   @id @default(uuid())
  meetingId   String
  speakerId   String   // Deepgram speaker ID (e.g., "0", "1")
  speakerName String   // User-friendly name (e.g., "Speaker 0", "Sarah")
  color       String?  // Hex color code (e.g., "#3B82F6" for blue)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([meetingId, speakerId])
  @@index([meetingId])
}
```

**Update Segment model:**
```prisma
model Segment {
  // ... existing fields ...
  speakerId   String?  // Deepgram speaker ID (for mapping)
  confidence  Float?   // Transcription confidence score
  words       Json?     // Word-level data (optional, for debugging)
}
```

#### 1.6 Update Storage Functions
**Modify:** `google-meet-meeting-bot/src/storage.ts`

**New Functions:**
- `saveSpeakerMapping(meetingId, speakerId, speakerName, color)`
- `getSpeakerMappings(meetingId)`
- `updateSpeakerMapping(meetingId, speakerId, newName)`
- `updateAllSegmentsSpeakerName(meetingId, oldSpeakerId, newName)`

**Modify Existing:**
- `saveTranscriptBatch()` - Include `speakerId` and `confidence` in segments

---

### Phase 2: Bot Integration

#### 2.1 Modify Bot Flow
**Modify:** `google-meet-meeting-bot/src/playwright/runBot.ts`

**Changes:**
1. Add audio capture initialization
2. Start Deepgram streaming alongside caption scraping
3. Process both streams (prioritize Deepgram, use captions as fallback)
4. Merge/validate results from both sources

**New Function:**
```typescript
async function startDeepgramTranscription(
  page: Page,
  meetingId: string,
  userId?: string,
  meetingTitle?: string
): Promise<void>
```

#### 2.2 Dual Transcription Mode
**Strategy:**
- **Primary:** Deepgram streaming transcription
- **Fallback:** Caption scraping (if Deepgram fails or unavailable)
- **Validation:** Compare both sources for accuracy
- **Merge:** Combine best results from both sources

---

### Phase 3: Backend API Updates

#### 3.1 Speaker Management Endpoints
**New File:** `google-meet-meeting-bot/src/backend/server.ts`

**New Endpoints:**
- `GET /meeting/:meetingId/speakers` - Get all speaker mappings
- `PUT /meeting/:meetingId/speakers/:speakerId` - Rename speaker
- `GET /meeting/:meetingId/segments` - Get segments with speaker names

#### 3.2 Frontend API Routes
**New File:** `frontend/dashboard/app/api/meetings/speakers/route.ts`
- `GET` - Fetch speaker mappings for a meeting
- `PUT` - Update speaker name (updates all segments)

**New File:** `frontend/dashboard/app/api/meetings/update-speaker/route.ts`
- Handle speaker renaming
- Update all segments with new name
- Return updated segments

---

### Phase 4: Frontend - Enhanced Display

#### 4.1 Update Transcript Display Component
**Modify:** `frontend/dashboard/app/transcripts/page.tsx`

**New Features:**
1. **Speaker Name Display**
   - Show speaker name above each segment
   - Color-code based on speaker mapping
   - Clickable speaker names for renaming

2. **Color Coding**
   - Default colors: Blue (#3B82F6), Orange (#F97316), Green (#10B981), etc.
   - Store colors in database per speaker
   - Apply colors to speaker name badges

3. **Rename Functionality**
   - Click speaker name → Input field appears
   - Save → Updates all instances of that speaker
   - Optimistic UI updates
   - API call to update database

4. **Sentence Grouping Display**
   - Group segments by speaker
   - Show continuous speech as single block
   - Visual separator when speaker changes

#### 4.2 Create Speaker Component
**New File:** `frontend/dashboard/components/speaker-badge.tsx`

**Features:**
- Color-coded speaker name
- Click to edit functionality
- Inline editing with save/cancel
- Visual feedback during rename

#### 4.3 Update Data Fetching
**Modify:** `frontend/dashboard/hooks/use-bot-meetings.ts`

**Changes:**
- Fetch speaker mappings along with meetings
- Include speaker names in segment data
- Handle speaker renaming updates

---

### Phase 5: Data Migration & Compatibility

#### 5.1 Handle Existing Data
- Existing segments may not have `speakerId`
- Create default speaker mappings for old data
- Migrate `speaker` field to `speakerId` + `SpeakerMapping`

#### 5.2 Backward Compatibility
- Support both old format (speaker name string) and new format (speakerId + mapping)
- Graceful fallback if Deepgram unavailable
- Continue using caption scraping as primary if Deepgram fails

---

## 🔧 Technical Implementation Details

### Deepgram Configuration

```typescript
const deepgramConfig = {
  model: 'nova-2',
  language: 'en-US',
  punctuate: true,
  diarize: true,
  smart_format: true,
  interim_results: true,
  utterance_end_ms: 1000, // Group words into utterances
  vad_events: true, // Voice activity detection
};
```

### Sentence Grouping Algorithm

```typescript
interface Word {
  word: string;
  speaker: number;
  start: number;
  end: number;
  confidence: number;
}

interface Sentence {
  speaker: number;
  text: string;
  start: number;
  end: number;
  words: Word[];
}

function groupWordsIntoSentences(words: Word[]): Sentence[] {
  const sentences: Sentence[] = [];
  let currentSentence: Sentence | null = null;
  
  for (const word of words) {
    // Speaker change → new sentence
    if (currentSentence && currentSentence.speaker !== word.speaker) {
      sentences.push(currentSentence);
      currentSentence = null;
    }
    
    // Start new sentence
    if (!currentSentence) {
      currentSentence = {
        speaker: word.speaker,
        text: word.word,
        start: word.start,
        end: word.end,
        words: [word],
      };
    } else {
      // Append to current sentence
      currentSentence.text += ' ' + word.word;
      currentSentence.end = word.end;
      currentSentence.words.push(word);
      
      // Check for sentence-ending punctuation
      if (/[.!?]$/.test(word.word)) {
        sentences.push(currentSentence);
        currentSentence = null;
      }
    }
  }
  
  // Add final sentence
  if (currentSentence) {
    sentences.push(currentSentence);
  }
  
  return sentences;
}
```

### Audio Capture Strategy

**Option 1: CDP Audio Capture (Recommended)**
```typescript
const session = await page.target().createCDPSession();
await session.send('Runtime.enable');
await session.send('Page.enable');

// Capture audio via CDP
const audioStream = await captureAudioStream(session);
```

**Option 2: Tab Audio via getDisplayMedia**
```typescript
// Use browser's screen capture API
const stream = await navigator.mediaDevices.getDisplayMedia({
  audio: true,
  video: false,
});
```

---

## 📊 Database Schema Changes

### New Tables

```sql
CREATE TABLE "SpeakerMapping" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "meetingId" TEXT NOT NULL,
  "speakerId" TEXT NOT NULL,
  "speakerName" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE("meetingId", "speakerId")
);

CREATE INDEX "SpeakerMapping_meetingId_idx" ON "SpeakerMapping"("meetingId");
```

### Updated Segment Table

```sql
ALTER TABLE "Segment" 
ADD COLUMN "speakerId" TEXT,
ADD COLUMN "confidence" REAL,
ADD COLUMN "words" JSONB;
```

---

## 🎨 UI/UX Design

### Transcript Display Layout

```
┌─────────────────────────────────────────┐
│  📝 Meeting Transcript                  │
├─────────────────────────────────────────┤
│                                         │
│  ┌─ Sarah ─────────────────────────┐  │
│  │ [Blue Badge]                     │  │
│  │ Hello everyone, welcome to the   │  │
│  │ meeting. Let's start with the    │  │
│  │ agenda.                           │  │
│  └─────────────────────────────────┘  │
│                                         │
│  ┌─ John ──────────────────────────┐  │
│  │ [Orange Badge]                    │  │
│  │ Thanks Sarah. I have a few       │  │
│  │ updates to share.                │  │
│  └─────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### Speaker Rename Flow

1. User clicks on "Speaker 0" badge
2. Badge transforms into input field
3. User types new name (e.g., "Sarah")
4. User clicks "Save" or presses Enter
5. API call updates all segments
6. UI updates optimistically
7. Success feedback shown

---

## 🔄 Migration Strategy

### Step 1: Add Deepgram (Non-Breaking)
- Install Deepgram SDK
- Add audio capture (optional, can be disabled)
- Keep caption scraping as primary

### Step 2: Enable Deepgram (Feature Flag)
- Add `ENABLE_DEEPGRAM` environment variable
- Test Deepgram alongside captions
- Compare accuracy

### Step 3: Database Migration
- Run Prisma migration for new tables
- Migrate existing data
- Update storage functions

### Step 4: Frontend Updates
- Add speaker display components
- Implement renaming
- Add color coding

### Step 5: Switch Primary Source
- Make Deepgram primary
- Keep captions as fallback
- Monitor and adjust

---

## 🧪 Testing Plan

### Unit Tests
- Sentence grouping algorithm
- Speaker mapping functions
- Database operations

### Integration Tests
- Deepgram streaming connection
- Audio capture from Playwright
- End-to-end transcription flow

### E2E Tests
- Bot joins meeting → Transcription works
- Speaker renaming updates all instances
- Color coding displays correctly
- Fallback to captions if Deepgram fails

---

## 📦 Dependencies to Add

```json
{
  "dependencies": {
    "@deepgram/sdk": "^3.0.0",
    "puppeteer-stream": "^2.0.0",
    "fluent-ffmpeg": "^2.1.2"
  }
}
```

---

## 🔐 Environment Variables

```bash
# Deepgram Configuration
DEEPGRAM_API_KEY=your_deepgram_api_key
ENABLE_DEEPGRAM=true
DEEPGRAM_MODEL=nova-2

# Feature Flags
USE_DEEPGRAM_AS_PRIMARY=true
ENABLE_CAPTION_FALLBACK=true
```

---

## 📈 Performance Considerations

1. **Streaming Efficiency**
   - Buffer audio chunks appropriately
   - Don't send too small chunks (latency)
   - Don't send too large chunks (memory)

2. **Database Updates**
   - Batch speaker name updates
   - Use transactions for consistency
   - Index speakerId for fast lookups

3. **Frontend Rendering**
   - Virtualize long transcript lists
   - Debounce rename operations
   - Optimistic UI updates

---

## 🐛 Error Handling

1. **Deepgram Connection Failures**
   - Fallback to caption scraping
   - Log error for debugging
   - Notify user if both fail

2. **Audio Capture Issues**
   - Detect if audio capture fails
   - Automatically switch to captions
   - Show warning to user

3. **Speaker Mapping Errors**
   - Default to "Speaker 0", "Speaker 1" if mapping fails
   - Allow manual correction
   - Log errors for debugging

---

## 📚 Files to Create/Modify

### New Files:
1. `google-meet-meeting-bot/src/deepgram-service.ts`
2. `google-meet-meeting-bot/src/sentence-grouper.ts`
3. `google-meet-meeting-bot/src/audio-capture.ts`
4. `frontend/dashboard/components/speaker-badge.tsx`
5. `frontend/dashboard/app/api/meetings/speakers/route.ts`
6. `frontend/dashboard/app/api/meetings/update-speaker/route.ts`

### Modified Files:
1. `google-meet-meeting-bot/src/playwright/runBot.ts`
2. `google-meet-meeting-bot/src/storage.ts`
3. `google-meet-meeting-bot/src/backend/schema.prisma`
4. `google-meet-meeting-bot/src/models.ts`
5. `google-meet-meeting-bot/src/backend/server.ts`
6. `frontend/dashboard/app/transcripts/page.tsx`
7. `frontend/dashboard/hooks/use-bot-meetings.ts`

---

## ✅ Success Criteria

1. ✅ Deepgram transcription works with speaker diarization
2. ✅ Words are grouped into sentences by speaker
3. ✅ Speaker names display above transcript text
4. ✅ Speakers are color-coded (different colors per speaker)
5. ✅ Clicking speaker name allows renaming
6. ✅ Renaming updates ALL instances of that speaker
7. ✅ Caption scraping still works as fallback
8. ✅ Existing transcripts continue to work
9. ✅ Performance is acceptable (low latency)
10. ✅ Error handling is robust

---

## 🚀 Implementation Order

1. **Week 1: Backend Foundation**
   - Install Deepgram SDK
   - Create Deepgram service
   - Database schema updates
   - Storage functions

2. **Week 2: Audio & Transcription**
   - Audio capture implementation
   - Streaming transcription
   - Sentence grouping
   - Integration with bot

3. **Week 3: Frontend**
   - Speaker display components
   - Color coding
   - Rename functionality
   - API integration

4. **Week 4: Testing & Polish**
   - Testing
   - Bug fixes
   - Performance optimization
   - Documentation

---

## 📝 Notes

- **Caption Scraping:** Keep as fallback - it's reliable and doesn't require API keys
- **Speaker IDs:** Use Deepgram's speaker IDs (0, 1, 2...) and map to friendly names
- **Color Assignment:** Auto-assign colors, allow customization later
- **Performance:** Deepgram streaming is fast, but add buffering for sentence grouping
- **Cost:** Monitor Deepgram API usage - it's pay-per-minute

---

*This plan provides a comprehensive roadmap for implementing Deepgram speaker diarization while maintaining backward compatibility and reliability.*

