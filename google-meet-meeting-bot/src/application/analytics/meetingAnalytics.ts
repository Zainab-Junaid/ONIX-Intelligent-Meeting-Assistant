/**
 * Meeting Analytics Engine
 * 
 * This module computes meeting-level aggregate metrics from speaker stats
 * and transcript data. Designed for PostgreSQL persistence.
 * 
 * Architecture:
 * - Input: SpeakerStats + raw transcript metadata
 * - Output: MeetingAnalytics record for PostgreSQL
 * - Derived from deterministic calculations (no AI required)
 */

import { SpeakerStat } from './speakerAnalytics';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TranscriptMetadata {
    meetingId: string;
    meetingTitle?: string;
    segmentCount: number;
    createdAt: Date;
    meetingStartSec?: number;  // First segment start time
    meetingEndSec?: number;    // Last segment end time
}

export interface MeetingAnalyticsData {
    totalDurationSec: number;
    totalSpeechSec: number;       // Sum of all speaker speaking times
    silenceSec: number;           // Gaps between speaking turns
    silencePercentage: number;    // 0-100
    participantCount: number;
    segmentCount: number;
    totalWordCount: number;
    avgWordsPerMinute: number;
    dominantSpeaker?: string;     // Speaker with highest speaking time
    dominantSpeakerPercentage?: number; // Their percentage
    balanceScore: number;         // 0-100, 100 = perfectly equal participation
    engagementScore: number;      // Derived metric combining multiple factors
}

// ============================================================================
// ANALYTICS COMPUTATION
// ============================================================================

/**
 * Compute meeting-level analytics from speaker stats.
 * 
 * This produces aggregate metrics for the entire meeting, suitable for
 * dashboard display and trend analysis.
 * 
 * @param speakerStats - Pre-computed speaker statistics
 * @param metadata - Basic transcript information
 * @returns Meeting analytics data for PostgreSQL
 */
export function computeMeetingAnalytics(
    speakerStats: SpeakerStat[],
    metadata: TranscriptMetadata
): MeetingAnalyticsData {
    // Handle edge cases
    if (!speakerStats || speakerStats.length === 0) {
        console.log('[Analytics] No speaker stats available for meeting analytics');
        return createEmptyAnalytics(metadata);
    }

    // Calculate totals from speaker stats
    const totalSpeechSec = speakerStats.reduce(
        (sum, s) => sum + s.totalSpeakingTimeSec,
        0
    );

    const totalWordCount = speakerStats.reduce(
        (sum, s) => sum + s.wordCount,
        0
    );

    // Calculate meeting duration from metadata or speaker stats
    let totalDurationSec = 0;
    if (metadata.meetingStartSec !== undefined && metadata.meetingEndSec !== undefined) {
        totalDurationSec = metadata.meetingEndSec - metadata.meetingStartSec;
    } else {
        // Fallback: use sum of speaking times as lower bound estimate
        totalDurationSec = totalSpeechSec;
    }

    // Silence calculation
    const silenceSec = Math.max(0, totalDurationSec - totalSpeechSec);
    const silencePercentage = totalDurationSec > 0
        ? (silenceSec / totalDurationSec) * 100
        : 0;

    // Find dominant speaker
    const sortedBySpeaking = [...speakerStats].sort(
        (a, b) => b.totalSpeakingTimeSec - a.totalSpeakingTimeSec
    );
    const dominantSpeaker = sortedBySpeaking[0];

    // Calculate average words per minute (meeting-wide)
    const avgWordsPerMinute = totalSpeechSec > 0
        ? (totalWordCount / totalSpeechSec) * 60
        : 0;

    // Calculate balance score (how evenly distributed is speaking time)
    const balanceScore = calculateBalanceScore(speakerStats);

    // Calculate engagement score (composite metric)
    const engagementScore = calculateEngagementScore({
        participantCount: speakerStats.length,
        interventionCount: speakerStats.reduce((sum, s) => sum + s.interventionCount, 0),
        silencePercentage,
        balanceScore,
    });

    const analytics: MeetingAnalyticsData = {
        totalDurationSec: Math.round(totalDurationSec * 100) / 100,
        totalSpeechSec: Math.round(totalSpeechSec * 100) / 100,
        silenceSec: Math.round(silenceSec * 100) / 100,
        silencePercentage: Math.round(silencePercentage * 10) / 10,
        participantCount: speakerStats.length,
        segmentCount: metadata.segmentCount,
        totalWordCount,
        avgWordsPerMinute: Math.round(avgWordsPerMinute),
        dominantSpeaker: dominantSpeaker?.speakerName,
        dominantSpeakerPercentage: dominantSpeaker
            ? Math.round(dominantSpeaker.percentageOfMeeting * 10) / 10
            : undefined,
        balanceScore: Math.round(balanceScore),
        engagementScore: Math.round(engagementScore),
    };

    console.log(`[Analytics] Meeting analytics computed: ${analytics.participantCount} participants, ${analytics.totalDurationSec}s duration`);
    return analytics;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create empty analytics object for meetings with no data.
 */
function createEmptyAnalytics(metadata: TranscriptMetadata): MeetingAnalyticsData {
    return {
        totalDurationSec: 0,
        totalSpeechSec: 0,
        silenceSec: 0,
        silencePercentage: 0,
        participantCount: 0,
        segmentCount: metadata.segmentCount,
        totalWordCount: 0,
        avgWordsPerMinute: 0,
        balanceScore: 0,
        engagementScore: 0,
    };
}

/**
 * Calculate a balance score representing how evenly distributed speaking time is.
 * 
 * 100 = Perfectly equal (each speaker has identical time)
 * 0 = Completely unbalanced (one speaker dominates entirely)
 * 
 * Uses a normalized entropy calculation:
 * - Compute percentage per speaker
 * - Compare to ideal equal distribution
 * - Higher entropy = more balanced
 */
function calculateBalanceScore(speakerStats: SpeakerStat[]): number {
    if (speakerStats.length <= 1) {
        return 100; // Single speaker is "balanced" by definition
    }

    const totalTime = speakerStats.reduce((sum, s) => sum + s.totalSpeakingTimeSec, 0);
    if (totalTime === 0) return 0;

    // Calculate actual distribution
    const percentages = speakerStats.map(s => s.totalSpeakingTimeSec / totalTime);

    // Calculate entropy (measure of uniformity)
    let entropy = 0;
    for (const p of percentages) {
        if (p > 0) {
            entropy -= p * Math.log2(p);
        }
    }

    // Maximum possible entropy is log2(n) for n speakers
    const maxEntropy = Math.log2(speakerStats.length);

    // Normalize to 0-100 scale
    const normalizedEntropy = maxEntropy > 0 ? (entropy / maxEntropy) * 100 : 0;

    return normalizedEntropy;
}

/**
 * Calculate an engagement score based on multiple meeting health indicators.
 * 
 * Factors considered:
 * - Number of participants (more = higher engagement potential)
 * - Number of speaking turns (more back-and-forth = higher engagement)
 * - Silence percentage (less silence = more active)
 * - Balance score (more balanced = more collaborative)
 * 
 * Returns 0-100 score.
 */
function calculateEngagementScore(params: {
    participantCount: number;
    interventionCount: number;
    silencePercentage: number;
    balanceScore: number;
}): number {
    const { participantCount, interventionCount, silencePercentage, balanceScore } = params;

    // Participant factor: 1-10 participants contribute, more doesn't help
    const participantFactor = Math.min(participantCount / 5, 1) * 20; // max 20 points

    // Intervention factor: more turns indicate active discussion
    // Normalize to ~10 turns per participant being ideal
    const turnsPerParticipant = participantCount > 0 ? interventionCount / participantCount : 0;
    const interventionFactor = Math.min(turnsPerParticipant / 10, 1) * 30; // max 30 points

    // Activity factor: less silence is better
    const activityFactor = Math.max(0, (100 - silencePercentage) / 100) * 25; // max 25 points

    // Balance factor: more balanced is better
    const balanceFactor = (balanceScore / 100) * 25; // max 25 points

    const total = participantFactor + interventionFactor + activityFactor + balanceFactor;

    return Math.min(100, Math.max(0, total));
}

/**
 * Extract metadata from a MongoDB transcript for analytics processing.
 */
export function extractTranscriptMetadata(transcript: {
    meetingId: string;
    meetingTitle?: string;
    segments: Array<{ start: number; end: number }>;
    createdAt: Date;
}): TranscriptMetadata {
    const segmentCount = transcript.segments?.length || 0;

    let meetingStartSec: number | undefined;
    let meetingEndSec: number | undefined;

    if (segmentCount > 0) {
        meetingStartSec = Math.min(...transcript.segments.map(s => s.start));
        meetingEndSec = Math.max(...transcript.segments.map(s => s.end));
    }

    return {
        meetingId: transcript.meetingId,
        meetingTitle: transcript.meetingTitle,
        segmentCount,
        createdAt: transcript.createdAt,
        meetingStartSec,
        meetingEndSec,
    };
}
