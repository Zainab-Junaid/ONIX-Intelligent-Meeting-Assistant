# ONIX Integration Plan

## Overview

This document outlines the step-by-step plan for integrating the Google Meet Meeting Bot with your existing ONIX project (Chrome extension + Firebase Auth + Firestore).

## Current ONIX Stack
- **Chrome Extension** - User interface and meeting management
- **Firebase Auth** - User authentication and authorization
- **Firestore** - Document database for user data
- **Node.js Server** - Backend API and business logic

## Integration Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Chrome        │    │   ONIX Node     │    │   Meeting Bot   │
│   Extension     │◄──►│   Server        │◄──►│   Service       │
│                 │    │                 │    │                 │
│ • Meeting UI    │    │ • Firebase Auth │    │ • Bot Launcher  │
│ • User Auth     │    │ • Firestore     │    │ • Caption Scraper│
│ • Transcripts   │    │ • API Gateway   │    │ • Summary Gen   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   PostgreSQL    │
                       │   (Bot Data)    │
                       └─────────────────┘
```

## Phase 1: Security & Authentication

### 1.1 Add Firebase Auth to Bot Backend
**File:** `src/backend/middleware/auth.ts`
```typescript
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = initializeApp();
const auth = getAuth();

export const verifyFirebaseToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

### 1.2 Secure API Endpoints
**File:** `src/backend/server.ts`
```typescript
import { verifyFirebaseToken } from './middleware/auth';

// Apply auth to all meeting endpoints
app.use('/api/meetings', verifyFirebaseToken);
app.use('/api/summaries', verifyFirebaseToken);

// Update existing endpoints
app.post("/api/meetings/start", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const { url } = req.body;
  // ... existing logic with user context
});
```

### 1.3 Rotate Hardcoded Credentials
**File:** `src/backend/schema.prisma`
```prisma
datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
}
```

**File:** `docker-compose.yml`
```yaml
services:
  postgres:
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

### 1.4 Add User Context to Database
**File:** `src/backend/schema.prisma`
```prisma
model MeetingTranscript {
    id        String    @id @default(uuid())
    meetingId String    @unique
    userId    String    // Add user association
    createdAt DateTime
    segments  Segment[]
}

model MeetingJob {
    id          String   @id @default(uuid())
    userId      String   // Add user association
    meetingUrl  String
    status      String   @default("pending")
    meetingId   String? 
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt
}
```

## Phase 2: Data Synchronization

### 2.1 Create Firestore Sync Service
**File:** `src/backend/services/firestore-sync.ts`
```typescript
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp();
const db = getFirestore();

export class FirestoreSyncService {
  async syncMeetingToFirestore(userId: string, meetingId: string) {
    const transcript = await getTranscript(meetingId);
    const summary = await getSummary(meetingId);
    
    const meetingData = {
      id: meetingId,
      userId,
      transcript: transcript.segments,
      summary: summary.summaryText,
      createdAt: transcript.createdAt,
      participants: this.extractParticipants(transcript.segments),
      duration: this.calculateDuration(transcript.segments)
    };
    
    await db.collection('users').doc(userId)
      .collection('meetings').doc(meetingId)
      .set(meetingData);
  }
  
  private extractParticipants(segments: Segment[]): string[] {
    return [...new Set(segments.map(s => s.speaker))];
  }
  
  private calculateDuration(segments: Segment[]): number {
    if (segments.length === 0) return 0;
    const lastSegment = segments[segments.length - 1];
    return lastSegment.end - segments[0].start;
  }
}
```

### 2.2 Update Bot Completion Handler
**File:** `src/backend/server.ts`
```typescript
import { FirestoreSyncService } from './services/firestore-sync';

const firestoreSync = new FirestoreSyncService();

app.post("/bot-done", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const { jobId, meetingId } = req.body;
  
  // ... existing logic ...
  
  // Sync to Firestore
  await firestoreSync.syncMeetingToFirestore(userId, meetingId);
  
  res.send("Summary completed and synced to Firestore");
});
```

### 2.3 Add Real-time Transcript Streaming
**File:** `src/backend/services/websocket.ts`
```typescript
import { WebSocketServer } from 'ws';
import { Server } from 'http';

export class TranscriptWebSocketService {
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocket[]>();
  
  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.setupWebSocketHandlers();
  }
  
  broadcastTranscript(userId: string, meetingId: string, segment: Segment) {
    const userConnections = this.connections.get(userId) || [];
    const message = JSON.stringify({
      type: 'transcript_update',
      meetingId,
      segment
    });
    
    userConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}
```

## Phase 3: ONIX-Specific Features (Week 5-6)

### 3.1 Chrome Extension Integration
**File:** `src/backend/routes/chrome-extension.ts`
```typescript
// Endpoint for Chrome extension to start meetings
app.post('/api/chrome/start-meeting', verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const { meetingUrl, meetingTitle } = req.body;
  
  const job = await createMeetingJob(meetingUrl, userId, meetingTitle);
  await launchBotContainer(meetingUrl, job.id, userId);
  
  res.json({ 
    jobId: job.id, 
    status: 'started',
    websocketUrl: `ws://localhost:3001/ws/${userId}`
  });
});

// Endpoint for Chrome extension to get meeting status
app.get('/api/chrome/meeting/:meetingId', verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const { meetingId } = req.params;
  
  const meeting = await getMeetingWithTranscript(meetingId, userId);
  res.json(meeting);
});
```

### 3.2 Meeting Scheduling Integration
**File:** `src/backend/services/calendar-integration.ts`
```typescript
export class CalendarIntegrationService {
  async scheduleBotForMeeting(userId: string, calendarEvent: CalendarEvent) {
    const meetingUrl = this.extractMeetingUrl(calendarEvent.description);
    if (!meetingUrl) return;
    
    // Schedule bot to join 1 minute before meeting starts
    const joinTime = new Date(calendarEvent.startTime.getTime() - 60000);
    
    await this.scheduleBotJob({
      userId,
      meetingUrl,
      scheduledTime: joinTime,
      meetingTitle: calendarEvent.title
    });
  }
}
```

### 3.3 User Preferences
**File:** `src/backend/schema.prisma`
```prisma
model UserPreferences {
  id                String   @id @default(uuid())
  userId            String   @unique
  autoJoinMeetings  Boolean  @default(true)
  summaryModel      String   @default("assemblyai-lemur")
  summaryLength     String   @default("medium") // short, medium, long
  notificationEmail String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

## Phase 4: Production Readiness (Week 7-8)

### 4.1 Container Orchestration
**File:** `docker-compose.prod.yml`
```yaml
version: '3.8'
services:
  meeting-bot-backend:
    build: .
    dockerfile: Dockerfile.be
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
      - ASSEMBLYAI_API_KEY=${ASSEMBLYAI_API_KEY}
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis
  
  meeting-bot-queue:
    build: .
    dockerfile: Dockerfile.bot
    environment:
      - REDIS_URL=${REDIS_URL}
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - redis
      - postgres
  
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

### 4.2 Monitoring and Logging
**File:** `src/backend/middleware/monitoring.ts`
```typescript
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
    new transports.Console()
  ]
});

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  logger.info('API Request', {
    method: req.method,
    url: req.url,
    userId: req.user?.uid,
    timestamp: new Date().toISOString()
  });
  next();
};
```

## Implementation Commands

### Phase 1: Security Setup
```bash
# 1. Install Firebase Admin SDK
cd src/backend
npm install firebase-admin

# 2. Update environment variables
echo "FIREBASE_PROJECT_ID=your-project-id" >> .env
echo "FIREBASE_PRIVATE_KEY=your-private-key" >> .env
echo "POSTGRES_PASSWORD=your-secure-password" >> .env

# 3. Run database migrations
npx prisma migrate dev --name add-user-context

# 4. Test authentication
curl -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
     http://localhost:3001/api/meetings/start \
     -d '{"url":"https://meet.google.com/test"}'
```

### Phase 2: Firestore Integration
```bash
# 1. Install Firestore dependencies
npm install firebase-admin

# 2. Initialize Firestore service
node -e "
const { FirestoreSyncService } = require('./src/backend/services/firestore-sync');
const service = new FirestoreSyncService();
console.log('Firestore service initialized');
"

# 3. Test data sync
curl -X POST http://localhost:3001/api/test/sync-meeting \
     -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
     -d '{"meetingId":"test-meeting-id"}'
```

### Phase 3: Chrome Extension Integration
```bash
# 1. Update Chrome extension manifest
# Add permissions for your backend API

# 2. Test Chrome extension integration
# Use browser dev tools to test API calls

# 3. Deploy updated extension
# Follow your existing Chrome extension deployment process
```

## Testing Strategy

### Unit Tests
```bash
# Install testing dependencies
npm install --save-dev jest @types/jest supertest

# Run tests
npm test
```

### Integration Tests
```bash
# Test full meeting flow
npm run test:integration

# Test Firestore sync
npm run test:firestore-sync
```

### End-to-End Tests
```bash
# Test Chrome extension + bot integration
npm run test:e2e
```

## Migration Strategy

### Data Migration from Bot to ONIX
```typescript
// Migration script to move existing bot data to ONIX structure
async function migrateBotDataToONIX() {
  const existingMeetings = await prisma.meetingTranscript.findMany();
  
  for (const meeting of existingMeetings) {
    // Map to ONIX user structure
    await firestore.collection('users').doc('migrated-user')
      .collection('meetings').doc(meeting.meetingId)
      .set({
        id: meeting.meetingId,
        transcript: meeting.segments,
        createdAt: meeting.createdAt,
        source: 'bot-migration'
      });
  }
}
```

## Rollback Plan

1. **Phase 1 Rollback:** Disable Firebase Auth, revert to original endpoints
2. **Phase 2 Rollback:** Disable Firestore sync, keep PostgreSQL only
3. **Phase 3 Rollback:** Disable Chrome extension features, keep core bot
4. **Full Rollback:** Revert to original bot implementation

## Success Metrics

- **Functionality:** Bot successfully joins meetings and captures transcripts
- **Integration:** Chrome extension can start and monitor meetings
- **Data Sync:** Transcripts properly synced to Firestore
- **Performance:** < 80 second bot join time, < 30 second summary generation
- **Security:** All endpoints authenticated, no data leaks
- **User Experience:** Seamless integration with existing ONIX workflow
