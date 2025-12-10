# Redis High-Throughput Write Buffer - Usage Guide

This document explains how to use the Redis-based caption buffering system.

## Architecture Overview

```
WebSocket/API → captionService → captionBuffer → Redis List
                                              ↓
                                         flushWorker → MongoDB
```

## Setup

### 1. Environment Variables

Add these to your `.env` file:

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=  # Optional, if Redis requires authentication

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/meeting-transcripts

# Buffer Configuration (optional, defaults shown)
BUFFER_SIZE_THRESHOLD=10        # Flush when buffer reaches 10 items
BUFFER_IDLE_TIMEOUT_MS=5000     # Flush if idle for 5 seconds
WORKER_INTERVAL_MS=1000         # Worker checks every 1 second

# Debug (optional)
DEBUG_BUFFER=1                  # Enable verbose buffer logging
```

### 2. Install Dependencies

```bash
npm install ioredis mongoose
```

### 3. Initialize MongoDB Connection

In your application startup (e.g., `server.ts`):

```typescript
import { initMongoConnection } from './mongoLayer';

// Initialize MongoDB before starting server
await initMongoConnection();
```

## Usage

### Pushing Captions (Producer)

Use the `captionService` facade to push captions:

```typescript
import { pushCaption, pushCaptionsBatch } from './captionService';
import { Segment } from './models';

// Single caption
await pushCaption('meeting-123', {
  start: 0,
  end: 5,
  text: 'Hello, everyone!',
  speaker: 'John Doe'
}, 'user-456', 'Team Standup');

// Batch of captions
const segments: Segment[] = [
  { start: 0, end: 5, text: 'Hello', speaker: 'John' },
  { start: 5, end: 10, text: 'Hi there', speaker: 'Jane' },
];

await pushCaptionsBatch('meeting-123', segments, 'user-456', 'Team Standup');
```

### Running the Flush Worker (Consumer)

The flush worker runs independently and automatically flushes buffers to MongoDB.

#### Option 1: Standalone Process

```bash
# Build TypeScript
npm run build

# Run worker
node dist/flushWorker.js
```

#### Option 2: PM2 (Production)

```bash
pm2 start dist/flushWorker.js --name flush-worker
```

#### Option 3: Docker

```dockerfile
# In your Dockerfile
CMD ["node", "dist/flushWorker.js"]
```

#### Option 4: Cron Job

```bash
# Run every 5 seconds
* * * * * /usr/bin/node /path/to/dist/flushWorker.js
* * * * * sleep 5 && /usr/bin/node /path/to/dist/flushWorker.js
```

#### Option 5: Integrated in Main Process

```typescript
import { startFlushWorker } from './flushWorker';
import { initMongoConnection } from './mongoLayer';

// Start worker in background
(async () => {
  await initMongoConnection();
  startFlushWorker(); // Runs in background
})();
```

## Integration Example: WebSocket Server

```typescript
import { pushCaption } from './captionService';
import { Segment } from './models';

// WebSocket message handler
ws.on('message', async (data) => {
  try {
    const message = JSON.parse(data);
    
    if (message.type === 'caption') {
      const segment: Segment = {
        start: message.start,
        end: message.end,
        text: message.text,
        speaker: message.speaker,
      };
      
      // Push to buffer (non-blocking, low latency)
      await pushCaption(
        message.meetingId,
        segment,
        message.userId,
        message.meetingTitle
      );
      
      // Response sent immediately, persistence handled by worker
      ws.send(JSON.stringify({ 
        status: 'buffered',
        meetingId: message.meetingId 
      }));
    }
  } catch (error) {
    console.error('Error handling caption:', error);
    ws.send(JSON.stringify({ error: error.message }));
  }
});
```

## How It Works

### 1. Caption Ingestion
- Captions are immediately pushed to Redis List (`meeting:{id}:buffer`)
- Operation is atomic and non-blocking
- Meeting is added to `active_meetings` set for efficient discovery

### 2. Buffering
- Data stays in Redis until flush conditions are met
- No data loss on application crash (Redis persists data)
- Low latency: O(1) append operation

### 3. Flush Conditions
- **Size-based**: Buffer reaches threshold (default: 10 items)
- **Time-based**: Meeting idle for timeout (default: 5 seconds)

### 4. Persistence
- Worker atomically reads and deletes buffer (Lua script or MULTI/EXEC)
- Bulk insert to MongoDB using `bulkWrite` for efficiency
- Only clears Redis after successful MongoDB write

## Concurrency Safety

- **Lua Script**: Atomic read-and-delete operation
- **MULTI/EXEC Fallback**: Transactional batch operations
- **Active Meetings Set**: Efficient scanning without blocking Redis
- **No Race Conditions**: Multiple workers can run safely

## Monitoring

### Check Buffer Size

```typescript
import { getBufferSize } from './captionBuffer';

const size = await getBufferSize('meeting-123');
console.log(`Buffer size: ${size}`);
```

### Check Last Activity

```typescript
import { getLastActiveTime } from './captionBuffer';

const lastActive = await getLastActiveTime('meeting-123');
if (lastActive) {
  const idleTime = Date.now() - lastActive;
  console.log(`Idle for ${idleTime}ms`);
}
```

## Troubleshooting

### Redis Connection Issues

```typescript
import { getRedisClient } from './redisClient';

const redis = getRedisClient();
await redis.ping(); // Should return 'PONG'
```

### MongoDB Connection Issues

```typescript
import { initMongoConnection } from './mongoLayer';

try {
  await initMongoConnection();
  console.log('MongoDB connected');
} catch (error) {
  console.error('MongoDB connection failed:', error);
}
```

### Worker Not Flushing

1. Check if worker is running: `ps aux | grep flushWorker`
2. Check Redis for active meetings: `redis-cli SMEMBERS active_meetings`
3. Check buffer size: `redis-cli LLEN meeting:{id}:buffer`
4. Enable debug logging: `DEBUG_BUFFER=1`

## Performance Considerations

- **Redis Lists**: O(1) append, O(N) read where N is buffer size
- **Bulk Operations**: MongoDB `bulkWrite` is much faster than individual inserts
- **Active Set Scanning**: O(N) where N is number of active meetings (much better than KEYS pattern)
- **Lua Scripts**: Single round-trip, atomic execution

## Production Recommendations

1. **Redis Persistence**: Enable AOF (Append-Only File) or RDB snapshots
2. **MongoDB Indexes**: Already configured in schema (meetingId, speaker, start)
3. **Worker Scaling**: Run multiple workers if needed (they're safe to run in parallel)
4. **Monitoring**: Add metrics for buffer sizes, flush rates, error rates
5. **Alerting**: Monitor Redis memory usage and MongoDB connection health

