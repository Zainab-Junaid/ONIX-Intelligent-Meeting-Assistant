import { getRedisClient } from './redisClient';
import { Segment } from './models';

/**
 * Caption Buffer Producer
 * 
 * This module implements the producer side of the high-throughput write buffer pattern.
 * 
 * Why Redis Lists instead of Pub/Sub or BullMQ?
 * 
 * 1. **Redis Lists (RPUSH/LRANGE)**:
 *    - Perfect for buffering: data persists until consumed
 *    - Atomic operations (RPUSH is atomic)
 *    - Simple read-delete pattern (LRANGE + DEL)
 *    - No message loss if consumer is temporarily down
 *    - Low latency: O(1) append, O(N) read where N is buffer size
 *    - Built-in persistence if Redis is configured with AOF/RDB
 * 
 * 2. **Pub/Sub**:
 *    - Fire-and-forget: messages are lost if no subscriber is listening
 *    - No persistence: unsuitable for buffering
 *    - Designed for real-time notifications, not data buffering
 * 
 * 3. **BullMQ**:
 *    - Overkill for simple buffering: adds job scheduling, retries, priorities
 *    - More complex setup and dependencies
 *    - Better for complex job queues, not simple write buffers
 *    - Our use case is just "buffer until flush condition" - Lists are simpler
 * 
 * Architecture:
 * - Each meeting has a buffer key: `meeting:{meetingId}:buffer` (Redis List)
 * - Active meetings tracked in: `active_meetings` (Redis Set)
 * - Last activity timestamp: `meeting:{meetingId}:last_active` (Redis String)
 */

export interface CaptionData {
  segment: Segment;
  timestamp: number; // Unix timestamp in milliseconds
  meetingId: string;
  userId?: string;
  meetingTitle?: string;
}

/**
 * Push a caption to the Redis buffer for a meeting.
 * 
 * This operation is:
 * - Non-blocking: Returns immediately after Redis write
 * - Atomic: RPUSH is atomic, no race conditions
 * - Low latency: O(1) operation
 * 
 * @param meetingId - Unique identifier for the meeting
 * @param captionData - The caption segment and metadata
 */
export async function pushCaptionToBuffer(
  meetingId: string,
  captionData: CaptionData
): Promise<void> {
  const redis = getRedisClient();
  const bufferKey = `meeting:${meetingId}:buffer`;
  const lastActiveKey = `meeting:${meetingId}:last_active`;
  const activeMeetingsKey = 'active_meetings';
  const now = Date.now();

  try {
    // Use a pipeline for atomic multi-operation
    // This ensures all three operations succeed or fail together
    const pipeline = redis.pipeline();
    
    // 1. Append caption to buffer (Redis List)
    // RPUSH is O(1) and atomic
    pipeline.rpush(bufferKey, JSON.stringify(captionData));
    
    // 2. Update last activity timestamp
    // Helps the worker determine if a meeting is idle
    pipeline.set(lastActiveKey, now.toString());
    
    // 3. Add meeting to active_meetings set
    // Enables efficient scanning without key pattern matching
    pipeline.sadd(activeMeetingsKey, meetingId);
    
    // Execute all operations atomically
    await pipeline.exec();
    
    // Log for debugging (can be removed in production if too verbose)
    if (process.env.DEBUG_BUFFER === '1') {
      const bufferLength = await redis.llen(bufferKey);
      console.log(
        `[Buffer] 📝 Pushed caption to buffer for meeting ${meetingId} ` +
        `(buffer size: ${bufferLength}, speaker: ${captionData.segment.speaker})`
      );
    }
  } catch (error) {
    console.error(
      `[Buffer] ❌ Failed to push caption to buffer for meeting ${meetingId}:`,
      error
    );
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Get the current buffer size for a meeting.
 * Useful for monitoring and debugging.
 */
export async function getBufferSize(meetingId: string): Promise<number> {
  const redis = getRedisClient();
  const bufferKey = `meeting:${meetingId}:buffer`;
  return await redis.llen(bufferKey);
}

/**
 * Get the last activity timestamp for a meeting.
 */
export async function getLastActiveTime(meetingId: string): Promise<number | null> {
  const redis = getRedisClient();
  const lastActiveKey = `meeting:${meetingId}:last_active`;
  const timestamp = await redis.get(lastActiveKey);
  return timestamp ? parseInt(timestamp, 10) : null;
}

