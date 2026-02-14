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
    upsertMeetingKeywords,
    upsertMeetingAnalytics,
} from '../../application/analytics';
import { summarizeTranscript } from '../../summarize';
import { saveSummary, saveActionItems } from '../../storage';

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
export async function processMeetingJob(
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

        const waitStart = Date.now();
        let transcript = await getTranscriptFromMongo(meetingId);

        while (!transcript || !transcript.finalized) {
            const elapsed = Date.now() - waitStart;
            if (elapsed >= MAX_LOCK_WAIT_MS) {
                throw new Error('Transcript not finalized yet - will retry');
            }

            if (!transcript) {
                console.log(`[Worker] ⏳ Transcript not found yet for ${meetingId}, waiting...`);
            } else {
                console.log(`[Worker] ⏳ Transcript not finalized yet for ${meetingId}, waiting...`);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
            transcript = await getTranscriptFromMongo(meetingId);
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
            let summaryGenerated = false;
            let actionItemsCount = 0;

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
            const participantCount = await prisma.meetingParticipant.count({
                where: { meetingId },
            });
            const meetingAnalytics = computeMeetingAnalytics(speakerStats, metadata, {
                participantCountOverride: participantCount > 0 ? participantCount : undefined,
            });
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

            try {
                const summarySegments = segments.map((seg, index) => ({
                    ...seg,
                    segmentId: seg.segmentId || `${meetingId}-${index}`,
                }));

                const summaryTranscript = trimTranscriptForSummary({
                    meetingId,
                    meetingTitle: transcript.meetingTitle,
                    userId: transcript.userId,
                    createdAt: transcript.createdAt,
                    segments: summarySegments,
                }, 16000);

                const summaryResult = await summarizeTranscript(summaryTranscript);

                const savedSummary = await saveSummary(summaryResult.summary);
                if (summaryResult.actionItems?.length) {
                    await saveActionItems(summaryResult.actionItems);
                }

                // Persist key topics and keywords from AI extraction
                if (summaryResult.keyTopics) {
                    const { topics, keywords } = summaryResult.keyTopics;

                    // Update topicsDiscussed in MeetingAnalytics
                    if (topics && topics.length > 0) {
                        try {
                            await upsertMeetingAnalytics(meetingId, meetingAnalytics, topics);
                            console.log(`[Worker] ✅ Topics persisted: ${topics.join(', ')}`);
                        } catch (topicErr) {
                            console.warn(`[Worker] ⚠️ Failed to persist topics:`, topicErr);
                        }
                    }

                    // Persist keywords to MeetingKeyword table
                    if (keywords && keywords.length > 0) {
                        try {
                            await upsertMeetingKeywords(meetingId, keywords);
                            console.log(`[Worker] ✅ Keywords persisted: ${keywords.length} entries`);
                        } catch (kwErr) {
                            console.warn(`[Worker] ⚠️ Failed to persist keywords:`, kwErr);
                        }
                    }
                }

                console.log(`[Worker] ✅ Summary saved: ${savedSummary ? 'yes' : 'no (skipped)'}`);
                actionItemsCount = summaryResult.actionItems?.length || 0;
                summaryGenerated = !!savedSummary;
                console.log(`[Worker] ✅ Action items saved: ${actionItemsCount}`);
            } catch (summaryError) {
                console.warn(`[Worker] ⚠️ Summary/action item generation failed for ${meetingId}:`, summaryError);
            }

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
                summaryGenerated,
                actionItemsCount,
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

        // CRITICAL: Re-throw so BullMQ marks the job as FAILED and retries it
        // Returning { success: false } would mark it as COMPLETED (no retry).
        throw error;
    }
}

function trimTranscriptForSummary<T extends { segments: Array<{ text?: string }> }>(
    transcript: T,
    maxChars: number
): T {
    // Balanced trimming: keep beginning (context/agenda) + end (conclusions/action items)
    const beginBudget = Math.floor(maxChars * 0.25); // 25% from the start
    const endBudget = maxChars - beginBudget;          // 75% from the end

    // Collect segments from the beginning
    let beginTotal = 0;
    const beginSegments: any[] = [];
    for (let i = 0; i < transcript.segments.length; i++) {
        const s = transcript.segments[i];
        const len = (s?.text || "").length;
        if (beginTotal + len > beginBudget) break;
        beginSegments.push(s);
        beginTotal += len;
    }

    // Collect segments from the end (reverse walk)
    let endTotal = 0;
    const endSegments: any[] = [];
    for (let i = transcript.segments.length - 1; i >= 0; i--) {
        const s = transcript.segments[i];
        // Skip if already in beginSegments
        if (i < beginSegments.length) break;
        const len = (s?.text || "").length;
        if (endTotal + len > endBudget) break;
        endSegments.push(s);
        endTotal += len;
    }
    endSegments.reverse();

    const combined = [...beginSegments, ...endSegments];
    return { ...transcript, segments: combined } as T;
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
