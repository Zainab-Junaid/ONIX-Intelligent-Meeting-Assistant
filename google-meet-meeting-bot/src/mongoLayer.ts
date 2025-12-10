import mongoose, { Schema, Model, Document } from 'mongoose';
import { Segment } from './models';

/**
 * MongoDB Layer for Transcript Persistence
 * 
 * This module handles the persistence of transcript segments to MongoDB.
 * It uses Mongoose for schema definition and bulk operations for efficiency.
 */

// MongoDB connection string from environment
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/meeting-transcripts';

/**
 * Transcript Segment Schema
 * 
 * Stores individual caption segments with speaker, text, and timing information.
 */
interface TranscriptSegmentDocument extends Document {
  meetingId: string;
  start: number;
  end: number;
  text: string;
  speaker: string;
  createdAt: Date;
}

const TranscriptSegmentSchema = new Schema<TranscriptSegmentDocument>({
  meetingId: { type: String, required: true, index: true },
  start: { type: Number, required: true },
  end: { type: Number, required: true },
  text: { type: String, required: true },
  speaker: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Compound index to prevent duplicates (same meeting, speaker, start time)
TranscriptSegmentSchema.index({ meetingId: 1, speaker: 1, start: 1 }, { unique: true });

/**
 * Meeting Transcript Metadata Schema
 * 
 * Stores meeting-level information and references segments.
 */
interface MeetingTranscriptDocument extends Document {
  meetingId: string;
  userId?: string;
  meetingTitle?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MeetingTranscriptSchema = new Schema<MeetingTranscriptDocument>({
  meetingId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, index: true },
  meetingTitle: { type: String },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

// Models
let TranscriptSegmentModel: Model<TranscriptSegmentDocument>;
let MeetingTranscriptModel: Model<MeetingTranscriptDocument>;

/**
 * Initialize MongoDB connection.
 * Call this once at application startup.
 */
export async function initMongoConnection(): Promise<void> {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('[MongoDB] ✅ Already connected');
      return;
    }

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('[MongoDB] ✅ Connected to MongoDB');

    // Initialize models
    TranscriptSegmentModel = mongoose.model<TranscriptSegmentDocument>(
      'TranscriptSegment',
      TranscriptSegmentSchema
    );
    MeetingTranscriptModel = mongoose.model<MeetingTranscriptDocument>(
      'MeetingTranscript',
      MeetingTranscriptSchema
    );
  } catch (error) {
    console.error('[MongoDB] ❌ Connection failed:', error);
    throw error;
  }
}

/**
 * Chunk size for MongoDB batch writes.
 * Prevents BSON size errors by splitting large batches.
 */
const MONGO_BATCH_CHUNK_SIZE = parseInt(process.env.MONGO_BATCH_CHUNK_SIZE || '500', 10);

/**
 * Save a batch of segments to MongoDB with chunking.
 * 
 * CRITICAL: Implements batch chunking to prevent MongoDB BSON size errors.
 * 
 * This function:
 * 1. Upserts the meeting transcript metadata
 * 2. Splits segments into chunks of 500 items (configurable)
 * 3. Processes chunks in parallel using Promise.all
 * 4. Bulk inserts/updates segments (handles duplicates gracefully)
 * 
 * @param meetingId - Unique identifier for the meeting
 * @param segments - Array of segments to save
 * @param userId - Optional user ID
 * @param meetingTitle - Optional meeting title
 * @param createdAt - Meeting creation timestamp
 * 
 * @returns Number of segments successfully saved
 */
export async function saveBatchToMongo(
  meetingId: string,
  segments: Segment[],
  userId?: string,
  meetingTitle?: string,
  createdAt?: Date
): Promise<number> {
  if (!TranscriptSegmentModel || !MeetingTranscriptModel) {
    throw new Error('MongoDB not initialized. Call initMongoConnection() first.');
  }

  if (segments.length === 0) {
    return 0;
  }

  try {
    // 1. Upsert meeting transcript metadata
    await MeetingTranscriptModel.findOneAndUpdate(
      { meetingId },
      {
        meetingId,
        userId,
        meetingTitle,
        createdAt: createdAt || new Date(),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // 2. CRITICAL: Split segments into chunks to prevent BSON size errors
    const chunks: Segment[][] = [];
    for (let i = 0; i < segments.length; i += MONGO_BATCH_CHUNK_SIZE) {
      chunks.push(segments.slice(i, i + MONGO_BATCH_CHUNK_SIZE));
    }

    console.log(
      `[MongoDB] 📦 Splitting ${segments.length} segments into ${chunks.length} chunks ` +
      `(${MONGO_BATCH_CHUNK_SIZE} items per chunk)`
    );

    // 3. Process chunks in parallel using Promise.all
    const chunkPromises = chunks.map(async (chunk, chunkIndex) => {
      const bulkOps = chunk.map((segment) => ({
        updateOne: {
          filter: {
            meetingId,
            speaker: segment.speaker,
            start: segment.start,
          },
          update: {
            $set: {
              meetingId,
              start: segment.start,
              end: segment.end,
              text: segment.text,
              speaker: segment.speaker,
              createdAt: createdAt || new Date(),
            },
          },
          upsert: true, // Insert if doesn't exist, update if it does
        },
      }));

      const result = await TranscriptSegmentModel.bulkWrite(bulkOps, {
        ordered: false, // Continue on errors (e.g., duplicate key)
      });

      const savedCount = result.upsertedCount + result.modifiedCount;
      console.log(
        `[MongoDB] ✅ Chunk ${chunkIndex + 1}/${chunks.length}: Saved ${savedCount}/${chunk.length} segments ` +
        `(inserted: ${result.upsertedCount}, updated: ${result.modifiedCount})`
      );

      return savedCount;
    });

    // Wait for all chunks to complete
    const chunkResults = await Promise.all(chunkPromises);
    const totalSaved = chunkResults.reduce((sum, count) => sum + count, 0);

    console.log(
      `[MongoDB] ✅ Saved ${totalSaved}/${segments.length} segments for meeting ${meetingId} ` +
      `(processed ${chunks.length} chunks)`
    );

    return totalSaved;
  } catch (error) {
    console.error(`[MongoDB] ❌ Failed to save batch for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Close MongoDB connection gracefully.
 */
export async function closeMongoConnection(): Promise<void> {
  try {
    await mongoose.connection.close();
    console.log('[MongoDB] ✅ Connection closed');
  } catch (error) {
    console.error('[MongoDB] ❌ Error closing connection:', error);
  }
}

