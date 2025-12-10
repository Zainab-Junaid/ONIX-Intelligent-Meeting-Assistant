import { pushCaptionToBuffer, CaptionData } from './captionBuffer';
import { Segment } from '../../domain/transcription/models';

/**
 * Caption Service (Facade)
 * 
 * This is the main interface that the WebSocket server (or any other service)
 * should use to push captions to the buffer.
 * 
 * It provides a simple, clean API that abstracts away the Redis buffer implementation.
 * 
 * Usage:
 * ```typescript
 * await captionService.pushCaption(meetingId, {
 *   segment: { start: 0, end: 5, text: "Hello", speaker: "John" },
 *   userId: "user123",
 *   meetingTitle: "Team Standup"
 * });
 * ```
 */

/**
 * Push a caption to the buffer for a meeting.
 * 
 * This is a non-blocking operation that:
 * 1. Immediately writes to Redis (low latency)
 * 2. Returns without waiting for MongoDB persistence
 * 3. Allows the flush worker to handle batching and persistence
 * 
 * @param meetingId - Unique identifier for the meeting
 * @param segment - The transcript segment (speaker, text, timing)
 * @param userId - Optional user ID associated with the meeting
 * @param meetingTitle - Optional meeting title
 * 
 * @throws Error if Redis write fails
 */
export async function pushCaption(
  meetingId: string,
  segment: Segment,
  userId?: string,
  meetingTitle?: string
): Promise<void> {
  const captionData: CaptionData = {
    segment,
    timestamp: Date.now(),
    meetingId,
    userId,
    meetingTitle,
  };

  await pushCaptionToBuffer(meetingId, captionData);
}

/**
 * Push multiple captions in a batch.
 * 
 * Useful when receiving multiple segments at once (e.g., from a batch API).
 * Each caption is still pushed individually to maintain order and atomicity.
 * 
 * @param meetingId - Unique identifier for the meeting
 * @param segments - Array of transcript segments
 * @param userId - Optional user ID associated with the meeting
 * @param meetingTitle - Optional meeting title
 */
export async function pushCaptionsBatch(
  meetingId: string,
  segments: Segment[],
  userId?: string,
  meetingTitle?: string
): Promise<void> {
  // Push all segments in parallel for better performance
  // Each push is atomic, so order is maintained by Redis List
  const promises = segments.map((segment) =>
    pushCaption(meetingId, segment, userId, meetingTitle)
  );

  await Promise.all(promises);
}

// Export default for convenience
export default {
  pushCaption,
  pushCaptionsBatch,
};

