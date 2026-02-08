/**
 * BullMQ Queue Infrastructure for Post-Meeting Processing
 * 
 * This module provides a reliable, queue-based system for processing meetings
 * after they complete. Key features:
 * - Automatic retries with exponential backoff
 * - Job deduplication
 * - Horizontal scaling support
 * - Job status visibility
 * 
 * Architecture:
 * - Uses Redis (same instance as caption buffer)
 * - Jobs are processed by a separate worker process
 * - Supports multiple concurrent workers
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisClient } from '../../config/redis';
import { QueueNames, JobRetryConfig } from '../../config/constants';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface MeetingProcessingJobData {
    meetingId: string;
    timestamp: number;
    priority?: 'high' | 'normal' | 'low';
}

export interface ProcessingJobResult {
    success: boolean;
    meetingId: string;
    processingTimeMs: number;
    analyticsCreated: boolean;
    summaryGenerated: boolean;
    actionItemsCount: number;
    error?: string;
}

// ============================================================================
// QUEUE SETUP
// ============================================================================

/**
 * Meeting processing queue instance.
 * All post-meeting processing jobs are added to this queue.
 */
let meetingQueue: Queue<MeetingProcessingJobData, ProcessingJobResult> | null = null;

/**
 * Get or create the meeting processing queue.
 * Lazy initialization to avoid connection issues at module load.
 */
export function getMeetingProcessingQueue(): Queue<MeetingProcessingJobData, ProcessingJobResult> {
    if (!meetingQueue) {
        const redis = getRedisClient();

        meetingQueue = new Queue<MeetingProcessingJobData, ProcessingJobResult>(
            QueueNames.MEETING_PROCESSING,
            {
                connection: redis.options,
                defaultJobOptions: {
                    attempts: JobRetryConfig.MAX_ATTEMPTS,
                    backoff: {
                        type: JobRetryConfig.BACKOFF_TYPE,
                        delay: JobRetryConfig.BACKOFF_DELAY_MS,
                    },
                    removeOnComplete: {
                        count: JobRetryConfig.REMOVE_ON_COMPLETE,
                    },
                    removeOnFail: {
                        count: JobRetryConfig.REMOVE_ON_FAIL,
                    },
                },
            }
        );

        console.log(`[Queue] ✅ Meeting processing queue initialized: ${QueueNames.MEETING_PROCESSING}`);
    }

    return meetingQueue;
}

// ============================================================================
// JOB MANAGEMENT
// ============================================================================

/**
 * Enqueue a meeting for post-processing.
 * 
 * This should be called when:
 * 1. Bot signals meeting completion (/bot-done)
 * 2. Manual reprocessing is requested
 * 
 * Job deduplication: If a job with the same meetingId already exists
 * and is not completed, this will skip adding a duplicate.
 * 
 * @param meetingId - PostgreSQL Meeting ID
 * @param priority - Job priority (affects queue position)
 * @returns Job instance or null if duplicate
 */
export async function enqueueMeetingProcessing(
    meetingId: string,
    priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<Job<MeetingProcessingJobData, ProcessingJobResult> | null> {
    const queue = getMeetingProcessingQueue();

    // Generate a unique job ID based on meetingId to prevent duplicates
    const jobId = `meeting-${meetingId}`;

    // Check if job already exists and is active
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
        const state = await existingJob.getState();
        if (state !== 'completed' && state !== 'failed') {
            console.log(`[Queue] ⏭️ Job already exists for meeting ${meetingId} (state: ${state})`);
            return null;
        }
    }

    // Priority mapping for BullMQ (lower number = higher priority)
    const priorityMap = { high: 1, normal: 2, low: 3 };

    const job = await queue.add(
        'process-completed-meeting',
        {
            meetingId,
            timestamp: Date.now(),
            priority,
        },
        {
            jobId,
            priority: priorityMap[priority],
        }
    );

    console.log(`[Queue] ✅ Enqueued meeting processing job: ${meetingId} (jobId: ${job.id})`);
    return job;
}

/**
 * Get the status of a meeting processing job.
 * 
 * @param meetingId - PostgreSQL Meeting ID
 * @returns Job state and details
 */
export async function getMeetingJobStatus(meetingId: string): Promise<{
    exists: boolean;
    state?: string;
    progress?: number;
    attemptsMade?: number;
    failedReason?: string;
    finishedOn?: Date;
}> {
    const queue = getMeetingProcessingQueue();
    const jobId = `meeting-${meetingId}`;
    const job = await queue.getJob(jobId);

    if (!job) {
        return { exists: false };
    }

    const state = await job.getState();
    return {
        exists: true,
        state,
        progress: job.progress as number,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        finishedOn: job.finishedOn ? new Date(job.finishedOn) : undefined,
    };
}

/**
 * Retry a failed meeting processing job.
 * 
 * @param meetingId - PostgreSQL Meeting ID
 * @returns true if job was retried, false if not found or not failed
 */
export async function retryMeetingJob(meetingId: string): Promise<boolean> {
    const queue = getMeetingProcessingQueue();
    const jobId = `meeting-${meetingId}`;
    const job = await queue.getJob(jobId);

    if (!job) {
        console.log(`[Queue] ❌ Job not found for meeting ${meetingId}`);
        return false;
    }

    const state = await job.getState();
    if (state !== 'failed') {
        console.log(`[Queue] ⚠️ Job for meeting ${meetingId} is not in failed state (state: ${state})`);
        return false;
    }

    await job.retry();
    console.log(`[Queue] 🔄 Retrying job for meeting ${meetingId}`);
    return true;
}

// ============================================================================
// QUEUE STATISTICS
// ============================================================================

/**
 * Get queue statistics for monitoring/debugging.
 */
export async function getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}> {
    const queue = getMeetingProcessingQueue();
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

    return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
    };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Gracefully close the queue connection.
 * Call this during application shutdown.
 */
export async function closeQueue(): Promise<void> {
    if (meetingQueue) {
        await meetingQueue.close();
        meetingQueue = null;
        console.log('[Queue] ✅ Meeting processing queue closed');
    }
}
