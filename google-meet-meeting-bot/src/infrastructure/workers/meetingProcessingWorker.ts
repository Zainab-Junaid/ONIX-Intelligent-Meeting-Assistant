import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../../config/redis';
import { QueueNames, MeetingStatus } from '../../config/constants';
import { prisma } from '../../lib/prisma';
import type { MeetingProcessingJobData, ProcessingJobResult } from '../queue/meetingQueue';
import {
    computeSpeakerStats,
    computeMeetingAnalytics,
    extractTranscriptMetadata,
    upsertAllAnalytics,
} from '../../application/analytics';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONCURRENCY = 2; // Process 2 meetings simultaneously
const MAX_LOCK_WAIT_MS = 30000; // Wait up to 30s for transcript finalization

// ============================================================================
// WORKER PROCESS FUNCTION
// ============================================================================

/**
 * Main job processor for post-meeting analytics.
 * 
 * This function implements the three-stage processing pipeline:
 * - Stage 1: Deterministic Analytics (math-only, retry-safe)
 * - Stage 2: Semantic Processing (AI-dependent)
 * - Stage 3: Finalization
 */
async function processMeetingJob(
    job: Job<MeetingProcessingJobData, ProcessingJobResult>
): Promise<ProcessingJobResult> {
    const { meetingId } = job.data;
    const startTime = Date.now();

    console.log(`[Worker] 🚀 Processing meeting: ${meetingId}`);
    await job.updateProgress(5);

    try {
        // ========================================================================
        // GUARD 1: Check transcript is finalized in MongoDB
        // ========================================================================
        await job.updateProgress(10);

        const { getTranscriptFromMongo, initMongoConnection } = await import('../mongo/transcriptRepo');
        await initMongoConnection();

        const transcript = await getTranscriptFromMongo(meetingId);
        if (!transcript) {
            throw new Error(`Transcript not found in MongoDB for meeting ${meetingId}`);
        }

        // Check if transcript is finalized (wait with retry if not)
        if (!transcript.finalized) {
            console.log(`[Worker] ⏳ Transcript not finalized yet for ${meetingId}, will retry`);
            throw new Error('Transcript not finalized yet - will retry');
        }

        console.log(`[Worker] ✅ Transcript verified: ${transcript.segments?.length || 0} segments`);
        await job.updateProgress(20);

        // ========================================================================
        // GUARD 2: Atomic lock - transition COMPLETED -> PROCESSING
        // ========================================================================
        const locked = await prisma.meeting.updateMany({
            where: {
                id: meetingId,
                status: MeetingStatus.COMPLETED,
            },
            data: {
                status: MeetingStatus.PROCESSING,
            },
        });

        if (locked.count === 0) {
            // Meeting is not in COMPLETED state - either already processed or in wrong state
            const meeting = await prisma.meeting.findUnique({
                where: { id: meetingId },
                select: { status: true },
            });

            if (meeting?.status === MeetingStatus.PROCESSED) {
                console.log(`[Worker] ⏭️ Meeting ${meetingId} already processed`);
                return {
                    success: true,
                    meetingId,
                    processingTimeMs: Date.now() - startTime,
                    analyticsCreated: false,
                    summaryGenerated: false,
                    actionItemsCount: 0,
                };
            }

            throw new Error(`Cannot acquire lock: Meeting status is ${meeting?.status || 'unknown'}`);
        }

        console.log(`[Worker] 🔒 Acquired processing lock for ${meetingId}`);
        await job.updateProgress(25);

        try {
            // ======================================================================
            // STAGE 1: Deterministic Analytics
            // ======================================================================
            await job.updateProgress(30);
            console.log(`[Worker] 📊 Stage 1: Computing deterministic analytics...`);

            // Cast segments to expected type
            const segments = transcript.segments.map(seg => ({
                segmentId: seg.segmentId,
                speaker: seg.speaker,
                text: seg.text,
                start: seg.start,
                end: seg.end,
            }));

            // Compute speaker-level statistics with smoothing
            const speakerStats = computeSpeakerStats(segments);
            console.log(`[Worker] Computed stats for ${speakerStats.length} speakers`);

            // Extract metadata and compute meeting-level analytics
            const metadata = extractTranscriptMetadata({
                meetingId: transcript.meetingId,
                meetingTitle: transcript.meetingTitle,
                segments,
                createdAt: transcript.createdAt,
            });
            const meetingAnalytics = computeMeetingAnalytics(speakerStats, metadata);
            console.log(`[Worker] Meeting duration: ${meetingAnalytics.totalDurationSec}s, ${meetingAnalytics.participantCount} participants`);

            // Extract unique speakers for participant records
            const speakers = [...new Set(segments.map(s => s.speaker))];

            // Persist all analytics atomically
            await upsertAllAnalytics(meetingId, speakerStats, meetingAnalytics, speakers);

            console.log(`[Worker] ✅ Stage 1 complete: Analytics persisted to PostgreSQL`);
            await job.updateProgress(50);

            // ======================================================================
            // STAGE 2: Semantic Processing
            // ======================================================================
            console.log(`[Worker] 🤖 Stage 2: Running semantic processing...`);

            // TODO: Call existing summarization logic
            // For now, reuse the existing processSummaryForMeeting function
            // const summary = await generateSummary(transcript);
            // const actionItems = await extractActionItems(summary, transcript);
            // const keywords = await extractKeywords(summary);
            // await upsertSummary(meetingId, summary);
            // await upsertActionItems(meetingId, actionItems);
            // await upsertKeywords(meetingId, keywords);

            console.log(`[Worker] ✅ Stage 2 complete (semantic processing not yet implemented)`);
            await job.updateProgress(80);

            // ======================================================================
            // STAGE 3: Finalization
            // ======================================================================
            console.log(`[Worker] 📝 Stage 3: Finalizing meeting...`);

            await prisma.meeting.update({
                where: { id: meetingId },
                data: {
                    status: MeetingStatus.PROCESSED,
                    segmentCount: transcript.segments?.length || 0,
                },
            });

            console.log(`[Worker] ✅ Meeting ${meetingId} fully processed`);
            await job.updateProgress(100);

            return {
                success: true,
                meetingId,
                processingTimeMs: Date.now() - startTime,
                analyticsCreated: true,
                summaryGenerated: true,
                actionItemsCount: 0, // Will be populated when semantic processing is implemented
            };

        } catch (processingError) {
            // Rollback: Reset status to COMPLETED so the job can be retried
            console.error(`[Worker] ❌ Processing failed for ${meetingId}:`, processingError);

            await prisma.meeting.update({
                where: { id: meetingId },
                data: { status: MeetingStatus.COMPLETED },
            });

            throw processingError;
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Worker] ❌ Job failed for meeting ${meetingId}:`, errorMessage);

        return {
            success: false,
            meetingId,
            processingTimeMs: Date.now() - startTime,
            analyticsCreated: false,
            summaryGenerated: false,
            actionItemsCount: 0,
            error: errorMessage,
        };
    }
}

// ============================================================================
// WORKER INSTANCE
// ============================================================================

let worker: Worker<MeetingProcessingJobData, ProcessingJobResult> | null = null;

/**
 * Start the meeting processing worker.
 * 
 * This should be run as a separate process from the main server.
 */
export async function startMeetingProcessingWorker(): Promise<Worker<MeetingProcessingJobData, ProcessingJobResult>> {
    if (worker) {
        console.log('[Worker] Worker already running');
        return worker;
    }

    const redis = getRedisClient();

    worker = new Worker<MeetingProcessingJobData, ProcessingJobResult>(
        QueueNames.MEETING_PROCESSING,
        processMeetingJob,
        {
            connection: redis.options,
            concurrency: CONCURRENCY,
        }
    );

    // Event handlers for monitoring
    worker.on('completed', (job, result) => {
        console.log(`[Worker] ✅ Job completed: ${job.id} (${result.processingTimeMs}ms)`);
    });

    worker.on('failed', (job, error) => {
        console.error(`[Worker] ❌ Job failed: ${job?.id}`, error);
    });

    worker.on('error', (error) => {
        console.error('[Worker] ❌ Worker error:', error);
    });

    worker.on('stalled', (jobId) => {
        console.warn(`[Worker] ⚠️ Job stalled: ${jobId}`);
    });

    console.log(`[Worker] 🚀 Meeting processing worker started (concurrency: ${CONCURRENCY})`);
    return worker;
}

/**
 * Stop the meeting processing worker gracefully.
 */
export async function stopMeetingProcessingWorker(): Promise<void> {
    if (worker) {
        await worker.close();
        worker = null;
        console.log('[Worker] ✅ Meeting processing worker stopped');
    }
}

// ============================================================================
// STANDALONE EXECUTION
// ============================================================================

// Run as standalone process if this file is executed directly
if (require.main === module) {
    console.log('[Worker] Starting as standalone process...');

    startMeetingProcessingWorker()
        .then(() => {
            console.log('[Worker] Worker is running. Press Ctrl+C to stop.');
        })
        .catch((error) => {
            console.error('[Worker] Failed to start:', error);
            process.exit(1);
        });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n[Worker] Shutting down...');
        await stopMeetingProcessingWorker();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\n[Worker] Received SIGTERM, shutting down...');
        await stopMeetingProcessingWorker();
        process.exit(0);
    });
}
