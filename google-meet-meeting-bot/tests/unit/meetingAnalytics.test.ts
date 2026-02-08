/**
 * Unit Tests: Meeting Analytics
 * 
 * Run: npx tsx tests/unit/meetingAnalytics.test.ts
 * 
 * Tests for computeMeetingAnalytics() and extractTranscriptMetadata()
 * These are PURE FUNCTIONS - no DB, no network
 */

import { computeMeetingAnalytics, extractTranscriptMetadata, MeetingAnalyticsData, TranscriptMetadata } from '../../src/application/analytics/meetingAnalytics';
import { SpeakerStat } from '../../src/application/analytics/speakerAnalytics';

// Test utilities
let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
        console.log(`  ✅ ${testName}`);
        passed++;
    } else {
        console.log(`  ❌ ${testName}${detail ? `: ${detail}` : ''}`);
        failed++;
    }
}

function assertEqual<T>(actual: T, expected: T, testName: string) {
    const match = JSON.stringify(actual) === JSON.stringify(expected);
    if (match) {
        console.log(`  ✅ ${testName}`);
        passed++;
    } else {
        console.log(`  ❌ ${testName}`);
        console.log(`     Expected: ${JSON.stringify(expected)}`);
        console.log(`     Actual:   ${JSON.stringify(actual)}`);
        failed++;
    }
}

function assertApprox(actual: number, expected: number, testName: string, tolerance = 5) {
    const match = Math.abs(actual - expected) <= tolerance;
    if (match) {
        console.log(`  ✅ ${testName}`);
        passed++;
    } else {
        console.log(`  ❌ ${testName}`);
        console.log(`     Expected: ${expected} ± ${tolerance}`);
        console.log(`     Actual:   ${actual}`);
        failed++;
    }
}

function assertInRange(actual: number, min: number, max: number, testName: string) {
    const inRange = actual >= min && actual <= max;
    if (inRange) {
        console.log(`  ✅ ${testName}`);
        passed++;
    } else {
        console.log(`  ❌ ${testName}`);
        console.log(`     Expected: ${min} - ${max}`);
        console.log(`     Actual:   ${actual}`);
        failed++;
    }
}

// ============================================================================
// TEST DATA FIXTURES
// ============================================================================

function makeSpeakerStat(
    name: string,
    speakingTime: number,
    wordCount: number,
    interventions: number
): SpeakerStat {
    const totalMeetingTime = 100; // Placeholder
    return {
        speakerName: name,
        totalSpeakingTimeSec: speakingTime,
        wordCount,
        interventionCount: interventions,
        longestTurnSec: speakingTime / interventions,
        avgWordsPerMinute: (wordCount / speakingTime) * 60,
        percentageOfMeeting: (speakingTime / totalMeetingTime) * 100,
    };
}

function makeMetadata(meetingStartSec: number, meetingEndSec: number, segmentCount: number): TranscriptMetadata {
    return {
        meetingId: 'test-meeting-001',
        meetingTitle: 'Test Meeting',
        segmentCount,
        createdAt: new Date(),
        meetingStartSec,
        meetingEndSec,
    };
}

// ============================================================================
// TESTS: computeMeetingAnalytics()
// ============================================================================

function testComputeMeetingAnalytics() {
    console.log('\n📊 Testing computeMeetingAnalytics()...\n');

    // Test 1: Empty speaker stats
    {
        const result = computeMeetingAnalytics([], makeMetadata(0, 0, 0));
        assertEqual(result.participantCount, 0, 'Empty: 0 participants');
        assertEqual(result.totalWordCount, 0, 'Empty: 0 words');
        assertEqual(result.totalDurationSec, 0, 'Empty: 0 duration');
    }

    // Test 2: Single speaker
    {
        const stats = [makeSpeakerStat('Alice', 60, 120, 5)];
        const result = computeMeetingAnalytics(stats, makeMetadata(0, 60, 10));

        assertEqual(result.participantCount, 1, 'Single speaker: 1 participant');
        assertEqual(result.totalWordCount, 120, 'Single speaker: word count');
        assertEqual(result.dominantSpeaker, 'Alice', 'Single speaker: Alice is dominant');
        assertApprox(result.balanceScore, 100, 'Single speaker: balance score = 100');
    }

    // Test 3: Two equal speakers (perfect balance)
    {
        const stats = [
            makeSpeakerStat('Alice', 50, 100, 5),
            makeSpeakerStat('Bob', 50, 100, 5),
        ];
        const result = computeMeetingAnalytics(stats, makeMetadata(0, 100, 20));

        assertEqual(result.participantCount, 2, 'Two speakers: 2 participants');
        assertEqual(result.totalWordCount, 200, 'Two speakers: total words');
        assertApprox(result.balanceScore, 100, 'Equal speakers: balance ~100');
    }

    // Test 4: Highly skewed (one dominant speaker)
    {
        const stats = [
            makeSpeakerStat('Alice', 90, 180, 5),  // 90% speaking time
            makeSpeakerStat('Bob', 10, 20, 2),      // 10% speaking time
        ];
        const result = computeMeetingAnalytics(stats, makeMetadata(0, 100, 20));

        assertEqual(result.dominantSpeaker, 'Alice', 'Skewed: Alice is dominant');
        assert(result.balanceScore < 70, `Skewed meeting: balance < 70 (got ${result.balanceScore})`);
    }

    // Test 5: Three speakers with varied distribution
    {
        const stats = [
            makeSpeakerStat('Alice', 40, 80, 4),
            makeSpeakerStat('Bob', 35, 70, 3),
            makeSpeakerStat('Carol', 25, 50, 2),
        ];
        const result = computeMeetingAnalytics(stats, makeMetadata(0, 100, 20));

        assertEqual(result.participantCount, 3, 'Three speakers: participant count');
        assertEqual(result.totalWordCount, 200, 'Three speakers: total words');
        assertInRange(result.balanceScore, 50, 100, 'Three speakers: balance score in range');
    }

    // Test 6: Engagement score in valid range
    {
        const stats = [makeSpeakerStat('Alice', 50, 100, 10)];
        const result = computeMeetingAnalytics(stats, makeMetadata(0, 60, 20));

        assertInRange(result.engagementScore, 0, 100, 'Engagement score 0-100');
    }

    // Test 7: Words per minute calculation
    {
        const stats = [makeSpeakerStat('Alice', 60, 120, 5)]; // 120 words in 60s = 120 WPM
        const result = computeMeetingAnalytics(stats, makeMetadata(0, 60, 10));

        assertApprox(result.avgWordsPerMinute, 120, 'Average WPM correct', 10);
    }

    // Test 8: Silence time calculation
    {
        const stats = [
            makeSpeakerStat('Alice', 30, 60, 3),
            makeSpeakerStat('Bob', 20, 40, 2),
        ]; // Total speech = 50s
        const result = computeMeetingAnalytics(stats, makeMetadata(0, 100, 20)); // Meeting = 100s

        assertApprox(result.silenceSec, 50, 'Silence = 100 - 50 = 50s');
    }
}

// ============================================================================
// TESTS: extractTranscriptMetadata()
// ============================================================================

function testExtractTranscriptMetadata() {
    console.log('\n📊 Testing extractTranscriptMetadata()...\n');

    // Test 1: Empty segments
    {
        const result = extractTranscriptMetadata({
            meetingId: 'test-001',
            meetingTitle: 'Empty Meeting',
            segments: [],
            createdAt: new Date(),
        });

        assertEqual(result.segmentCount, 0, 'Empty: 0 segments');
    }

    // Test 2: Normal segments
    {
        const result = extractTranscriptMetadata({
            meetingId: 'test-002',
            meetingTitle: 'Test Meeting',
            segments: [
                { start: 5, end: 10 },
                { start: 10, end: 20 },
                { start: 20, end: 30 },
            ],
            createdAt: new Date(),
        });

        assertEqual(result.meetingId, 'test-002', 'Meeting ID preserved');
        assertEqual(result.segmentCount, 3, 'Segment count = 3');
        assertEqual(result.meetingStartSec, 5, 'First segment starts at 5');
        assertEqual(result.meetingEndSec, 30, 'Last segment ends at 30');
    }

    // Test 3: Meeting title extraction
    {
        const result = extractTranscriptMetadata({
            meetingId: 'test-003',
            meetingTitle: 'Important Strategy Meeting',
            segments: [{ start: 0, end: 5 }],
            createdAt: new Date(),
        });

        assertEqual(result.meetingTitle, 'Important Strategy Meeting', 'Title preserved');
    }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 UNIT TESTS: Meeting Analytics');
    console.log('='.repeat(60));

    testComputeMeetingAnalytics();
    testExtractTranscriptMetadata();

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(60) + '\n');

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(console.error);
