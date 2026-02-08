/**
 * Speaker Analytics Engine
 * 
 * This module computes speaker-level statistics from transcript segments.
 * Key features:
 * - Segment smoothing: ignores short segments (<300ms) and merges consecutive turns
 * - Per-speaker metrics: word count, speaking time, intervention count
 * - Time-based calculations from segment start/end times
 * 
 * Architecture:
 * - Input: Raw transcript segments from MongoDB
 * - Output: SpeakerStats array for PostgreSQL persistence
 * - Designed to be idempotent (can re-run without side effects)
 */

import { MIN_SEGMENT_DURATION_SEC, MERGE_GAP_SEC } from '../../config/constants';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TranscriptSegment {
    segmentId?: string;
    speaker: string;
    text: string;
    start: number; // seconds from meeting start
    end: number;   // seconds from meeting start
}

export interface SpeakerStat {
    speakerName: string;
    totalSpeakingTimeSec: number;
    wordCount: number;
    interventionCount: number; // Number of distinct speaking turns
    longestTurnSec: number;    // Longest continuous speaking duration
    avgWordsPerMinute: number; // Speaking pace
    percentageOfMeeting: number; // 0-100 percentage
}

export interface SmoothedSegment {
    speaker: string;
    start: number;
    end: number;
    wordCount: number;
    originalSegmentIds: string[];
}

// ============================================================================
// SMOOTHING ALGORITHM
// ============================================================================

/**
 * Apply smoothing to transcript segments.
 * 
 * Smoothing rules:
 * 1. Filter out segments shorter than MIN_SEGMENT_DURATION_SEC (caption jitter)
 * 2. Merge consecutive segments from the same speaker within MERGE_GAP_SEC
 * 3. Accumulate word counts from merged segments
 * 
 * @param segments - Raw transcript segments
 * @returns Smoothed segments with merged turns
 */
export function smoothSegments(segments: TranscriptSegment[]): SmoothedSegment[] {
    if (!segments || segments.length === 0) {
        return [];
    }

    // Sort by start time
    const sorted = [...segments].sort((a, b) => a.start - b.start);

    // Step 1: Filter segments shorter than threshold
    const filtered = sorted.filter(seg => {
        const duration = seg.end - seg.start;
        const isLongEnough = duration >= MIN_SEGMENT_DURATION_SEC;
        if (!isLongEnough) {
            console.log(`[Analytics] Filtering short segment: ${duration.toFixed(3)}s < ${MIN_SEGMENT_DURATION_SEC}s`);
        }
        return isLongEnough;
    });

    if (filtered.length === 0) {
        return [];
    }

    // Step 2: Merge consecutive segments from same speaker
    const smoothed: SmoothedSegment[] = [];
    let current: SmoothedSegment = {
        speaker: filtered[0].speaker,
        start: filtered[0].start,
        end: filtered[0].end,
        wordCount: countWords(filtered[0].text),
        originalSegmentIds: filtered[0].segmentId ? [filtered[0].segmentId] : [],
    };

    for (let i = 1; i < filtered.length; i++) {
        const seg = filtered[i];
        const gap = seg.start - current.end;

        // Merge if same speaker and gap is within threshold
        if (seg.speaker === current.speaker && gap <= MERGE_GAP_SEC) {
            // Extend current segment
            current.end = seg.end;
            current.wordCount += countWords(seg.text);
            if (seg.segmentId) {
                current.originalSegmentIds.push(seg.segmentId);
            }
        } else {
            // Save current and start new
            smoothed.push(current);
            current = {
                speaker: seg.speaker,
                start: seg.start,
                end: seg.end,
                wordCount: countWords(seg.text),
                originalSegmentIds: seg.segmentId ? [seg.segmentId] : [],
            };
        }
    }

    // Don't forget the last segment
    smoothed.push(current);

    console.log(`[Analytics] Smoothed ${segments.length} segments -> ${smoothed.length} turns`);
    return smoothed;
}

// ============================================================================
// SPEAKER STATS COMPUTATION
// ============================================================================

/**
 * Compute speaker statistics from transcript segments.
 * 
 * This function applies smoothing before calculating stats, ensuring
 * that caption jitter doesn't inflate intervention counts or fragment
 * speaking time measurements.
 * 
 * @param segments - Raw transcript segments from MongoDB
 * @returns Array of per-speaker statistics
 */
export function computeSpeakerStats(segments: TranscriptSegment[]): SpeakerStat[] {
    if (!segments || segments.length === 0) {
        console.log('[Analytics] No segments to analyze');
        return [];
    }

    // Apply smoothing
    const smoothed = smoothSegments(segments);

    if (smoothed.length === 0) {
        console.log('[Analytics] All segments filtered during smoothing');
        return [];
    }

    // Calculate total meeting duration from first to last segment
    const meetingStartSec = Math.min(...smoothed.map(s => s.start));
    const meetingEndSec = Math.max(...smoothed.map(s => s.end));
    const totalMeetingDurationSec = meetingEndSec - meetingStartSec;

    // Group by speaker
    const bySpeaker = new Map<string, SmoothedSegment[]>();
    for (const seg of smoothed) {
        const speakerTurns = bySpeaker.get(seg.speaker) || [];
        speakerTurns.push(seg);
        bySpeaker.set(seg.speaker, speakerTurns);
    }

    // Calculate stats for each speaker
    const stats: SpeakerStat[] = [];

    for (const [speakerName, turns] of bySpeaker) {
        let totalSpeakingTimeSec = 0;
        let wordCount = 0;
        let longestTurnSec = 0;

        for (const turn of turns) {
            const duration = turn.end - turn.start;
            totalSpeakingTimeSec += duration;
            wordCount += turn.wordCount;

            if (duration > longestTurnSec) {
                longestTurnSec = duration;
            }
        }

        // Calculate derived metrics
        const avgWordsPerMinute = totalSpeakingTimeSec > 0
            ? (wordCount / totalSpeakingTimeSec) * 60
            : 0;

        const percentageOfMeeting = totalMeetingDurationSec > 0
            ? (totalSpeakingTimeSec / totalMeetingDurationSec) * 100
            : 0;

        stats.push({
            speakerName,
            totalSpeakingTimeSec: Math.round(totalSpeakingTimeSec * 100) / 100, // 2 decimal places
            wordCount,
            interventionCount: turns.length,
            longestTurnSec: Math.round(longestTurnSec * 100) / 100,
            avgWordsPerMinute: Math.round(avgWordsPerMinute),
            percentageOfMeeting: Math.round(percentageOfMeeting * 10) / 10, // 1 decimal place
        });
    }

    // Sort by speaking time (highest first)
    stats.sort((a, b) => b.totalSpeakingTimeSec - a.totalSpeakingTimeSec);

    console.log(`[Analytics] Computed stats for ${stats.length} speakers`);
    return stats;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Count words in a text string.
 * Uses a simple whitespace split with empty filtering.
 */
function countWords(text: string): number {
    if (!text) return 0;
    return text.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Normalize speaker name for consistent aggregation.
 * Handles common variations like trailing whitespace, mixed case.
 */
export function normalizeSpeakerName(name: string): string {
    if (!name) return 'Unknown';
    return name.trim().toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
