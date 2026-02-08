/**
 * Application-wide constants for the meeting bot system.
 * 
 * This file contains:
 * - Default tenant configuration (for single-tenant mode)
 * - Meeting status state machine values
 * - Configuration constants for analytics
 */

// ============================================================================
// DEFAULT TENANT CONFIGURATION
// ============================================================================

/**
 * Default tenant ID for single-tenant mode.
 * This UUID is used when multi-tenancy is not yet implemented.
 * 
 * IMPORTANT: This tenant must exist in the database before using.
 * Run the seed script to create it: `npx prisma db seed`
 */
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_TENANT_NAME = 'Default Organization';

// ============================================================================
// MEETING STATUS STATE MACHINE
// ============================================================================

/**
 * Meeting lifecycle status values.
 * 
 * State transitions:
 *   CREATED → BOT_LAUNCHED → LIVE → COMPLETED → PROCESSING → PROCESSED
 * 
 * Each status represents a specific point in the meeting lifecycle:
 * - CREATED: Meeting record created when user submits link
 * - BOT_LAUNCHED: Bot container started, attempting to join
 * - LIVE: Bot joined and captions are being captured
 * - COMPLETED: Meeting ended, transcript finalized in MongoDB
 * - PROCESSING: Post-meeting analytics in progress
 * - PROCESSED: All analytics and summaries complete
 * - FAILED: Terminal error state (bot crash, processing failure)
 * - CANCELLED: User cancelled before completion
 */
export const MeetingStatus = {
    CREATED: 'created',
    BOT_LAUNCHED: 'bot_launched',
    LIVE: 'live',
    COMPLETED: 'completed',
    PROCESSING: 'processing',
    PROCESSED: 'processed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
} as const;

export type MeetingStatusType = typeof MeetingStatus[keyof typeof MeetingStatus];

// ============================================================================
// MEETING JOB STATUS
// ============================================================================

/**
 * MeetingJob status values (for orchestration tracking).
 * MeetingJob is purely for infrastructure - no business data.
 */
export const MeetingJobStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    TRANSCRIPT_SAVED: 'transcript_saved',
    SUMMARIZING: 'summarizing',
    SUMMARIZED: 'summarized',
    FAILED: 'failed',
} as const;

export type MeetingJobStatusType = typeof MeetingJobStatus[keyof typeof MeetingJobStatus];

// ============================================================================
// ANALYTICS CONFIGURATION
// ============================================================================

/**
 * Minimum segment duration (in seconds) to include in speaker stats.
 * Segments shorter than this are likely caption jitter and are filtered out.
 */
export const MIN_SEGMENT_DURATION_SEC = 0.3;

/**
 * Maximum gap (in seconds) between consecutive segments by the same speaker
 * to be merged into a single speaking turn.
 */
export const MERGE_GAP_SEC = 1.0;

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

/**
 * BullMQ queue names for post-meeting processing.
 */
export const QueueNames = {
    MEETING_PROCESSING: 'meeting-processing',
    EMAIL_NOTIFICATIONS: 'email-notifications',
} as const;

/**
 * Job retry configuration for post-meeting processing.
 */
export const JobRetryConfig = {
    MAX_ATTEMPTS: 3,
    BACKOFF_TYPE: 'exponential' as const,
    BACKOFF_DELAY_MS: 5000,
    REMOVE_ON_COMPLETE: 100, // Keep last 100 completed jobs
    REMOVE_ON_FAIL: 500,     // Keep last 500 failed jobs for debugging
};

// ============================================================================
// SUPPORTED PLATFORMS
// ============================================================================

export const MeetingPlatform = {
    GOOGLE_MEET: 'google_meet',
    ZOOM: 'zoom',
    TEAMS: 'teams',
} as const;

export type MeetingPlatformType = typeof MeetingPlatform[keyof typeof MeetingPlatform];
