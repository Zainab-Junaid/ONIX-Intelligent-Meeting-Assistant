# ONIX AI Meeting Assistant - Architecture & Flow Diagram

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Component Breakdown](#component-breakdown)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Key Workflows](#key-workflows)
6. [Technology Stack](#technology-stack)
7. [Database Schemas](#database-schemas)

---

## 🏗️ System Overview

The ONIX AI Meeting Assistant is a comprehensive system that:
- **Captures** meeting transcripts from Google Meet
- **Generates** AI-powered summaries using AssemblyAI
- **Integrates** with Google Calendar for event matching
- **Sends** automated email summaries to participants via SendGrid
- **Provides** a dashboard for viewing and editing summaries

The system consists of **3 main components**:
1. **Frontend Dashboard** (Next.js) - User interface
2. **Backend Server** (Node.js/Express) - API and orchestration
3. **Meeting Bot** (Playwright) - Automated meeting attendance and transcription

---

## 🎯 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE LAYER                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐      ┌──────────────────┐                 │
│  │  Next.js         │      │  Chrome          │                 │
│  │  Dashboard       │      │  Extension       │                 │
│  │  (Port 3000)     │      │  (Browser)       │                 │
│  └────────┬─────────┘      └────────┬─────────┘                 │
│           │                         │                            │
│           │ Firebase Auth           │ WebSocket                  │
│           │                         │                            │
└───────────┼─────────────────────────┼────────────────────────────┘
            │                         │
            │                         │
┌───────────▼─────────────────────────▼────────────────────────────┐
│                      API GATEWAY LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Next.js API Routes (Next.js Server)              │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │ /api/meeting-bot/start                              │   │   │
│  │  │ /api/meetings/send-summary                         │   │   │
│  │  │ /api/meetings/update-summary                       │   │   │
│  │  │ /api/calendar/events                                │   │   │
│  │  │ /api/calendar/request-access                        │   │   │
│  │  │ /api/meetings/match-calendar-event                  │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────┬──────────────────────────────────────────────────────┘
            │
            │ HTTP/REST
            │
┌───────────▼──────────────────────────────────────────────────────┐
│                      BACKEND SERVICES LAYER                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Backend Server (Express.js - Port 3001)          │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │ POST /submit-link                                  │   │   │
│  │  │ POST /bot-done                                     │   │   │
│  │  │ GET  /meeting-summary/:id                          │   │   │
│  │  │ GET  /meeting-job/:meetingId                       │   │   │
│  │  │ PUT  /update-summary/:meetingId                   │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Meeting Bot (Playwright - Docker Container)      │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │ • Joins Google Meet                                │   │   │
│  │  │ • Captures captions/transcripts                    │   │   │
│  │  │ • Saves to PostgreSQL                              │   │   │
│  │  │ • Signals completion to backend                    │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────┬──────────────────────────────────────────────────────┘
            │
            │
┌───────────▼──────────────────────────────────────────────────────┐
│                      DATA & EXTERNAL SERVICES LAYER              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │  Firestore   │  │  Google      │          │
│  │  (Docker)    │  │  (Firebase)  │  │  Calendar    │          │
│  │              │  │              │  │  API         │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  AssemblyAI  │  │  SendGrid    │  │  Firebase    │          │
│  │  (LeMUR API) │  │  (Email)     │  │  Auth        │          │
│  │              │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 🧩 Component Breakdown

### 1. Frontend Dashboard (`frontend/dashboard/`)

**Technology:** Next.js 14, React, TypeScript, Tailwind CSS

**Key Components:**
- **Pages:**
  - `/meetings` - View all meetings (bot, extension, calendar)
  - `/summaries` - View and edit meeting summaries
  - `/settings` - User settings and calendar connection
  - `/transcripts` - View raw transcripts
  - `/tasks` - Action items and tasks

- **API Routes:**
  - `/api/meeting-bot/start` - Start bot for a meeting
  - `/api/meetings/send-summary` - Send email to participants
  - `/api/meetings/update-summary` - Edit summary
  - `/api/calendar/*` - Google Calendar OAuth and events
  - `/api/meetings/match-calendar-event` - Match meeting to calendar

- **Hooks:**
  - `use-bot-meetings.ts` - Fetch bot meetings and summaries
  - `use-calendar-events.ts` - Fetch Google Calendar events
  - `use-extension-meetings.ts` - Fetch extension meetings

- **Services:**
  - `email-service.ts` - SendGrid email sending
  - `calendar-service.ts` - Google Calendar API wrapper

### 2. Backend Server (`google-meet-meeting-bot/src/backend/`)

**Technology:** Node.js, Express, TypeScript, Prisma ORM

**Key Files:**
- `server.ts` - Main Express server with API endpoints
- `launchBot.ts` - Docker container orchestration for bot
- `schema.prisma` - Database schema definition

**Endpoints:**
- `POST /submit-link` - Start bot container
- `POST /bot-done` - Bot completion handler
- `GET /meeting-summary/:id` - Get summary
- `GET /meeting-job/:meetingId` - Get job details
- `PUT /update-summary/:meetingId` - Update summary

### 3. Meeting Bot (`google-meet-meeting-bot/src/playwright/`)

**Technology:** Playwright, TypeScript, Docker

**Key Files:**
- `runBot.ts` - Main bot logic
- `Dockerfile.bot` - Bot container image

**Functionality:**
- Authenticates with Google account
- Joins Google Meet meeting
- Captures live captions/transcripts
- Saves transcripts to PostgreSQL
- Signals completion to backend

### 4. Summarization (`google-meet-meeting-bot/src/summarize.ts`)

**Technology:** AssemblyAI LeMUR API

**Functionality:**
- Takes transcript segments
- Generates AI summary using AssemblyAI
- Extracts action items
- Saves to database

### 5. Chrome Extension (`frontend/chrome-extension/`)

**Technology:** Vanilla JavaScript, WebSocket

**Functionality:**
- Captures audio from Google Meet tab
- Sends to backend via WebSocket
- Displays live transcription
- Saves transcripts to Firestore

---

## 🔄 Data Flow Diagrams

### Flow 1: Starting a Meeting Bot

```
┌──────────┐
│   User   │
└────┬─────┘
     │
     │ 1. Clicks "Start Bot Meeting"
     │    Enters meeting URL
     ▼
┌─────────────────────────┐
│  Dashboard (Next.js)     │
│  /meetings page          │
└────┬─────────────────────┘
     │
     │ 2. POST /api/meeting-bot/start
     │    { meetingUrl, meetingTitle }
     │    Authorization: Bearer <token>
     ▼
┌─────────────────────────┐
│  Next.js API Route       │
│  /api/meeting-bot/start  │
└────┬─────────────────────┘
     │
     │ 3. Verify Firebase token
     │    Extract userId
     │
     │ 4. POST http://localhost:3001/submit-link
     │    { url, userId, meetingTitle }
     ▼
┌─────────────────────────┐
│  Backend Server          │
│  POST /submit-link       │
└────┬─────────────────────┘
     │
     │ 5. Create MeetingJob in PostgreSQL
     │    Generate jobId
     │
     │ 6. Launch Docker container
     │    docker run meetingbot-bot
     ▼
┌─────────────────────────┐
│  Meeting Bot Container   │
│  (Playwright)            │
└────┬─────────────────────┘
     │
     │ 7. Authenticate with Google
     │    Join Google Meet
     │    Capture captions
     │    Generate meetingId (UUID)
     │
     │ 8. Save transcript to PostgreSQL
     │    MeetingTranscript table
     │
     │ 9. POST /bot-done
     │    { jobId, meetingId }
     ▼
┌─────────────────────────┐
│  Backend Server          │
│  POST /bot-done          │
└────┬─────────────────────┘
     │
     │ 10. Update MeetingJob status
     │     Trigger summary generation
     │
     │ 11. POST /api/meetings/update-meeting-id
     │     Update Firestore document
     ▼
┌─────────────────────────┐
│  Firestore               │
│  meetings/{meetingId}    │
└──────────────────────────┘
```

### Flow 2: Summary Generation & Email Sending

```
┌─────────────────────────┐
│  Backend Server          │
│  POST /bot-done          │
└────┬─────────────────────┘
     │
     │ 1. Get transcript from PostgreSQL
     │
     │ 2. Call summarizeTranscript()
     ▼
┌─────────────────────────┐
│  summarize.ts            │
│  AssemblyAI LeMUR API    │
└────┬─────────────────────┘
     │
     │ 3. Generate summary & action items
     │
     │ 4. Save to PostgreSQL
     │    MeetingSummary table
     ▼
┌─────────────────────────┐
│  Backend Server          │
│  POST /bot-done          │
└────┬─────────────────────┘
     │
     │ 5. POST /api/meetings/send-summary-internal
     │    { meetingId }
     ▼
┌─────────────────────────┐
│  Next.js API Route       │
│  /api/meetings/          │
│  send-summary-internal   │
└────┬─────────────────────┘
     │
     │ 6. Get meeting from Firestore
     │    If not found, fetch from backend
     │
     │ 7. Get calendarEventId
     │    If missing, try to match
     ▼
┌─────────────────────────┐
│  Google Calendar API     │
│  GET /events/{eventId}   │
└────┬─────────────────────┘
     │
     │ 8. Extract attendee emails
     │
     │ 9. Call sendMeetingSummaryEmail()
     ▼
┌─────────────────────────┐
│  email-service.ts        │
│  SendGrid API            │
└────┬─────────────────────┘
     │
     │ 10. Send HTML email to all participants
     │
     ▼
┌─────────────────────────┐
│  Participant Inboxes    │
└─────────────────────────┘
```

### Flow 3: Calendar Integration & Event Matching

```
┌──────────┐
│   User   │
└────┬─────┘
     │
     │ 1. Clicks "Connect Google Calendar"
     ▼
┌─────────────────────────┐
│  Dashboard              │
│  /settings page         │
└────┬─────────────────────┘
     │
     │ 2. POST /api/calendar/request-access
     ▼
┌─────────────────────────┐
│  Next.js API Route       │
│  OAuth 2.0 Flow          │
└────┬─────────────────────┘
     │
     │ 3. Redirect to Google OAuth
     │    User grants permissions
     │
     │ 4. OAuth callback
     │    GET /api/calendar/oauth-callback
     │
     │ 5. Exchange code for tokens
     │    Store in Firestore
     │    users/{userId}/calendarAccessToken
     ▼
┌─────────────────────────┐
│  Firestore               │
│  users/{userId}          │
└────┬─────────────────────┘
     │
     │ 6. Fetch calendar events
     │    GET /api/calendar/events
     ▼
┌─────────────────────────┐
│  Google Calendar API     │
│  GET /calendars/primary/ │
│  events                  │
└────┬─────────────────────┘
     │
     │ 7. Display events on /meetings page
     │
     │ 8. When bot starts, try to match:
     │    POST /api/meetings/match-calendar-event
     │    { meetingUrl, meetingId }
     ▼
┌─────────────────────────┐
│  Match Calendar Event    │
│  API Route               │
└────┬─────────────────────┘
     │
     │ 9. Search calendar events
     │    Match by Google Meet URL
     │    Store calendarEventId
     ▼
┌─────────────────────────┐
│  Firestore               │
│  meetings/{meetingId}    │
│  { calendarEventId: ... }│
└─────────────────────────┘
```

### Flow 4: Editing Summary

```
┌──────────┐
│   User   │
└────┬─────┘
     │
     │ 1. Navigate to /summaries
     │    Click "Edit" on a summary
     │
     │ 2. Edit text inline
     │    Click "Save"
     ▼
┌─────────────────────────┐
│  Dashboard               │
│  /summaries page         │
└────┬─────────────────────┘
     │
     │ 3. PUT /api/meetings/update-summary
     │    { meetingId, summaryText }
     │    Authorization: Bearer <token>
     ▼
┌─────────────────────────┐
│  Next.js API Route       │
│  /api/meetings/          │
│  update-summary          │
└────┬─────────────────────┘
     │
     │ 4. Try: PUT backend/update-summary/:meetingId
     │    If 404, try direct PostgreSQL update
     │    If fails, update Firestore
     ▼
┌─────────────────────────┐
│  Backend Server          │
│  PUT /update-summary/    │
│  :meetingId              │
└────┬─────────────────────┘
     │
     │ 5. Update MeetingSummary in PostgreSQL
     │    OR Update Firestore if enabled
     ▼
┌─────────────────────────┐
│  PostgreSQL              │
│  MeetingSummary table    │
└──────────────────────────┘
```

---

## 🔑 Key Workflows

### Workflow 1: Complete Meeting Lifecycle

```
1. User connects Google Calendar
   └─> OAuth flow → Store access token

2. User starts bot meeting
   └─> Create job → Launch bot container
   └─> Bot joins meeting → Captures transcript
   └─> Save transcript → Generate summary
   └─> Match calendar event → Extract participants
   └─> Send email to participants

3. User views summary
   └─> Display on /summaries page
   └─> Option to edit
   └─> Option to resend email
```

### Workflow 2: Error Handling & Fallbacks

```
When sending email:
1. Try to get meeting from Firestore
   └─> If not found:
       └─> Try backend /meeting-job/:meetingId
           └─> Create Firestore document
               └─> Continue

2. Try to get calendarEventId
   └─> If missing:
       └─> Call /api/meetings/match-calendar-event
           └─> Search calendar events (30 days range)
               └─> Store calendarEventId

3. Try to get participant emails
   └─> If calendar event not found:
       └─> Use userId email as fallback
```

---

## 🛠️ Technology Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **UI:** React, Tailwind CSS, shadcn/ui
- **State:** React Hooks
- **Auth:** Firebase Authentication
- **Database:** Firestore (for user data, meeting metadata)

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **ORM:** Prisma
- **Database:** PostgreSQL (for transcripts, summaries, jobs)
- **Containerization:** Docker, Docker Compose

### Bot
- **Automation:** Playwright
- **Language:** TypeScript
- **Container:** Docker

### External Services
- **AI/ML:** AssemblyAI (LeMUR API for summarization)
- **Email:** SendGrid
- **Calendar:** Google Calendar API
- **Auth:** Firebase Admin SDK

### Infrastructure
- **Database:** PostgreSQL 15 (Docker container)
- **Backend:** Node.js (Docker container)
- **Bot:** Playwright (Docker container)
- **Frontend:** Next.js (local development)

---

## 💾 Database Schemas

### PostgreSQL (Prisma Schema)

```prisma
model MeetingJob {
  id          String   @id @default(uuid())
  meetingUrl  String
  userId      String?
  meetingTitle String?
  status      String   // "pending", "running", "transcript_saved", "completed"
  meetingId   String?  // Generated by bot
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model MeetingTranscript {
  id          String   @id @default(uuid())
  meetingId   String   @unique
  userId      String?
  meetingTitle String?
  segments    Json     // Array of transcript segments
  createdAt   DateTime @default(now())
}

model MeetingSummary {
  id          String   @id @default(uuid())
  meetingId   String   @unique
  userId      String?
  meetingTitle String?
  summaryText String
  model       String   // "assemblyai-lemur", "fallback", etc.
  generatedAt DateTime @default(now())
  updatedAt   DateTime @updatedAt
  edited      Boolean  @default(false)
}
```

### Firestore Collections

```
users/
  {userId}/
    - email: string
    - calendarAccessToken: string (encrypted)
    - calendarRefreshToken: string (encrypted)
    - calendarTokenExpiry: timestamp

meetings/
  {meetingId}/
    - meetingId: string
    - jobId: string
    - userId: string
    - meetingUrl: string
    - meetingTitle: string
    - calendarEventId: string (optional)
    - calendarEventTitle: string (optional)
    - status: string
    - createdAt: timestamp
    - matchedAt: timestamp (optional)
```

---

## 📊 System Interactions Summary

### Component Communication

```
Frontend Dashboard
    │
    ├─> Firebase Auth (User authentication)
    ├─> Firestore (User data, meeting metadata)
    ├─> Next.js API Routes (Server-side logic)
    │   │
    │   ├─> Backend Server (Bot orchestration)
    │   ├─> Google Calendar API (Event fetching)
    │   ├─> SendGrid API (Email sending)
    │   └─> Firestore (Data storage)
    │
    └─> Chrome Extension (Optional: live transcription)

Backend Server
    │
    ├─> PostgreSQL (Transcripts, summaries, jobs)
    ├─> Docker (Bot container management)
    ├─> AssemblyAI (Summary generation)
    └─> Frontend API (Update meeting IDs, trigger emails)

Meeting Bot
    │
    ├─> Google Meet (Join meeting, capture captions)
    ├─> PostgreSQL (Save transcripts)
    └─> Backend Server (Signal completion)
```

---

## 🚀 Deployment Architecture

```
┌─────────────────────────────────────────┐
│         Production Environment           │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐                      │
│  │   Frontend   │  Next.js (Vercel)    │
│  │   Dashboard  │  or self-hosted      │
│  └──────┬───────┘                      │
│         │                              │
│  ┌──────▼───────┐                      │
│  │   Backend    │  Docker Container    │
│  │   Server     │  (Port 3001)         │
│  └──────┬───────┘                      │
│         │                              │
│  ┌──────▼───────┐                      │
│  │  PostgreSQL  │  Docker Container    │
│  │  Database    │  (Port 5432)         │
│  └──────────────┘                      │
│                                         │
│  ┌──────────────┐                      │
│  │  Bot         │  Docker Container    │
│  │  Containers  │  (On-demand)        │
│  └──────────────┘                      │
│                                         │
│  External Services:                     │
│  • Firebase (Auth, Firestore)          │
│  • Google Calendar API                  │
│  • AssemblyAI API                       │
│  • SendGrid API                         │
│                                         │
└─────────────────────────────────────────┘
```

---

## 📝 Key Design Decisions

1. **Dual Database Strategy:**
   - **PostgreSQL:** Heavy data (transcripts, summaries) - better for complex queries
   - **Firestore:** Lightweight metadata (user preferences, meeting links) - real-time updates

2. **Containerized Bot:**
   - Isolated environment for Playwright
   - Can scale horizontally
   - Easy cleanup after meeting ends

3. **Fallback Mechanisms:**
   - Multiple backend URL attempts
   - Direct database updates if API fails
   - Graceful degradation for missing data

4. **OAuth Flow:**
   - Secure token storage in Firestore
   - Automatic token refresh
   - User-friendly permission modal

5. **Email Sending:**
   - Automated after summary generation
   - Manual trigger from dashboard
   - Participant extraction from calendar events

---

## 🔍 Troubleshooting Guide

### Common Issues & Solutions

1. **Bot not starting:**
   - Check Docker is running
   - Verify backend server is up (port 3001)
   - Check meeting URL format

2. **Email not sending:**
   - Verify SendGrid API key
   - Check meeting has calendarEventId
   - Ensure participant emails exist

3. **Summary not generating:**
   - Check AssemblyAI API key
   - Verify transcript exists in database
   - Check backend logs

4. **Calendar events not showing:**
   - Re-authenticate Google Calendar
   - Check OAuth permissions
   - Verify access token is valid

---

## 📚 Additional Resources

- **Backend Setup:** `google-meet-meeting-bot/RUN_LOCAL.md`
- **Email Setup:** `EMAIL_SUMMARY_SETUP.md`
- **Calendar Integration:** `CALENDAR_INTEGRATION_SUMMARY.md`
- **Email Implementation:** `EMAIL_IMPLEMENTATION_SUMMARY.md`

---

*Last Updated: [Current Date]*
*Version: 1.0*