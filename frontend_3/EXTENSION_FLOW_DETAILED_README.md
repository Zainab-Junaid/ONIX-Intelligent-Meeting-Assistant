# Onix Meeting Assistant - Complete Extension Flow Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technologies Used](#technologies-used)
4. [Complete Flow Diagram](#complete-flow-diagram)
5. [Extension Components](#extension-components)
6. [Backend Server Flow](#backend-server-flow)
7. [API Routes](#api-routes)
8. [Frontend Dashboard](#frontend-dashboard)
9. [Function Call Flow](#function-call-flow)
10. [Data Flow](#data-flow)

---

## Overview

Onix Meeting Assistant is a Chrome extension that captures, transcribes, and summarizes meetings from Google Meet and Zoom. It uses real-time audio capture, AssemblyAI for transcription, and Firebase for data storage.

---

## Architecture

### Three-Tier Architecture:

1. **Extension Layer** (Chrome Extension)
   - Content Script (`content.js`) - Captures captions from meeting pages
   - Background Service Worker (`background.js`) - Handles tab audio capture
   - Side Panel (`sidepanel.js`) - User interface and main logic

2. **Backend Layer** (Node.js Server)
   - Express.js server (`server.js`) - WebSocket server for real-time audio streaming
   - AssemblyAI integration - Real-time transcription API

3. **Frontend Layer** (Next.js Dashboard)
   - API Routes - REST endpoints for data management
   - React Components - UI for viewing transcripts, summaries, and notes
   - Firebase Admin - Server-side Firebase operations

---

## Technologies Used

### Extension:
- **Chrome Extension Manifest V3** - Extension framework
- **JavaScript (ES6+)** - Extension logic
- **Chrome APIs**: 
  - `chrome.tabCapture` - Audio capture from tabs
  - `chrome.sidePanel` - Side panel UI
  - `chrome.storage` - Local data storage
  - `chrome.runtime` - Message passing
  - `chrome.tabs` - Tab management
  - `chrome.scripting` - Script injection

### Backend Server:
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **WebSocket (ws)** - Real-time bidirectional communication
- **AssemblyAI SDK** - Speech-to-text API
- **Multer** - File upload handling
- **Axios** - HTTP client

### Frontend Dashboard:
- **Next.js 14** - React framework with SSR
- **TypeScript** - Type-safe JavaScript
- **React 18** - UI library
- **Firebase Admin SDK** - Server-side Firebase operations
- **Tailwind CSS** - Styling
- **Radix UI** - Component library

### Database & Storage:
- **Firebase Firestore** - NoSQL database
- **Firebase Authentication** - User authentication
- **Firebase Storage** - File storage (for screenshots)

### AI/ML Services:
- **AssemblyAI** - Real-time transcription and summarization
- **Claude Sonnet 4** (via AssemblyAI LeMUR) - Summary generation

---

## Complete Flow Diagram

```
User Opens Meeting (Google Meet/Zoom)
    ↓
Content Script Injected (content.js)
    ↓
Detects Meeting Page → Shows "Open Onix" Button
    ↓
User Clicks Button → Opens Side Panel
    ↓
Side Panel Loads (sidepanel.js)
    ↓
User Signs In (Firebase Auth)
    ↓
User Enters Meeting Title
    ↓
User Clicks "Start Capture"
    ↓
┌─────────────────────────────────────┐
│  TWO CAPTURE METHODS:               │
│                                     │
│  1. Caption Scraping (content.js)  │
│     - Scrapes on-page captions      │
│     - Sends chunks to sidepanel     │
│                                     │
│  2. Audio Capture (background.js)   │
│     - Captures tab audio stream     │
│     - Sends to backend server       │
│     - Backend forwards to AssemblyAI │
└─────────────────────────────────────┘
    ↓
Transcript Chunks Received
    ↓
Displayed in Side Panel (Real-time)
    ↓
Auto-saved to Firestore (Every 30 seconds)
    ↓
User Clicks "Stop Capture"
    ↓
Final Transcript Saved
    ↓
Generate Summary (API Call)
    ↓
Summary & Action Items Saved to Firestore
    ↓
View in Dashboard (Next.js Frontend)
```

---

## Extension Components

### 1. manifest.json
**Location**: `chrome-extension/onix_extension_v2/manifest.json`

**Purpose**: Defines extension configuration and permissions

**Key Permissions**:
- `tabCapture` - Capture audio from tabs
- `sidePanel` - Open side panel UI
- `storage` - Store local data
- `activeTab` - Access active tab
- `tabs` - Manage tabs
- `scripting` - Inject scripts

**Key Components**:
- `background.js` - Service worker
- `content.js` - Content script (injected into meeting pages)
- `sidepanel.html/js` - Side panel UI

**Function**: Entry point for Chrome extension configuration

---

### 2. content.js
**Location**: `chrome-extension/onix_extension_v2/content.js`

**Purpose**: Captures captions from Google Meet/Zoom pages

**Key Functions**:

#### `detectMeeting()`
- **Called**: On page load
- **Purpose**: Detects if current page is a meeting (Google Meet or Zoom)
- **Returns**: Boolean

#### `addFloatingButton()`
- **Called**: When meeting is detected
- **Purpose**: Adds "Open Onix" button to page
- **Function**: Creates floating button that opens side panel

#### `launchAttachObserver(region)`
- **Called**: When captions region is found
- **Purpose**: Attaches MutationObserver to captions container
- **Function**: Watches for new caption elements

#### `scanClasses(cl)`
- **Called**: By MutationObserver when new caption elements appear
- **Purpose**: Scans caption elements for text and speaker
- **Function**: Extracts text and speaker name from DOM

#### `handleCaption(speakerKey, speakerName, rawText)`
- **Called**: When caption text is detected
- **Purpose**: Processes caption text and deduplicates
- **Function**: 
  - Normalizes text
  - Checks for duplicates
  - Creates caption entry with timestamp
  - Sets timer for commit

#### `commit(key)`
- **Called**: After grace period (2 seconds) or when caption changes
- **Purpose**: Finalizes caption entry and sends to sidepanel
- **Function**:
  - Formats transcript entry
  - Sends message to sidepanel via `chrome.runtime.sendMessage`
  - Message type: `ONIX_TRANSCRIPT_CHUNK`

#### `emitChunk(entry)`
- **Called**: By `commit()` function
- **Purpose**: Sends transcript chunk to sidepanel
- **Function**: 
  - Adds speaker to speakers set
  - Emits status started message
  - Sends chunk with text, speaker, timestamp

#### `getTranscriptText()`
- **Called**: When sidepanel requests full transcript
- **Purpose**: Returns complete transcript text
- **Returns**: String with all transcript entries

#### `resetTranscript()`
- **Called**: When user starts new capture
- **Purpose**: Clears all transcript data
- **Function**: Resets all maps and arrays

#### `handleScreenshot(sendResponse)`
- **Called**: When user requests screenshot
- **Purpose**: Captures screenshot using html2canvas
- **Function**:
  - Loads html2canvas library if needed
  - Captures page as image
  - Sends data URL to sidepanel

**Message Listeners**:
- `GET_TRANSCRIPT` - Returns full transcript
- `RESET_TRANSCRIPT` - Resets transcript data
- `ONIX_START_CAPTURE` - Starts caption capture
- `ONIX_STOP_CAPTURE` - Stops capture and commits remaining
- `ONIX_CAPTURE_SCREENSHOT` - Captures screenshot

---

### 3. background.js
**Location**: `chrome-extension/onix_extension_v2/background.js`

**Purpose**: Service worker that handles tab audio capture and message routing

**Key Functions**:

#### `captureTabAudio(tabId, sendResponse)`
- **Called**: When sidepanel requests tab audio capture
- **Purpose**: Captures audio stream from meeting tab
- **Function Flow**:
  1. Verifies tab exists (`chrome.tabs.get`)
  2. Checks if URL is meeting page (Google Meet/Zoom)
  3. Activates tab (`chrome.tabs.update`)
  4. Calls `chrome.tabCapture.getMediaStreamId()` (Manifest V3)
  5. Falls back to `chrome.tabCapture.capture()` if needed
  6. Returns streamId to sidepanel
- **Returns**: `{ streamId, success: true }` or error

#### `chrome.runtime.onMessage.addListener()`
- **Purpose**: Handles messages from content script and sidepanel
- **Message Types Handled**:

  **`ONIX_OPEN_SIDE_PANEL`**
  - Called: From content script button click
  - Function: Opens side panel for current tab
  - Uses: `chrome.sidePanel.open()`

  **`ONIX_GET_CURRENT_TAB_ID`**
  - Called: From sidepanel
  - Function: Returns active tab ID
  - Uses: `chrome.tabs.query()`

  **`ONIX_CAPTURE_TAB_AUDIO`**
  - Called: From sidepanel when user starts audio capture
  - Function: Calls `captureTabAudio()`
  - Returns: Stream ID for audio capture

  **`ONIX_GET_AUTH_TOKEN`**
  - Called: From content script (for AssemblyAI)
  - Function: Forwards to sidepanel to get Firebase token

  **`ONIX_CAPTURE_SCREENSHOT`**
  - Called: From sidepanel when html2canvas fails
  - Function: Uses `chrome.tabs.captureVisibleTab()`
  - Returns: Screenshot data URL

  **`ONIX_INJECT_SCREENSHOT_SCRIPT`**
  - Called: From sidepanel
  - Function: Injects html2canvas library into page
  - Uses: `chrome.scripting.executeScript()`

#### `chrome.tabs.onUpdated.addListener()`
- **Purpose**: Auto-opens side panel when user navigates to meeting page
- **Function**: 
  - Detects Google Meet or Zoom URLs
  - Enables side panel for tab
  - Auto-opens side panel

#### `chrome.tabs.onActivated.addListener()`
- **Purpose**: Opens side panel when user switches to meeting tab
- **Function**: Same as `onUpdated` but for tab switching

---

### 4. sidepanel.js
**Location**: `chrome-extension/onix_extension_v2/sidepanel.js`

**Purpose**: Main UI and logic for extension

**Key Variables**:
- `isCapturing` - Boolean flag for capture state
- `currentMeetingDocId` - Firestore document ID for current meeting
- `transcriptBuffer` - In-memory transcript storage
- `seenSentences` - Set for deduplication
- `currentUser` - Firebase auth user

**Key Functions**:

#### `ensureFirebase()`
- **Called**: On sidepanel load
- **Purpose**: Initializes Firebase SDK
- **Function**: 
  - Checks if Firebase already initialized
  - Initializes Firebase app, auth, and Firestore
  - Returns boolean success status

#### `loadCurrentMeetingDocId()`
- **Called**: On DOMContentLoaded
- **Purpose**: Loads persisted meeting document ID from chrome.storage
- **Function**: 
  - Reads from `chrome.storage.local`
  - Restores `currentMeetingDocId` and `isCapturing` state
  - Allows extension to resume after reload

#### `saveCurrentMeetingDocId(docId, meetingURL)`
- **Called**: After creating/updating meeting document
- **Purpose**: Saves meeting document ID to chrome.storage
- **Function**: 
  - Stores document ID and meeting URL
  - Persists across sidepanel reloads

#### `initUI()`
- **Called**: On DOMContentLoaded
- **Purpose**: Initializes all UI elements and event listeners
- **Function**: 
  - Gets references to all DOM elements
  - Sets up button click handlers
  - Initializes Firebase auth state listener

#### `updateAuthUI()`
- **Called**: When auth state changes
- **Purpose**: Updates UI based on authentication status
- **Function**: 
  - Shows/hides sign in/out buttons
  - Updates auth status text
  - Enables/disables features based on auth

#### `startCapture()`
- **Called**: When user clicks "Start Capture" button
- **Purpose**: Starts transcript capture
- **Function Flow**:
  1. Validates meeting title
  2. Creates or gets meeting document in Firestore
  3. Saves meeting document ID
  4. Resets transcript buffer
  5. Sends `ONIX_START_CAPTURE` to content script
  6. Attempts tab audio capture (calls background.js)
  7. If audio capture succeeds:
     - Gets streamId
     - Creates MediaRecorder
     - Connects to backend WebSocket
     - Starts recording and streaming
  8. Sets `isCapturing = true`
  9. Starts auto-save timer (every 30 seconds)
  10. Starts auto-notes generation timer (every 2 minutes)

#### `stopCapture()`
- **Called**: When user clicks "Stop Capture" button
- **Purpose**: Stops transcript capture
- **Function Flow**:
  1. Sets `isCapturing = false`
  2. Stops MediaRecorder
  3. Closes WebSocket connection
  4. Sends `ONIX_STOP_CAPTURE` to content script
  5. Commits final transcript
  6. Saves final transcript to Firestore
  7. Clears timers
  8. Generates summary (calls API)

#### `handleTranscriptChunk(chunk)`
- **Called**: When transcript chunk received from content script or WebSocket
- **Purpose**: Processes and displays transcript chunks
- **Function Flow**:
  1. Normalizes text for deduplication
  2. Checks if already seen (prevents duplicates)
  3. Adds to transcript buffer
  4. Updates UI with new chunk
  5. Scrolls transcript view to bottom

#### `autoSaveTranscript()`
- **Called**: Every 30 seconds while capturing
- **Purpose**: Auto-saves transcript to Firestore
- **Function Flow**:
  1. Gets current transcript text
  2. Compares with last saved version
  3. If changed, updates Firestore document
  4. Updates `lastSavedTranscript` and `lastSaveTime`

#### `generateSummary()`
- **Called**: After stopping capture or manually
- **Purpose**: Generates meeting summary using AssemblyAI LeMUR
- **Function Flow**:
  1. Gets full transcript
  2. Calls API: `POST /api/extension-meetings/generate-summary`
  3. Sends meetingId and transcript
  4. API uses AssemblyAI LeMUR to generate summary
  5. Updates Firestore with summary and action items
  6. Displays summary in UI

#### `saveNote(text, screenshotDataUrl)`
- **Called**: When user saves a note
- **Purpose**: Saves note with optional screenshot to Firestore
- **Function Flow**:
  1. Creates note object with text, timestamp, type
  2. If screenshot, converts to base64
  3. Updates Firestore meeting document
  4. Adds note to notes array
  5. Refreshes notes display

#### `captureScreenshot()`
- **Called**: When user clicks screenshot button
- **Purpose**: Captures screenshot of meeting page
- **Function Flow**:
  1. Tries to use html2canvas (injected into page)
  2. If fails, requests background.js to capture
  3. Gets data URL
  4. Shows preview in note input
  5. User can add text and save as note

#### `handleWebSocketMessage(message)`
- **Called**: When message received from backend WebSocket
- **Purpose**: Processes real-time transcription results
- **Function Flow**:
  1. Parses JSON message
  2. If `transcription_result`:
     - Extracts text and speaker
     - Calls `handleTranscriptChunk()`
  3. If `error`:
     - Displays error in UI
  4. If `connection_status`:
     - Updates connection status indicator

**Message Listeners**:
- `ONIX_TRANSCRIPT_CHUNK` - From content script (caption chunks)
- `ONIX_TRANSCRIPT_STATUS` - Status updates from content script
- `ONIX_PARTICIPANTS_FOUND` - Speaker list from content script
- `ONIX_SCREENSHOT_RESPONSE` - Screenshot capture result

---

## Backend Server Flow

### server.js
**Location**: `chrome-extension/onix_extension_v2/server.js`

**Purpose**: WebSocket server for real-time audio streaming to AssemblyAI

**Key Variables**:
- `activeConnections` - Map of connectionId -> WebSocket (extension to server)
- `assemblyAIConnections` - Map of connectionId -> WebSocket (server to AssemblyAI)
- `speakerProfiles` - Map for speaker identification

**Key Functions**:

#### `wss.on('connection', (ws, req) => {})`
- **Called**: When extension connects via WebSocket
- **Purpose**: Handles new WebSocket connection
- **Function Flow**:
  1. Creates unique connectionId
  2. Stores connection in `activeConnections`
  3. Sets up message handler
  4. Sets up close handler

#### `ws.on('message', async (data) => {})`
- **Called**: When message received from extension
- **Purpose**: Routes messages based on type
- **Message Types**:
  - `audio_chunk` - Binary audio data
  - `start_transcription` - Start AssemblyAI streaming
  - `stop_transcription` - Stop AssemblyAI streaming
  - `register_speaker` - Register speaker profile

#### `handleAudioChunkForAssemblyAI(connectionId, audioData, timestamp)`
- **Called**: When audio chunk received
- **Purpose**: Forwards audio to AssemblyAI
- **Function Flow**:
  1. Gets AssemblyAI WebSocket for connection
  2. If not connected, calls `startAssemblyAIStreaming()`
  3. Converts audio data to Buffer (handles base64 or binary)
  4. Sends raw PCM audio bytes to AssemblyAI
  5. AssemblyAI expects: 16-bit PCM, 16kHz, mono

#### `startAssemblyAIStreaming(connectionId)`
- **Called**: When `start_transcription` message received
- **Purpose**: Establishes WebSocket connection to AssemblyAI
- **Function Flow**:
  1. Creates WebSocket to AssemblyAI v3 API
  2. URL: `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true`
  3. Sets Authorization header with API key
  4. Sets up message handler for transcription results
  5. When result received:
     - Parses JSON response
     - Extracts text and speaker labels
     - Forwards to extension via WebSocket
  6. Stores connection in `assemblyAIConnections`

#### `stopAssemblyAIStreaming(connectionId)`
- **Called**: When `stop_transcription` message received
- **Purpose**: Closes AssemblyAI connection
- **Function**: 
  - Closes WebSocket
  - Removes from `assemblyAIConnections`

#### `transcribeWithAssemblyAI(audioFilePath)`
- **Called**: For file-based transcription (not used in real-time flow)
- **Purpose**: Transcribes audio file using AssemblyAI API
- **Function Flow**:
  1. Uploads audio file to AssemblyAI
  2. Creates transcription request
  3. Polls for completion
  4. Returns transcript and summary

---

## API Routes

### 1. GET /api/extension-meetings
**Location**: `onix_dashboard/app/api/extension-meetings/route.ts`

**Purpose**: Fetches all extension meetings for authenticated user

**Function Flow**:
1. Verifies Firebase auth token from Authorization header
2. Gets userId from decoded token
3. Queries Firestore: `users/{userId}/meetings`
4. Orders by `createdAt` descending
5. Maps documents to meeting objects
6. Deduplicates by meetingURL (keeps most recent)
7. Returns JSON array of meetings

**Called From**: 
- Frontend hook: `useExtensionMeetings()`
- Dashboard page: `/transcripts`

**Returns**: Array of meeting objects with:
- `id`, `title`, `transcript`, `createdAt`, `summary`, `actionItems`, `notes`

---

### 2. POST /api/extension-meetings/generate-summary
**Location**: `onix_dashboard/app/api/extension-meetings/generate-summary/route.ts`

**Purpose**: Generates meeting summary using AssemblyAI LeMUR

**Function Flow**:
1. Verifies Firebase auth token
2. Gets `meetingId` and `transcript` from request body
3. Checks for `ASSEMBLYAI_API_KEY` environment variable
4. Initializes AssemblyAI client
5. Calls `client.lemur.summary()`:
   - Input: transcript text
   - Model: `anthropic/claude-sonnet-4-20250514`
   - Format: bulleted list
   - Context: Detailed prompt for structured summary
6. Calls `client.lemur.task()` for action items:
   - Extracts action items with assignments and due dates
7. Parses action items from JSON response
8. Updates Firestore document with:
   - `summary` object (text, generatedAt, model)
   - `actionItems` array
9. Returns summary and action items

**Called From**: 
- Extension sidepanel: `generateSummary()`
- After stopping capture

**Returns**: 
```json
{
  "success": true,
  "summary": { "text": "...", "generatedAt": "...", "model": "..." },
  "actionItems": [...]
}
```

**Technologies**:
- AssemblyAI SDK
- Claude Sonnet 4 (via LeMUR API)
- Firebase Admin SDK

---

### 3. POST /api/extension-meetings/generate-notes
**Location**: `onix_dashboard/app/api/extension-meetings/generate-notes/route.ts`

**Purpose**: Generates structured notes from transcript

**Function Flow**:
1. Verifies Firebase auth token
2. Gets `meetingId`, `transcript`, `timestamp`, `previousNotes`
3. Initializes AssemblyAI client
4. Calls `client.lemur.task()`:
   - Prompt: Detailed prompt for student-style notes
   - Categories: Concepts, Definitions, Points, Examples, Questions
   - Format: Markdown with sections
5. Parses notes from AI response using `parseNotesFromText()`
6. Updates Firestore meeting document
7. Appends notes to existing notes array
8. Returns generated notes

**Called From**: 
- Extension sidepanel: Auto-notes generation (every 2 minutes)
- Manual notes generation

**Returns**: Array of note objects with:
- `id`, `timestamp`, `text`, `type`, `createdAt`

---

### 4. PUT /api/extension-meetings/notes
**Location**: `onix_dashboard/app/api/extension-meetings/notes/route.ts`

**Purpose**: Updates or deletes a note

**Function Flow**:
1. Verifies Firebase auth token
2. Gets `meetingId`, `noteId`, `text` (optional), `deleteScreenshot` (optional)
3. Gets meeting document from Firestore
4. Finds note in notes array
5. If `text` provided: Updates note text
6. If `deleteScreenshot` true: Removes screenshot from note
7. Updates Firestore document
8. Returns success

**Called From**: 
- Frontend: Edit note functionality
- Frontend: Delete screenshot functionality

---

### 5. DELETE /api/extension-meetings/notes
**Location**: `onix_dashboard/app/api/extension-meetings/notes/route.ts`

**Purpose**: Deletes a note

**Function Flow**:
1. Verifies Firebase auth token
2. Gets `meetingId` and `noteId` from query params
3. Gets meeting document
4. Filters out note from notes array
5. Updates Firestore document
6. Returns success

**Called From**: 
- Frontend: Delete note button

---

## Frontend Dashboard

### 1. Transcripts Page
**Location**: `onix_dashboard/app/transcripts/page.tsx`

**Purpose**: Displays all meetings with transcripts, summaries, and notes

**Key Functions**:

#### `useExtensionMeetings()`
- **Hook Location**: `onix_dashboard/hooks/use-extension-meetings.ts`
- **Purpose**: Fetches extension meetings from API
- **Function Flow**:
  1. Gets Firebase auth token
  2. Calls `GET /api/extension-meetings`
  3. Maps response to meeting objects
  4. Returns meetings array, loading state, error

#### `parseSummarySections(summaryText)`
- **Purpose**: Parses markdown summary and applies colors
- **Function Flow**:
  1. Splits text by markdown headers (##)
  2. Maps sections to colors:
     - Executive Summary → Blue
     - Key Discussion Points → Purple
     - Decisions Made → Green
     - Action Items → Orange
     - Next Steps → Indigo
     - Important Information → Yellow
  3. Returns React components with colored sections

#### `organizeNotesByType(notes)`
- **Purpose**: Groups notes by type into sections
- **Function Flow**:
  1. Creates sections array with types:
     - concept, definition, point, example, question, screenshot, general
  2. Groups notes by type
  3. Filters out empty sections
  4. Returns sections with labels and emojis

**UI Components**:
- Tabs: Transcript, Summary/Action Items, Notes
- Summary: Colorful sections with markdown parsing
- Notes: Organized by type with color coding
- Action Items: Numbered list with assignments

---

## Function Call Flow

### Starting Capture Flow:

```
User clicks "Start Capture" button
    ↓
sidepanel.js: startCapture()
    ↓
1. Validates title
2. Creates/gets Firestore document
3. saveCurrentMeetingDocId()
    ↓
Sends message to content.js: ONIX_START_CAPTURE
    ↓
content.js: resetTranscript()
    ↓
Sends message to background.js: ONIX_CAPTURE_TAB_AUDIO
    ↓
background.js: captureTabAudio()
    ↓
chrome.tabCapture.getMediaStreamId()
    ↓
Returns streamId to sidepanel
    ↓
sidepanel.js: Creates MediaRecorder
    ↓
Connects to backend WebSocket (ws://localhost:3001)
    ↓
server.js: wss.on('connection')
    ↓
Sends start_transcription message
    ↓
server.js: startAssemblyAIStreaming()
    ↓
Connects to AssemblyAI WebSocket
    ↓
MediaRecorder starts recording
    ↓
Audio chunks sent to backend via WebSocket
    ↓
server.js: handleAudioChunkForAssemblyAI()
    ↓
Forwards to AssemblyAI WebSocket
    ↓
AssemblyAI processes audio
    ↓
Returns transcription results
    ↓
server.js: Forwards to extension
    ↓
sidepanel.js: handleWebSocketMessage()
    ↓
handleTranscriptChunk()
    ↓
Updates UI with transcript
    ↓
Auto-saves to Firestore every 30 seconds
```

### Caption Scraping Flow (Alternative):

```
Content script injected on page load
    ↓
content.js: detectMeeting()
    ↓
addFloatingButton()
    ↓
MutationObserver watches for captions region
    ↓
content.js: launchAttachObserver()
    ↓
Scans for caption elements
    ↓
content.js: scanClasses()
    ↓
Extracts text and speaker
    ↓
content.js: handleCaption()
    ↓
Normalizes and deduplicates
    ↓
Sets timer for commit (2 seconds)
    ↓
content.js: commit()
    ↓
content.js: emitChunk()
    ↓
Sends message: ONIX_TRANSCRIPT_CHUNK
    ↓
sidepanel.js: Receives message
    ↓
handleTranscriptChunk()
    ↓
Updates UI
    ↓
Auto-saves to Firestore
```

### Generating Summary Flow:

```
User clicks "Stop Capture"
    ↓
sidepanel.js: stopCapture()
    ↓
Saves final transcript
    ↓
Calls generateSummary()
    ↓
Gets full transcript text
    ↓
POST /api/extension-meetings/generate-summary
    ↓
route.ts: POST handler
    ↓
Verifies Firebase token
    ↓
Initializes AssemblyAI client
    ↓
client.lemur.summary()
    ↓
AssemblyAI LeMUR API
    ↓
Claude Sonnet 4 processes transcript
    ↓
Returns structured summary
    ↓
client.lemur.task() for action items
    ↓
Returns action items JSON
    ↓
Parses and updates Firestore
    ↓
Returns to extension
    ↓
Displays summary in UI
```

---

## Data Flow

### Firestore Structure:

```
users/
  {userId}/
    meetings/
      {meetingId}/
        - title: string
        - transcript: string
        - createdAt: Timestamp
        - updatedAt: Timestamp
        - meetingURL: string
        - autosave: boolean
        - summary: {
            text: string
            generatedAt: Timestamp
            model: string
          }
        - actionItems: Array<{
            text: string
            assignedTo?: string
            dueDate?: Timestamp
          }>
        - notes: Array<{
            id: string
            timestamp: Timestamp
            text: string
            type: 'concept' | 'definition' | 'point' | 'example' | 'question' | 'general'
            screenshotUrl?: string
            createdAt: Timestamp
          }>
```

### Data Flow Diagram:

```
Extension (sidepanel.js)
    ↓ (WebSocket)
Backend Server (server.js)
    ↓ (WebSocket)
AssemblyAI API
    ↓ (JSON)
Transcription Results
    ↓ (WebSocket)
Backend Server
    ↓ (WebSocket)
Extension
    ↓ (Firebase SDK)
Firestore Database
    ↓ (REST API)
Next.js API Routes
    ↓ (React Hooks)
Frontend Dashboard
    ↓ (React Components)
User Interface
```

---

## Key Integration Points

### 1. Extension ↔ Backend Server
- **Protocol**: WebSocket (ws://localhost:3001)
- **Purpose**: Real-time audio streaming and transcription results
- **Messages**:
  - Extension → Server: Binary audio chunks, `start_transcription`, `stop_transcription`
  - Server → Extension: `transcription_result`, `error`, `connection_status`

### 2. Extension ↔ Content Script
- **Protocol**: Chrome Runtime Messages
- **Purpose**: Caption scraping and page interaction
- **Messages**:
  - Extension → Content: `ONIX_START_CAPTURE`, `ONIX_STOP_CAPTURE`, `GET_TRANSCRIPT`
  - Content → Extension: `ONIX_TRANSCRIPT_CHUNK`, `ONIX_TRANSCRIPT_STATUS`

### 3. Extension ↔ Background Script
- **Protocol**: Chrome Runtime Messages
- **Purpose**: Tab audio capture and screenshot
- **Messages**:
  - Extension → Background: `ONIX_CAPTURE_TAB_AUDIO`, `ONIX_CAPTURE_SCREENSHOT`
  - Background → Extension: `{ streamId, success }`, `{ dataUrl, success }`

### 4. Extension ↔ Firebase
- **Protocol**: Firebase SDK (Web)
- **Purpose**: Authentication and data storage
- **Operations**:
  - Auth: Sign in/out, get token
  - Firestore: Create/update/read meeting documents

### 5. Frontend ↔ Backend API
- **Protocol**: REST API (HTTP)
- **Purpose**: Data retrieval and processing
- **Endpoints**:
  - `GET /api/extension-meetings` - Fetch meetings
  - `POST /api/extension-meetings/generate-summary` - Generate summary
  - `POST /api/extension-meetings/generate-notes` - Generate notes
  - `PUT /api/extension-meetings/notes` - Update note
  - `DELETE /api/extension-meetings/notes` - Delete note

### 6. Backend API ↔ AssemblyAI
- **Protocol**: REST API and WebSocket
- **Purpose**: Transcription and summarization
- **Operations**:
  - WebSocket: Real-time streaming transcription
  - REST: LeMUR API for summary and notes generation

---

## Environment Variables

### Backend Server:
- `ASSEMBLYAI_API_KEY` - AssemblyAI API key for transcription
- `PORT` - Server port (default: 3001)

### Frontend Dashboard:
- `ASSEMBLYAI_API_KEY` - AssemblyAI API key for LeMUR API
- Firebase config in `firebase-service-account.json`

---

## Error Handling

### Extension:
- Tab capture failures → Falls back to caption scraping
- WebSocket connection failures → Shows error, allows retry
- Firebase errors → Shows error message, allows retry
- API errors → Shows error, uses fallback responses

### Backend:
- AssemblyAI connection failures → Logs error, closes connection
- WebSocket errors → Sends error message to extension
- File upload errors → Returns error response

### Frontend:
- API errors → Shows error message in UI
- Firestore errors → Logs error, shows fallback UI
- Network errors → Retries with exponential backoff

---

## Security Considerations

1. **Firebase Authentication**: All API routes verify Firebase tokens
2. **User Isolation**: Data is scoped to user ID in Firestore
3. **CORS**: Backend server has CORS enabled for localhost
4. **Content Security Policy**: Extension has CSP restrictions
5. **API Keys**: Stored in environment variables, not in code

---

## Performance Optimizations

1. **Deduplication**: Transcript chunks are deduplicated using normalized text
2. **Auto-save**: Only saves when transcript changes (compares with last saved)
3. **Batch Updates**: Notes are appended in batches
4. **Lazy Loading**: Frontend loads meetings on demand
5. **WebSocket**: Real-time updates without polling

---

## Testing Flow

1. **Load Extension**: Install in Chrome
2. **Start Backend**: Run `npm start` in extension directory
3. **Open Meeting**: Navigate to Google Meet or Zoom
4. **Open Side Panel**: Click "Open Onix" button
5. **Sign In**: Authenticate with Firebase
6. **Start Capture**: Enter title, click "Start Capture"
7. **Verify**: Check transcript appears in real-time
8. **Stop Capture**: Click "Stop Capture"
9. **Verify Summary**: Check summary is generated
10. **View Dashboard**: Open Next.js dashboard, view meeting

---

## Troubleshooting

### Common Issues:

1. **Tab capture fails**: Check permissions, ensure tab is active
2. **WebSocket connection fails**: Check backend server is running
3. **No transcript**: Check captions are enabled in meeting
4. **Summary not generating**: Check AssemblyAI API key is set
5. **Firebase errors**: Check authentication and permissions

---

## Future Enhancements

1. Support for more meeting platforms (Teams, Webex)
2. Real-time speaker identification
3. Custom note templates
4. Export to PDF/Word
5. Integration with calendar apps
6. AI-powered action item tracking
7. Meeting analytics and insights

---

## Conclusion

This documentation provides a complete overview of the Onix Meeting Assistant extension flow, from user interaction to data storage. Each component is designed to work together seamlessly, providing real-time transcription, summarization, and note-taking capabilities for online meetings.

