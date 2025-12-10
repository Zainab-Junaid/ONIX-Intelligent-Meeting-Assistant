import { getRedisClient } from './redisClient';
import { saveBatchToMongo } from './mongoLayer';
import { CaptionData } from './captionBuffer';

/**
 * Flush Worker (Consumer)
 * 
 * This worker runs independently (as a cron job or continuous loop) and flushes
 * caption buffers from Redis to MongoDB when flush conditions are met.
 * 
 * Flush Conditions:
 * - Buffer length > 10 items (configurable via BUFFER_SIZE_THRESHOLD)
 * - Time since last_active > 5 seconds (configurable via BUFFER_IDLE_TIMEOUT)
 * 
 * Concurrency Safety:
 * - Uses Redis MULTI/EXEC transaction to atomically read and delete buffer
 * - Prevents race conditions where multiple workers process the same buffer
 * - Uses Lua script as an alternative for even stronger atomicity guarantees
 */

const BUFFER_SIZE_THRESHOLD = parseInt(process.env.BUFFER_SIZE_THRESHOLD || '10', 10);
const BUFFER_IDLE_TIMEOUT_MS = parseInt(process.env.BUFFER_IDLE_TIMEOUT_MS || '5000', 10);
const WORKER_INTERVAL_MS = parseInt(process.env.WORKER_INTERVAL_MS || '1000', 10);
const ACTIVE_MEETINGS_KEY = 'active_meetings';
const FLUSH_LOCK_TTL = parseInt(process.env.FLUSH_LOCK_TTL || '10', 10); // Lock timeout in seconds
const CLEANUP_THRESHOLD_MS = parseInt(process.env.CLEANUP_THRESHOLD_MS || '3600000', 10); // 1 hour default

/**
 * Lua script for atomic read-and-trim operation.
 * 
 * CRITICAL: Uses LTRIM instead of DEL to prevent race conditions.
 * 
 * This script:
 * 1. Reads N items from the list (LRANGE key 0 N-1)
 * 2. Trims the list to remove only those N items (LTRIM key N -1)
 * 3. Returns the items
 * 
 * Why LTRIM instead of DEL?
 * - DEL removes ALL items, including new ones that arrive during flush
 * - LTRIM only removes the items we read, leaving new arrivals safe
 * - Prevents data loss when captions arrive during flush operation
 * 
 * All operations are atomic - no other process can interfere.
 * 
 * Why Lua instead of MULTI/EXEC?
 * - Lua scripts are executed atomically on the server
 * - MULTI/EXEC can still have race conditions in some edge cases
 * - Lua is slightly more efficient (single round-trip)
 */
const FLUSH_BUFFER_SCRIPT = `
  local buffer_key = KEYS[1]
  local count = tonumber(ARGV[1]) or 0
  if count <= 0 then
    return {}
  end
  -- Read items 0 to count-1
  local items = redis.call('LRANGE', buffer_key, 0, count - 1)
  if #items > 0 then
    -- Trim list to remove only the items we read (keep everything from count onwards)
    redis.call('LTRIM', buffer_key, count, -1)
  end
  return items
`;

let flushScriptSha: string | null = null;

/**
 * Acquire a distributed lock for flushing a meeting buffer.
 * 
 * @param meetingId - The meeting ID
 * @returns true if lock acquired, false if lock already exists
 */
async function acquireFlushLock(meetingId: string): Promise<boolean> {
  const redis = getRedisClient();
  const lockKey = `meeting:${meetingId}:flush_lock`;
  
  // SET key value NX EX ttl - Set if not exists, with expiration
  const result = await redis.set(lockKey, '1', 'EX', FLUSH_LOCK_TTL, 'NX');
  return result === 'OK';
}

/**
 * Release a distributed lock for flushing a meeting buffer.
 * 
 * @param meetingId - The meeting ID
 */
async function releaseFlushLock(meetingId: string): Promise<void> {
  const redis = getRedisClient();
  const lockKey = `meeting:${meetingId}:flush_lock`;
  await redis.del(lockKey);
}

/**
 * Push failed items to Dead Letter Queue.
 * 
 * @param meetingId - The meeting ID
 * @param items - Array of failed caption data (as strings)
 */
async function pushToDeadLetterQueue(meetingId: string, items: string[]): Promise<void> {
  const redis = getRedisClient();
  const dlqKey = `meeting:${meetingId}:failed`;
  
  if (items.length > 0) {
    const pipeline = redis.pipeline();
    items.forEach(item => pipeline.rpush(dlqKey, item));
    await pipeline.exec();
    
    console.error(
      `[FlushWorker] 🚨 Pushed ${items.length} failed items to DLQ for meeting ${meetingId} ` +
      `(key: ${dlqKey})`
    );
  }
}

/**
 * Flush a single meeting buffer to MongoDB.
 * 
 * Uses atomic read-trim pattern to prevent data loss or duplication.
 * Implements distributed locking to prevent concurrent processing.
 * 
 * @param meetingId - The meeting ID to flush
 * @returns true if buffer was flushed, false if no flush was needed or lock acquired
 */
async function flushMeetingBuffer(meetingId: string): Promise<boolean> {
  const redis = getRedisClient();
  const bufferKey = `meeting:${meetingId}:buffer`;
  const lastActiveKey = `meeting:${meetingId}:last_active`;
  let lockAcquired = false;

  try {
    // Check flush conditions
    const [bufferLength, lastActiveStr] = await Promise.all([
      redis.llen(bufferKey),
      redis.get(lastActiveKey),
    ]);

    const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : null;
    const now = Date.now();
    const timeSinceLastActive = lastActive ? now - lastActive : Infinity;

    // Determine if flush is needed
    const shouldFlushBySize = bufferLength >= BUFFER_SIZE_THRESHOLD;
    const shouldFlushByIdle = timeSinceLastActive > BUFFER_IDLE_TIMEOUT_MS;

    if (!shouldFlushBySize && !shouldFlushByIdle) {
      return false; // No flush needed
    }

    // CRITICAL: Acquire distributed lock before processing
    lockAcquired = await acquireFlushLock(meetingId);
    if (!lockAcquired) {
      console.log(
        `[FlushWorker] ⏭️ Skipping meeting ${meetingId} - another worker is processing it`
      );
      return false; // Another worker is handling this
    }

    // Re-check buffer length after acquiring lock (may have changed)
    const currentBufferLength = await redis.llen(bufferKey);
    if (currentBufferLength === 0) {
      console.log(`[FlushWorker] ⚠️ Buffer empty for meeting ${meetingId} after lock acquisition`);
      return false;
    }

    console.log(
      `[FlushWorker] 🔄 Flushing buffer for meeting ${meetingId} ` +
      `(size: ${currentBufferLength}, idle: ${Math.round(timeSinceLastActive / 1000)}s)`
    );

    // Atomic read-and-trim using Lua script (preferred method)
    // CRITICAL: Use LTRIM instead of DEL to prevent race conditions
    let items: string[] = [];
    const itemsToRead = Math.min(currentBufferLength, 1000); // Read up to 1000 items at a time
    
    try {
      if (flushScriptSha) {
        // Use cached script SHA for efficiency
        try {
          // Pass buffer length as ARGV[1] to Lua script
          const result = await redis.evalsha(flushScriptSha, 1, bufferKey, itemsToRead.toString());
          items = Array.isArray(result) ? result.map(String) : [];
        } catch (error: any) {
          // If script not found, reload it
          if (error.message?.includes('NOSCRIPT')) {
            flushScriptSha = null;
            // Fall through to script loading
          } else {
            throw error;
          }
        }
      }

      if (!flushScriptSha) {
        // Load and execute script
        const loadedSha = await redis.script('LOAD', FLUSH_BUFFER_SCRIPT);
        flushScriptSha = loadedSha as string;
        const result = await redis.evalsha(flushScriptSha, 1, bufferKey, itemsToRead.toString());
        items = Array.isArray(result) ? result.map(String) : [];
      }
    } catch (luaError) {
      console.warn('[FlushWorker] ⚠️ Lua script failed, using MULTI/EXEC fallback:', luaError);
      // Fall through to MULTI/EXEC fallback
    }

    // Alternative: Use MULTI/EXEC if Lua script fails
    // CRITICAL: Use LTRIM instead of DEL in fallback too
    if (items.length === 0 && currentBufferLength > 0) {
      console.warn('[FlushWorker] ⚠️ Lua script returned empty but buffer has items, using MULTI/EXEC fallback');
      const multi = redis.multi();
      multi.lrange(bufferKey, 0, itemsToRead - 1);
      multi.ltrim(bufferKey, itemsToRead, -1); // Use LTRIM instead of DEL
      const results = await multi.exec();
      
      if (results && results[0] && results[0][1]) {
        items = Array.isArray(results[0][1]) 
          ? (results[0][1] as string[]).map(String)
          : [];
      }
    }

    if (items.length === 0) {
      console.log(`[FlushWorker] ⚠️ No items to flush for meeting ${meetingId}`);
      return false;
    }

    // Parse caption data
    const captionData: CaptionData[] = items
      .map((item) => {
        try {
          return JSON.parse(item) as CaptionData;
        } catch (error) {
          console.error(`[FlushWorker] ❌ Failed to parse caption item:`, error);
          return null;
        }
      })
      .filter((item): item is CaptionData => item !== null);

    if (captionData.length === 0) {
      console.warn(`[FlushWorker] ⚠️ No valid caption data to save for meeting ${meetingId}`);
      return false;
    }

    // Extract segments and metadata
    const segments = captionData.map((data) => data.segment);
    const firstCaption = captionData[0];
    const createdAt = firstCaption.timestamp 
      ? new Date(firstCaption.timestamp) 
      : new Date();

    // CRITICAL: Dead Letter Queue handling
    // Wrap MongoDB write in try/catch and push to DLQ on failure
    try {
      // Bulk insert to MongoDB (with chunking handled in mongoLayer)
      await saveBatchToMongo(
        meetingId,
        segments,
        firstCaption.userId,
        firstCaption.meetingTitle,
        createdAt
      );

      console.log(
        `[FlushWorker] ✅ Successfully flushed ${captionData.length} captions ` +
        `for meeting ${meetingId}`
      );

      return true;
    } catch (mongoError) {
      // CRITICAL: Push failed items to Dead Letter Queue
      console.error(
        `[FlushWorker] 🚨 CRITICAL: MongoDB write failed for meeting ${meetingId}. ` +
        `Pushing ${items.length} items to DLQ.`,
        mongoError
      );
      
      // Push original string items to DLQ (before parsing)
      await pushToDeadLetterQueue(meetingId, items);
      
      // Re-throw to be caught by outer catch
      throw mongoError;
    }
  } catch (error) {
    console.error(
      `[FlushWorker] ❌ Failed to flush buffer for meeting ${meetingId}:`,
      error
    );
    // Don't throw - continue processing other meetings
    return false;
  } finally {
    // CRITICAL: Always release lock in finally block
    if (lockAcquired) {
      await releaseFlushLock(meetingId);
    }
  }
}

/**
 * Clean up stale meetings from active_meetings set.
 * 
 * Removes meetings that:
 * - Have empty buffers AND
 * - Haven't been active for more than CLEANUP_THRESHOLD_MS
 * 
 * This prevents the active_meetings set from growing infinitely.
 */
async function cleanupStaleMeetings(): Promise<void> {
  const redis = getRedisClient();

  try {
    const activeMeetingIds = await redis.smembers(ACTIVE_MEETINGS_KEY);
    const now = Date.now();
    let cleanedCount = 0;

    for (const meetingId of activeMeetingIds) {
      const bufferKey = `meeting:${meetingId}:buffer`;
      const lastActiveKey = `meeting:${meetingId}:last_active`;

      // Check if buffer is empty
      const bufferLength = await redis.llen(bufferKey);
      
      if (bufferLength === 0) {
        // Check last active time
        const lastActiveStr = await redis.get(lastActiveKey);
        const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : null;
        
        if (lastActive) {
          const timeSinceLastActive = now - lastActive;
          
          // Remove if stale (idle for more than cleanup threshold)
          if (timeSinceLastActive > CLEANUP_THRESHOLD_MS) {
            await redis.srem(ACTIVE_MEETINGS_KEY, meetingId);
            cleanedCount++;
            console.log(
              `[FlushWorker] 🗑️ Cleaned up stale meeting ${meetingId} ` +
              `(idle for ${Math.round(timeSinceLastActive / 1000 / 60)} minutes)`
            );
          }
        } else {
          // No last_active timestamp - consider it stale
          await redis.srem(ACTIVE_MEETINGS_KEY, meetingId);
          cleanedCount++;
          console.log(
            `[FlushWorker] 🗑️ Cleaned up meeting ${meetingId} (no last_active timestamp)`
          );
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[FlushWorker] 🧹 Cleaned up ${cleanedCount} stale meetings`);
    }
  } catch (error) {
    console.error('[FlushWorker] ❌ Error cleaning up stale meetings:', error);
  }
}

/**
 * Discover active meetings and flush their buffers if conditions are met.
 * 
 * Uses the `active_meetings` Redis Set for efficient scanning.
 * This avoids expensive key pattern matching (KEYS command) which blocks Redis.
 */
async function processActiveMeetings(): Promise<void> {
  const redis = getRedisClient();

  try {
    // Get all active meetings from the set
    // SMEMBERS is O(N) where N is set size, but much better than KEYS pattern
    const activeMeetingIds = await redis.smembers(ACTIVE_MEETINGS_KEY);

    if (activeMeetingIds.length === 0) {
      return; // No active meetings
    }

    console.log(
      `[FlushWorker] 🔍 Checking ${activeMeetingIds.length} active meetings`
    );

    // Process each meeting
    const flushPromises = activeMeetingIds.map(async (meetingId) => {
      const wasFlushed = await flushMeetingBuffer(meetingId);
      
      // Note: Stale meeting cleanup is now handled separately in cleanupStaleMeetings()
      // This keeps the logic cleaner and allows for better control
    });

    await Promise.all(flushPromises);
  } catch (error) {
    console.error('[FlushWorker] ❌ Error processing active meetings:', error);
  }
}

/**
 * Main worker loop.
 * Runs continuously, checking for buffers to flush at regular intervals.
 * 
 * Can be run as:
 * - Standalone process: `node dist/flushWorker.js`
 * - Cron job: Schedule to run every N seconds
 * - Background service: Use PM2, systemd, etc.
 */
export async function startFlushWorker(): Promise<void> {
  console.log('[FlushWorker] 🚀 Starting flush worker...');
  console.log(`[FlushWorker] Configuration:`);
  console.log(`  - Buffer size threshold: ${BUFFER_SIZE_THRESHOLD} items`);
  console.log(`  - Idle timeout: ${BUFFER_IDLE_TIMEOUT_MS}ms`);
  console.log(`  - Worker interval: ${WORKER_INTERVAL_MS}ms`);
  console.log(`  - Flush lock TTL: ${FLUSH_LOCK_TTL}s`);
  console.log(`  - Stale cleanup threshold: ${CLEANUP_THRESHOLD_MS / 1000 / 60} minutes`);

  // Pre-load Lua script
  const redis = getRedisClient();
  try {
    const loadedSha = await redis.script('LOAD', FLUSH_BUFFER_SCRIPT);
    flushScriptSha = loadedSha as string;
    console.log('[FlushWorker] ✅ Lua script loaded');
  } catch (error) {
    console.warn('[FlushWorker] ⚠️ Failed to load Lua script, will use MULTI/EXEC:', error);
  }

  // Main loop
  let running = true;

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log('[FlushWorker] 🛑 Shutting down flush worker...');
    running = false;
    // Give current iteration time to finish
    await new Promise(resolve => setTimeout(resolve, WORKER_INTERVAL_MS));
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Run worker loop
  let iterationCount = 0;
  while (running) {
    try {
      await processActiveMeetings();
      
      // Run stale meeting cleanup every 10 iterations (to avoid overhead)
      iterationCount++;
      if (iterationCount % 10 === 0) {
        await cleanupStaleMeetings();
      }
    } catch (error) {
      console.error('[FlushWorker] ❌ Error in worker loop:', error);
    }

    // Wait before next iteration
    await new Promise(resolve => setTimeout(resolve, WORKER_INTERVAL_MS));
  }
}

// If this file is run directly, start the worker
// Note: In TypeScript/ES modules, use import.meta.main or check process.argv
// For CommonJS compatibility, we check if this is the main module
if (typeof require !== 'undefined' && require.main === module) {
  // Initialize MongoDB connection before starting worker
  (async () => {
    try {
      const { initMongoConnection } = await import('./mongoLayer');
      await initMongoConnection();
      await startFlushWorker();
    } catch (error) {
      console.error('[FlushWorker] ❌ Fatal error:', error);
      process.exit(1);
    }
  })();
}

