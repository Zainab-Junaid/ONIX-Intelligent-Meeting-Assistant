# Google Meet Meeting Bot - Developer Audit Report

## 1. Project Summary

This is a **Google Meet meeting bot** that automatically joins Google Meet calls, captures live captions/transcripts, and generates AI-powered summaries using AssemblyAI. The bot uses Playwright for browser automation to join meetings, scrapes captions from the DOM, stores transcripts in PostgreSQL, and generates summaries via AssemblyAI's LeMUR API. It's designed as a proof-of-concept for automated meeting transcription and summarization.

**Tech Stack:**
- **Runtime:** Node.js 18+ with TypeScript
- **Browser Automation:** Playwright (Chromium)
- **Database:** PostgreSQL 15 with Prisma ORM
- **AI/ML:** AssemblyAI LeMUR API for summarization
- **Containerization:** Docker + Docker Compose
- **Frontend:** Vanilla TypeScript/HTML (simple form interface)
- **Authentication:** Google OAuth via stored session state

## 2. File and Folder Map

```
google-meet-meeting-bot/
├── 📁 src/
│   ├── 📁 backend/           # Express API server + Prisma database layer
│   ├── 📁 bot/              # Bot container entry point
│   ├── 📁 frontend/         # Simple HTML form for meeting URL submission
│   └── 📁 playwright/       # Core bot logic (meeting joining, caption scraping)
├── 📁 scripts/              # Auth generation utility
├── 📄 docker-compose.yml    # Multi-container orchestration
├── 📄 Dockerfile.be         # Backend container build
├── 📄 Dockerfile.bot        # Bot container build
├── 📄 package.json          # Root workspace configuration
├── 📄 auth.json             # Google session state (generated)
└── 📄 README.md             # Original setup instructions
```

**Key Files:**
- `src/backend/server.ts` - Express API server with meeting management endpoints
- `src/playwright/runBot.ts` - Core bot logic for joining meetings and scraping captions
- `src/backend/schema.prisma` - Database schema definition
- `src/summarize.ts` - AssemblyAI integration for summary generation
- `src/storage.ts` - Database operations via Prisma

## 3. Detailed Code Walkthrough

### Backend Server (`src/backend/server.ts`)
**Purpose:** Express API server that manages meeting jobs and coordinates bot execution.

**Key Functions:**
- `POST /submit-link` - Creates meeting job and launches bot container
- `POST /bot-done` - Handles bot completion, triggers summary generation
- `GET /meeting-summary/:id` - Fetches and generates summaries
- `POST /debug/generate-summary/:meetingId` - Debug endpoint for manual summary generation

**Data Flow:**
1. User submits meeting URL → creates `MeetingJob` record
2. Launches Docker container with bot image
3. Bot joins meeting, captures captions, saves to database
4. Bot signals completion → triggers summary generation
5. Summary stored in `MeetingSummary` table

**External APIs:**
- AssemblyAI LeMUR API for meeting summarization
- Docker API for container management

### Bot Core Logic (`src/playwright/runBot.ts`)
**Purpose:** Main bot execution - joins Google Meet, captures captions, manages session.

**Key Functions:**
- `runBot(url)` - Main entry point, orchestrates entire meeting capture process
- `scrapeCaptions()` - Sets up DOM observers to capture live captions
- `loginIfNeeded()` - Handles Google authentication and session refresh
- `ensureCaptionsOn()` - Enables captions via keyboard shortcuts or UI clicks

**Data Flow:**
1. Validates Google session or performs fresh login
2. Joins meeting via Playwright browser automation
3. Enables captions and sets up DOM mutation observer
4. Captures real-time captions, segments by speaker
5. Flushes segments to database every second
6. Detects meeting end (exit phrases, inactivity, manual leave)
7. Generates summary and notifies backend

**External Services:**
- Google Meet (browser automation)
- PostgreSQL database (via Prisma)
- Backend API for job coordination

### Database Layer (`src/storage.ts`)
**Purpose:** Prisma-based database operations for transcripts, summaries, and job management.

**Key Functions:**
- `saveTranscriptBatch()` - Upserts meeting transcripts and segments
- `getTranscript()` - Retrieves complete transcript with segments
- `saveSummary()` - Stores AI-generated summaries
- `createMeetingJob()` - Creates job tracking records

**Data Flow:**
- Segments stored with speaker, timing, and text
- Transcripts linked to segments via foreign key
- Summaries generated from complete transcripts
- Jobs track meeting status and completion

### Summary Generation (`src/summarize.ts`)
**Purpose:** Integrates with AssemblyAI LeMUR API for intelligent meeting summarization.

**Key Functions:**
- `summarizeTranscript()` - Main summarization function
- `getAssemblyAIClient()` - Initializes API client with error handling

**Data Flow:**
1. Combines all transcript segments into single text
2. Calls AssemblyAI LeMUR API with structured prompts
3. Returns formatted summary with metadata
4. Falls back to basic summary if API fails

**External APIs:**
- AssemblyAI LeMUR API (Claude 3.5 Sonnet model)

## 4. Docker & Deployment

### Container Architecture
The system uses a 3-container setup:

1. **PostgreSQL Container** (`postgres:15`)
   - Database: `meetingbotpoc`
   - User: `meetingbot` / Password: `supersecret`
   - Port: `5432`

2. **Backend Container** (`meetingbot-backend`)
   - Express API server
   - Port: `3001`
   - Mounts Docker socket for container management
   - Mounts `auth.json` for Google session persistence

3. **Bot Container** (`meetingbot-bot`)
   - Playwright-based bot execution
   - Runs on-demand via Docker API
   - Connects to backend and database

### Build Commands
```bash
# Build all containers
docker-compose build --no-cache

# Start all services
docker compose up -d

# Run database migrations
docker compose exec backend sh
npx prisma migrate deploy

# View logs
docker compose logs -f backend
docker compose logs -f postgres
```

### Environment Variables Required
```bash
DATABASE_URL=postgresql://meetingbot:supersecret@postgres:5432/meetingbotpoc
ASSEMBLYAI_API_KEY=your-assemblyai-api-key
GOOGLE_ACCOUNT_USER=your-google-email
GOOGLE_ACCOUNT_PASSWORD=your-google-password
```

## 5. Database Schema

### PostgreSQL Database: `meetingbotpoc`

**Tables:**
1. **MeetingTranscript**
   - `id` (UUID, Primary Key)
   - `meetingId` (String, Unique)
   - `createdAt` (DateTime)
   - `segments` (Relation to Segment table)

2. **Segment**
   - `id` (UUID, Primary Key)
   - `meetingId` (String, Foreign Key)
   - `start` (Integer, timing)
   - `end` (Integer, timing)
   - `text` (String, caption content)
   - `speaker` (String, speaker name)
   - Unique constraint on `(meetingId, start)`

3. **MeetingSummary**
   - `id` (UUID, Primary Key)
   - `meetingId` (String)
   - `summaryText` (String, AI-generated summary)
   - `generatedAt` (DateTime)
   - `model` (String, AI model used)

4. **MeetingJob**
   - `id` (UUID, Primary Key)
   - `meetingUrl` (String)
   - `status` (String, default: "pending")
   - `meetingId` (String, nullable)
   - `createdAt` (DateTime)
   - `updatedAt` (DateTime)

**Connection String:** `postgresql://meetingbot:supersecret@postgres:5432/meetingbotpoc`

## 6. Secrets & Credentials

### Required Secrets
1. **AssemblyAI API Key** (`ASSEMBLYAI_API_KEY`)
   - Used for: Meeting summarization via LeMUR API
   - Location: Environment variable
   - Risk: High - API costs

2. **Google Account Credentials**
   - `GOOGLE_ACCOUNT_USER` - Bot's Google email
   - `GOOGLE_ACCOUNT_PASSWORD` - Bot's Google password
   - Used for: Meeting authentication
   - Risk: High - Account access

3. **Database Credentials**
   - Username: `meetingbot`
   - Password: `supersecret` (hardcoded in schema.prisma)
   - Risk: Medium - Database access


## 7. Runtime & Prerequisites

### Prerequisites
- **Docker Desktop** (latest)
- **Node.js** 18+ 
- **Git**
- **Google Account** (dedicated for bot)
- **AssemblyAI API Key**

### Local Setup Steps
```bash
# 1. Clone and install
git clone <repo>
cd google-meet-meeting-bot
npm install

# 2. Environment setup
cp .env.sample .env
# Edit .env with your credentials

# 3. Generate Google auth
npm run gen:auth

# 4. Build and start
docker-compose build --no-cache
docker compose up -d

# 5. Run migrations
docker compose exec backend sh
npx prisma migrate deploy
exit

# 6. Start frontend (separate terminal)
cd src/frontend
npm install
npm run dev

# 7. Access UI at http://localhost:5173
```

### Expected Logs
- Backend: "Backend listening on port 3001"
- Database: "Database connection successful"
- Bot: "Bot finished, meetingId=..." when meeting ends

## 8. Observability & Debugging

### Logging
- **Backend:** Console logging for all API requests
- **Bot:** Detailed console output with emojis for status tracking
- **Database:** Prisma query logging (can be enabled)

### Debug Endpoints
- `POST /debug/generate-summary/:meetingId` - Manual summary generation
- Database queries via Prisma Studio: `npm run studio`

### Health Checks
- Database: `testDatabaseConnection()` function
- Backend: HTTP 200 on port 3001
- Bot: Process exit codes (0 = success, 1 = failure)

### Debug Mode
- Set `NODE_ENV=development` for verbose logging
- Bot includes detailed DOM inspection and screenshot capture
- Playwright tracing enabled for debugging

## 9. Integration Points with ONIX

### Current Integration Points
1. **REST API Endpoints** (`http://localhost:3001`)
   - `POST /submit-link` - Start meeting capture
   - `GET /meeting-summary/:id` - Retrieve summaries
   - `POST /bot-done` - Job completion callback

2. **Database Direct Access**
   - PostgreSQL connection for direct data access
   - Prisma client for type-safe queries

3. **WebSocket Potential**
   - No current WebSocket implementation
   - Could be added for real-time transcript streaming


### README-AUDIT.md ✅
Complete developer audit with all requested sections

### RUN_LOCAL.md
```markdown
# Running the Meeting Bot Locally

## Prerequisites
- Docker Desktop
- Node.js 18+
- Google Account (dedicated for bot)
- AssemblyAI API Key

## Quick Start
1. Clone repository
2. Run `npm install`
3. Copy `.env.sample` to `.env` and fill credentials
4. Run `npm run gen:auth` to generate Google session
5. Run `docker-compose up -d`
6. Run migrations: `docker compose exec backend sh && npx prisma migrate deploy`
7. Start frontend: `cd src/frontend && npm run dev`
8. Access UI at http://localhost:5173

## Expected Output
- Backend: "Backend listening on port 3001"
- Database: "Database connection successful"
- Bot: Detailed meeting capture logs
```


### Security Cleanup Script
```bash
#!/bin/bash
# cleanup-secrets.sh

echo "🔒 Cleaning up accidentally committed secrets..."

# Remove hardcoded password from schema
sed -i 's/supersecret/CHANGE_ME/g' src/backend/schema.prisma

# Update docker-compose with environment variable
sed -i 's/POSTGRES_PASSWORD: supersecret/POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}/g' docker-compose.yml

echo "✅ Secrets cleaned up. Please:"
echo "1. Set POSTGRES_PASSWORD environment variable"
echo "2. Update DATABASE_URL in .env"
echo "3. Rotate AssemblyAI API key"
echo "4. Use dedicated Google account for bot"
```

## 14. New Developer Walkthrough

### Getting Started (5 Steps)

1. **Read the Architecture** 📚
   - Start with `README-AUDIT.md` (this file)
   - Understand the 3-container setup (PostgreSQL, Backend, Bot)
   - Review the data flow: URL → Bot → Captions → Summary

2. **Set Up Environment** ⚙️
   - Install Docker Desktop and Node.js 18+
   - Get AssemblyAI API key and dedicated Google account
   - Run the setup commands from `RUN_LOCAL.md`

3. **Explore Key Files** 🔍
   - `src/backend/server.ts` - API endpoints and job management
   - `src/playwright/runBot.ts` - Core bot logic (start at line 23)
   - `src/backend/schema.prisma` - Database structure
   - `src/summarize.ts` - AI integration

4. **Test the System** 🧪
   - Start a Google Meet with your primary account
   - Submit the meeting URL via the frontend (localhost:5173)
   - Watch the bot logs to see caption capture in real-time
   - Check the database for stored transcripts and summaries

5. **Validate Success** ✅
   - Verify transcript appears in database
   - Confirm summary generation works
   - Check that bot properly exits meeting
   - Review logs for any errors or warnings

### Key Debugging Tips
- **Bot not joining?** Check Google auth in `auth.json`
- **No captions?** Verify captions are enabled in the meeting
- **Summary fails?** Check AssemblyAI API key and credits
- **Database issues?** Verify PostgreSQL container is running

### Next Steps for ONIX Integration
- Review the integration points in section 9
- Start with Phase 1 security improvements
- Implement Firebase Auth middleware
- Create Firestore sync service for meeting data
