# FlushWorker Documentation

The FlushWorker is the **consumer process** in the Redis-based caption buffering system. It moves caption data from Redis buffers to MongoDB for persistence.

## Data Flow

```
Caption Scraper → Redis Buffer → FlushWorker → MongoDB
                                      ↓
                               (publishes to Redis channel)
                                      ↓
                               Socket Server → Frontend Dashboard
```

## Core Functions

| Function | Purpose |
|----------|---------|
| `flushMeetingBuffer()` | Atomically reads caption items from Redis and saves them to MongoDB |
| `processActiveMeetings()` | Discovers all active meetings and flushes their buffers |
| `cleanupStaleMeetings()` | Removes meetings that have been inactive for over 1 hour |
| `pushToDeadLetterQueue()` | Handles failed items by pushing them to a DLQ for recovery |

## Key Features

- **Atomic Operations** - Uses Lua scripts to prevent data loss/duplication during read-and-trim
- **Distributed Locking** - Prevents multiple workers from processing the same meeting concurrently
- **Dead Letter Queue** - Failed items are preserved for later recovery
- **Stale Cleanup** - Automatically removes inactive meetings after a configurable threshold

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `FLUSH_INTERVAL_MS` | `5000` | Interval between flush checks (ms) |
| `BUFFER_SIZE_THRESHOLD` | `10` | Number of items to trigger a flush |
| `RAW_BUFFER_SIZE_THRESHOLD` | `20` | Threshold for raw caption buffer |
| `FLUSH_LOCK_TTL` | `10` | Lock timeout in seconds |
| `CLEANUP_THRESHOLD_MS` | `3600000` | Time before inactive meetings are cleaned (1 hour) |

## Running the Worker

### Standalone Process
```bash
npx ts-node ./src/infrastructure/workers/flushWorker.ts
```

### Production (PM2)
```bash
pm2 start dist/flushWorker.js --name flush-worker
```

### Docker
```dockerfile
CMD ["node", "dist/flushWorker.js"]
```

## Troubleshooting

1. **Check if worker is running:**
   ```bash
   ps aux | grep flushWorker
   ```

2. **Monitor Redis buffers:**
   ```bash
   redis-cli SMEMBERS active_meetings
   redis-cli LLEN buffer:<meeting_id>
   ```

3. **Check Dead Letter Queue:**
   ```bash
   redis-cli LRANGE dlq:<meeting_id> 0 -1
   ```
