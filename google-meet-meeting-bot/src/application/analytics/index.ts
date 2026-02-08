/**
 * Analytics Module Index
 * 
 * Re-exports all analytics functions for convenient imports.
 */

// Speaker Analytics
export {
    computeSpeakerStats,
    smoothSegments,
    normalizeSpeakerName,
    type TranscriptSegment,
    type SpeakerStat,
    type SmoothedSegment,
} from './speakerAnalytics';

// Meeting Analytics
export {
    computeMeetingAnalytics,
    extractTranscriptMetadata,
    type TranscriptMetadata,
    type MeetingAnalyticsData,
} from './meetingAnalytics';

// PostgreSQL Upserts
export {
    upsertSpeakerStats,
    upsertMeetingAnalytics,
    upsertAllAnalytics,
} from './analyticsUpserts';
