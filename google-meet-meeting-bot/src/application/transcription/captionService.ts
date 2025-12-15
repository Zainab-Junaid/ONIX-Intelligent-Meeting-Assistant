import {
  pushCaptionToBuffer,
  pushRawCaptionToBuffer,
  CaptionData,
  RawCaptionData,
} from './captionBuffer';
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
export async function pushFinalCaption(
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
 * Push a raw caption event to the raw buffer.
 */
export async function pushRawCaption(
  meetingId: string,
  payload: RawCaptionData
): Promise<void> {
  await pushRawCaptionToBuffer(meetingId, payload);
}

// Export default for convenience
export default {
  pushFinalCaption,
  pushRawCaption,
};

