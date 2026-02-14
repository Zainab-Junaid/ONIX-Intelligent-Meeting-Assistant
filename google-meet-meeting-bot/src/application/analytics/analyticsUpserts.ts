/**
 * PostgreSQL Upsert Functions for Analytics Data
 * 
 * This module provides idempotent upsert operations for analytics data.
 * Key features:
 * - All writes use upsert (insert or update) for idempotency
 * - Natural unique keys prevent duplicate data
 * - Safe to retry on failure without creating duplicates
 * 
 * Tables managed:
 * - SpeakerStats: per-speaker metrics per meeting
 * - MeetingAnalytics: aggregate meeting metrics
 */

import { prisma } from '../../lib/prisma';
import { DEFAULT_TENANT_ID } from '../../config/constants';
import { SpeakerStat } from './speakerAnalytics';
import { MeetingAnalyticsData } from './meetingAnalytics';

// ============================================================================
// SPEAKER STATS UPSERT
// ============================================================================

/**
 * Upsert speaker statistics to PostgreSQL.
 * 
 * Uses composite (meetingId + speakerLabel) as natural key.
 * Safe to call multiple times for the same meeting.
 * 
 * @param meetingId - PostgreSQL Meeting ID
 * @param speakerStats - Computed speaker statistics
 */
export async function upsertSpeakerStats(
    meetingId: string,
    speakerStats: SpeakerStat[]
): Promise<void> {
    if (!speakerStats || speakerStats.length === 0) {
        console.log(`[Upsert] No speaker stats to save for meeting ${meetingId}`);
        return;
    }

    // Get meeting to obtain tenantId
    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { tenantId: true },
    });

    if (!meeting?.tenantId) {
        throw new Error(`Meeting ${meetingId} not found for speaker stats upsert`);
    }
    const tenantId = meeting.tenantId;

    // Upsert each speaker's stats
    for (const stat of speakerStats) {
        await prisma.speakerStats.upsert({
            where: {
                // Schema uses: @@unique([meetingId, speakerLabel])
                meetingId_speakerLabel: {
                    meetingId,
                    speakerLabel: stat.speakerName, // Map speakerName -> speakerLabel
                },
            },
            create: {
                meetingId,
                tenantId,
                speakerLabel: stat.speakerName,
                speakingTimeSeconds: Math.round(stat.totalSpeakingTimeSec),
                wordCount: stat.wordCount,
                turnCount: stat.interventionCount,
                questionCount: stat.questionCount || 0,
                talkToListenRatio: stat.talkToListenRatio,
            },
            update: {
                speakingTimeSeconds: Math.round(stat.totalSpeakingTimeSec),
                wordCount: stat.wordCount,
                turnCount: stat.interventionCount,
                questionCount: stat.questionCount || 0,
                talkToListenRatio: stat.talkToListenRatio,
            },
        });
    }

    console.log(`[Upsert] Saved speaker stats for ${speakerStats.length} speakers in meeting ${meetingId}`);
}

// ============================================================================
// MEETING ANALYTICS UPSERT
// ============================================================================

/**
 * Upsert meeting analytics to PostgreSQL.
 * 
 * Uses meetingId as natural key (one analytics record per meeting).
 * Safe to call multiple times for the same meeting.
 * 
 * @param meetingId - PostgreSQL Meeting ID
 * @param analytics - Computed meeting analytics
 */
export async function upsertMeetingAnalytics(
    meetingId: string,
    analytics: MeetingAnalyticsData,
    topicsDiscussed?: string[]
): Promise<void> {
    // Get meeting to obtain tenantId
    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { tenantId: true },
    });

    if (!meeting?.tenantId) {
        throw new Error(`Meeting ${meetingId} not found for meeting analytics upsert`);
    }
    const tenantId = meeting.tenantId;

    await prisma.meetingAnalytics.upsert({
        where: { meetingId },
        create: {
            meetingId,
            tenantId,
            totalDurationSeconds: Math.round(analytics.totalDurationSec),
            totalSpeakers: analytics.participantCount,
            totalWords: analytics.totalWordCount,
            participationBalanceScore: analytics.balanceScore / 100, // Convert 0-100 to 0-1
            topicsDiscussed: topicsDiscussed || [],
        },
        update: {
            totalDurationSeconds: Math.round(analytics.totalDurationSec),
            totalSpeakers: analytics.participantCount,
            totalWords: analytics.totalWordCount,
            participationBalanceScore: analytics.balanceScore / 100,
            ...(topicsDiscussed ? { topicsDiscussed } : {}),
        },
    });

    console.log(`[Upsert] Saved meeting analytics for meeting ${meetingId}`);
}

// ============================================================================
// MEETING KEYWORDS UPSERT
// ============================================================================

/**
 * Upsert meeting keywords to PostgreSQL.
 * 
 * Uses composite (meetingId + keyword) as natural key.
 * Safe to call multiple times for the same meeting.
 */
export async function upsertMeetingKeywords(
    meetingId: string,
    keywords: { keyword: string; category: string; relevance: number }[]
): Promise<void> {
    if (!keywords || keywords.length === 0) {
        console.log(`[Upsert] No keywords to save for meeting ${meetingId}`);
        return;
    }

    // Get meeting to obtain tenantId
    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { tenantId: true },
    });

    if (!meeting?.tenantId) {
        throw new Error(`Meeting ${meetingId} not found for keywords upsert`);
    }
    const tenantId = meeting.tenantId;

    for (const kw of keywords) {
        await prisma.meetingKeyword.upsert({
            where: {
                meetingId_keyword: {
                    meetingId,
                    keyword: kw.keyword,
                },
            },
            create: {
                meetingId,
                tenantId,
                keyword: kw.keyword,
                category: kw.category || 'topic',
                relevanceScore: kw.relevance || 0.5,
            },
            update: {
                category: kw.category || 'topic',
                relevanceScore: kw.relevance || 0.5,
            },
        });
    }

    console.log(`[Upsert] Saved ${keywords.length} keywords for meeting ${meetingId}`);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Execute all deterministic analytics upserts in a single transaction.
 * 
 * This ensures atomicity: either all analytics are saved or none.
 * 
 * @param meetingId - PostgreSQL Meeting ID
 * @param speakerStats - Computed speaker statistics
 * @param meetingAnalytics - Computed meeting analytics
 * @param speakers - List of speaker names (unused, kept for API compatibility)
 */
export async function upsertAllAnalytics(
    meetingId: string,
    speakerStats: SpeakerStat[],
    meetingAnalytics: MeetingAnalyticsData,
    speakers: string[]
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        // Get tenantId once
        const meeting = await tx.meeting.findUnique({
            where: { id: meetingId },
            select: { tenantId: true },
        });
        if (!meeting?.tenantId) {
            throw new Error(`Meeting ${meetingId} not found for analytics upsert`);
        }
        const tenantId = meeting.tenantId;

        // 1. Upsert speaker stats
        for (const stat of speakerStats) {
            await tx.speakerStats.upsert({
                where: {
                    meetingId_speakerLabel: {
                        meetingId,
                        speakerLabel: stat.speakerName,
                    },
                },
                create: {
                    meetingId,
                    tenantId,
                    speakerLabel: stat.speakerName,
                    speakingTimeSeconds: Math.round(stat.totalSpeakingTimeSec),
                    wordCount: stat.wordCount,
                    turnCount: stat.interventionCount,
                    questionCount: stat.questionCount || 0,
                    talkToListenRatio: stat.talkToListenRatio,
                },
                update: {
                    speakingTimeSeconds: Math.round(stat.totalSpeakingTimeSec),
                    wordCount: stat.wordCount,
                    turnCount: stat.interventionCount,
                    questionCount: stat.questionCount || 0,
                    talkToListenRatio: stat.talkToListenRatio,
                },
            });
        }

        // 2. Upsert meeting analytics
        await tx.meetingAnalytics.upsert({
            where: { meetingId },
            create: {
                meetingId,
                tenantId,
                totalDurationSeconds: Math.round(meetingAnalytics.totalDurationSec),
                totalSpeakers: meetingAnalytics.participantCount,
                totalWords: meetingAnalytics.totalWordCount,
                participationBalanceScore: meetingAnalytics.balanceScore / 100,
            },
            update: {
                totalDurationSeconds: Math.round(meetingAnalytics.totalDurationSec),
                totalSpeakers: meetingAnalytics.participantCount,
                totalWords: meetingAnalytics.totalWordCount,
                participationBalanceScore: meetingAnalytics.balanceScore / 100,
            },
        });
    });

    console.log(`[Upsert] All analytics saved atomically for meeting ${meetingId}`);
}
