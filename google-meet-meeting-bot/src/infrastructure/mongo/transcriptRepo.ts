import mongoose, { Schema, Model, Document } from 'mongoose';
import { Segment } from '../../domain/transcription/models';

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
const SegmentSchema = new Schema<Segment>(
  {
    segmentId: { type: String, required: true },
    meetingId: { type: String, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    text: { type: String, required: true },
    speaker: { type: String, required: true },
  },
  { _id: false }
);

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
  segments: Segment[];
  // Finalization marker - prevents post-processing of partial transcripts
  finalized: boolean;
  finalizedAt?: Date;
}

const MeetingTranscriptSchema = new Schema<MeetingTranscriptDocument>({
  meetingId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, index: true },
  meetingTitle: { type: String },
  segments: { type: [SegmentSchema], default: [] },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
  // Finalization fields - CRITICAL for processing guards
  finalized: { type: Boolean, default: false, index: true },
  finalizedAt: { type: Date },
});

// Raw caption collection
interface RawCaptionDocument extends Document {
  meetingId: string;
  text: string;
  speaker?: string;
  timestamp: number;
  createdAt: Date;
}

const RawCaptionSchema = new Schema<RawCaptionDocument>({
  meetingId: { type: String, required: true, index: true },
  text: { type: String, required: true },
  speaker: { type: String },
  timestamp: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Models
let MeetingTranscriptModel: Model<MeetingTranscriptDocument>;
let RawCaptionModel: Model<RawCaptionDocument>;

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
    MeetingTranscriptModel = mongoose.model<MeetingTranscriptDocument>(
      'MeetingTranscript',
      MeetingTranscriptSchema
    );
    RawCaptionModel = mongoose.model<RawCaptionDocument>(
      'RawCaption',
      RawCaptionSchema
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
 * Save a batch of clean segments to MongoDB with chunking and idempotent upserts.
 * 
 * CRITICAL: Implements batch chunking to prevent MongoDB BSON size errors.
 * CRITICAL: Idempotent upsert per segmentId to avoid duplicates when refined.
 * 
 * This function:
 * 1. Upserts the meeting transcript metadata
 * 2. Splits segments into chunks of 500 items (configurable)
 * 3. Processes chunks in parallel using Promise.all
 * 4. Bulk upserts segments by segmentId (update if exists, push if missing)
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
  if (!MeetingTranscriptModel) {
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
      const bulkOps: any[] = [];

      // Ensure meeting doc exists / is updated
      bulkOps.push({
        updateOne: {
          filter: { meetingId },
          update: {
            $setOnInsert: {
              meetingId,
              createdAt: createdAt || new Date(),
            },
            $set: {
              userId,
              meetingTitle,
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      });

      for (const segment of chunk) {
        const payload = {
          segmentId: segment.segmentId,
          meetingId,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          speaker: segment.speaker,
        };

        // 1) Update existing segment by segmentId (no upsert here)
        bulkOps.push({
          updateOne: {
            filter: { meetingId, 'segments.segmentId': segment.segmentId },
            update: {
              $set: {
                'segments.$': payload,
                meetingTitle,
                userId,
                updatedAt: new Date(),
              },
            },
            upsert: false,
          },
        });

        // 2) If not present, push as new segment (with upsert for doc creation)
        bulkOps.push({
          updateOne: {
            filter: { meetingId, 'segments.segmentId': { $ne: segment.segmentId } },
            update: {
              $setOnInsert: {
                meetingId,
                createdAt: createdAt || new Date(),
              },
              $set: {
                meetingTitle,
                userId,
                updatedAt: new Date(),
              },
              $push: { segments: payload },
            },
            upsert: true,
          },
        });
      }

      const result = await MeetingTranscriptModel.bulkWrite(bulkOps, {
        ordered: false, // Continue on errors (e.g., duplicate)
      });

      const savedCount = (result.upsertedCount || 0) + (result.modifiedCount || 0);
      console.log(
        `[MongoDB] ✅ Chunk ${chunkIndex + 1}/${chunks.length}: Applied ${bulkOps.length} ops; segments=${chunk.length}; saved/updated=${savedCount}`
      );

      return chunk.length;
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
 * Save raw caption events for debugging/training.
 */
export async function saveRawBatch(
  meetingId: string,
  rawItems: { text: string; speaker?: string; timestamp: number }[]
): Promise<number> {
  if (!RawCaptionModel) {
    throw new Error('MongoDB not initialized. Call initMongoConnection() first.');
  }
  if (rawItems.length === 0) return 0;

  try {
    const docs = rawItems.map((r) => ({
      meetingId,
      text: r.text,
      speaker: r.speaker,
      timestamp: r.timestamp,
    }));
    const result = await RawCaptionModel.insertMany(docs, { ordered: false });
    console.log(`[MongoDB] ✅ Saved ${result.length} raw captions for meeting ${meetingId}`);
    return result.length;
  } catch (error) {
    console.error(`[MongoDB] ❌ Failed to save raw captions for meeting ${meetingId}:`, error);
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

/**
 * Mark a transcript as finalized.
 * 
 * CRITICAL: This is a GUARD function. The post-meeting processor MUST verify
 * that finalized=true before processing. This prevents processing of partial
 * transcripts when the meeting is still ongoing or the bot crashed mid-flush.
 * 
 * This should be called by the flushWorker AFTER the final segment batch
 * has been saved to MongoDB.
 * 
 * @param meetingId - The meeting ID to finalize
 * @returns true if finalization was successful, false if transcript not found
 */
export async function finalizeTranscript(meetingId: string): Promise<boolean> {
  if (!MeetingTranscriptModel) {
    try {
      await initMongoConnection();
    } catch {
      console.error('[MongoDB] ❌ Cannot finalize transcript - MongoDB not connected');
      return false;
    }
  }

  try {
    const result = await MeetingTranscriptModel.updateOne(
      { meetingId, finalized: { $ne: true } }, // Only update if not already finalized
      {
        $set: {
          finalized: true,
          finalizedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      // Either transcript doesn't exist or already finalized
      const existing = await MeetingTranscriptModel.findOne({ meetingId });
      if (existing) {
        console.log(`[MongoDB] ℹ️ Transcript ${meetingId} already finalized`);
        return true; // Already finalized is still success
      } else {
        console.error(`[MongoDB] ❌ Transcript ${meetingId} not found for finalization`);
        return false;
      }
    }

    console.log(`[MongoDB] ✅ Transcript ${meetingId} finalized successfully`);
    return true;
  } catch (error) {
    console.error(`[MongoDB] ❌ Error finalizing transcript ${meetingId}:`, error);
    return false;
  }
}

/**
 * Get a transcript from MongoDB by meetingId.
 * Used for dashboard queries - MongoDB is source of truth for transcripts.
 * 
 * @param meetingId - The meeting ID to fetch
 * @returns Transcript with segments and finalization status, or null if not found
 */
export async function getTranscriptFromMongo(meetingId: string): Promise<{
  meetingId: string;
  userId?: string;
  meetingTitle?: string;
  createdAt: Date;
  finalized: boolean;
  finalizedAt?: Date;
  segments: Array<{
    segmentId?: string;
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
} | null> {
  if (!MeetingTranscriptModel) {
    // Try to connect if not already connected
    try {
      await initMongoConnection();
    } catch {
      console.error('[MongoDB] ❌ Cannot get transcript - MongoDB not connected');
      return null;
    }
  }

  try {
    const doc = await MeetingTranscriptModel.findOne({ meetingId });
    if (!doc) {
      return null;
    }

    return {
      meetingId: doc.meetingId,
      userId: doc.userId,
      meetingTitle: doc.meetingTitle,
      createdAt: doc.createdAt,
      finalized: doc.finalized || false,
      finalizedAt: doc.finalizedAt,
      segments: doc.segments.map(seg => ({
        segmentId: seg.segmentId,
        speaker: seg.speaker,
        text: seg.text,
        start: seg.start,
        end: seg.end,
      })),
    };
  } catch (error) {
    console.error(`[MongoDB] ❌ Error fetching transcript for meeting ${meetingId}:`, error);
    return null;
  }
}

/**
 * Get all transcripts from MongoDB.
 * Used for dashboard meeting list - MongoDB is source of truth.
 * 
 * @returns Array of transcripts with segments
 */
export async function getAllTranscriptsFromMongo(): Promise<Array<{
  meetingId: string;
  userId?: string;
  meetingTitle?: string;
  createdAt: Date;
  segments: Array<{
    segmentId?: string;
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
}>> {
  if (!MeetingTranscriptModel) {
    try {
      await initMongoConnection();
    } catch {
      console.error('[MongoDB] ❌ Cannot list transcripts - MongoDB not connected');
      return [];
    }
  }

  try {
    const docs = await MeetingTranscriptModel.find({})
      .sort({ createdAt: -1 })
      .limit(100); // Limit for performance

    return docs.map(doc => ({
      meetingId: doc.meetingId,
      userId: doc.userId,
      meetingTitle: doc.meetingTitle,
      createdAt: doc.createdAt,
      segments: doc.segments.map(seg => ({
        segmentId: seg.segmentId,
        speaker: seg.speaker,
        text: seg.text,
        start: seg.start,
        end: seg.end,
      })),
    }));
  } catch (error) {
    console.error('[MongoDB] ❌ Error fetching all transcripts:', error);
    return [];
  }
}

/**
 * Get segment count for a specific meeting from MongoDB.
 * Used to sync PostgreSQL segmentCount with MongoDB reality.
 */
export async function getSegmentCountForMeeting(meetingId: string): Promise<number> {
  try {
    await initMongoConnection();
    const transcript = await MeetingTranscriptModel.findOne({ meetingId }).select('segments').lean();
    return transcript?.segments?.length ?? 0;
  } catch (error) {
    console.error(`[MongoDB] ❌ Error getting segment count for ${meetingId}:`, error);
    return 0;
  }
}
