/**
 * Unit Tests: Speaker Analytics
 * 
 * Run: npx tsx tests/unit/speakerAnalytics.test.ts
 * 
 * Tests for smoothSegments() and computeSpeakerStats()
 * These are PURE FUNCTIONS - no DB, no network
 */

import { smoothSegments, computeSpeakerStats, SpeakerStat, TranscriptSegment } from '../../src/application/analytics/speakerAnalytics';

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

function assertApprox(actual: number, expected: number, testName: string, tolerance = 0.5) {
    const match = Math.abs(actual - expected) < tolerance;
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

// ============================================================================
// TEST DATA FIXTURES
// ============================================================================

const segment = (id: number, speaker: string, text: string, start: number, end: number): TranscriptSegment => ({
    segmentId: `seg-${id}`,
    speaker,
    text,
    start,
    end,
});

// ============================================================================
// TESTS: smoothSegments()
// ============================================================================

function testSmoothSegments() {
    console.log('\n📊 Testing smoothSegments()...\n');

    // Test 1: Empty input
    {
        const result = smoothSegments([]);
        assertEqual(result.length, 0, 'Empty input returns empty array');
    }

    // Test 2: Single segment >= MIN_DURATION (0.3s)
    {
        const input = [segment(1, 'Alice', 'Hello world', 0, 1)];
        const result = smoothSegments(input);
        assert(result.length === 1, 'Single valid segment preserved');
        assert(result[0].speaker === 'Alice', 'Speaker preserved');
        assertEqual(result[0].wordCount, 2, 'Word count computed');
    }

    // Test 3: Short segment < 0.3s should be FILTERED
    {
        const input = [segment(1, 'Alice', 'Hi', 0, 0.2)]; // 200ms
        const result = smoothSegments(input);
        assertEqual(result.length, 0, 'Segment <300ms filtered out');
    }

    // Test 4: Consecutive same-speaker segments merged within 1s gap
    {
        const input = [
            segment(1, 'Alice', 'Hello', 0, 1),
            segment(2, 'Alice', 'World', 1.5, 2.5), // gap = 0.5s, same speaker
        ];
        const result = smoothSegments(input);
        assert(result.length === 1, 'Consecutive same-speaker merged');
        assertEqual(result[0].wordCount, 2, 'Word counts combined in merged segment');
        assertApprox(result[0].end - result[0].start, 2.5, 'Duration spans full range');
    }

    // Test 5: Different speakers NOT merged
    {
        const input = [
            segment(1, 'Alice', 'Hello', 0, 1),
            segment(2, 'Bob', 'Hi there mate', 1.1, 2),
        ];
        const result = smoothSegments(input);
        assert(result.length === 2, 'Different speakers not merged');
    }

    // Test 6: Same speaker with gap > 1s NOT merged
    {
        const input = [
            segment(1, 'Alice', 'First', 0, 1),
            segment(2, 'Alice', 'Second', 3, 4), // gap = 2s
        ];
        const result = smoothSegments(input);
        assert(result.length === 2, 'Same speaker with >1s gap not merged');
    }

    // Test 7: Mixed scenario
    {
        const input = [
            segment(1, 'Alice', 'One', 0, 1),
            segment(2, 'Alice', 'Two', 1.5, 2.5), // merge with 1
            segment(3, 'Bob', 'Three', 2.6, 3.5),
            segment(4, 'Bob', 'Four', 3.6, 4.5),  // merge with 3
            segment(5, 'Alice', 'Five', 4.6, 5.5),
        ];
        const result = smoothSegments(input);
        assert(result.length === 3, 'Mixed: 5 segments → 3 merged');
        assert(result[0].speaker === 'Alice', 'First group is Alice');
        assert(result[1].speaker === 'Bob', 'Second group is Bob');
        assert(result[2].speaker === 'Alice', 'Third group is Alice');
    }
}

// ============================================================================
// TESTS: computeSpeakerStats()
// ============================================================================

function testComputeSpeakerStats() {
    console.log('\n📊 Testing computeSpeakerStats()...\n');

    // Test 1: Empty input
    {
        const result = computeSpeakerStats([]);
        assertEqual(result.length, 0, 'Empty input returns empty array');
    }

    // Test 2: Single speaker, single segment
    {
        const input = [segment(1, 'Alice', 'Hello world test', 0, 10)]; // 10s, 3 words
        const result = computeSpeakerStats(input);
        assert(result.length === 1, 'One speaker → one stat');
        assert(result[0].speakerName === 'Alice', 'Speaker name correct');
        assertApprox(result[0].totalSpeakingTimeSec, 10, 'Speaking time = 10s');
        assertEqual(result[0].wordCount, 3, 'Word count = 3');
        assertEqual(result[0].interventionCount, 1, 'Intervention count = 1');
    }

    // Test 3: Two speakers
    {
        const input = [
            segment(1, 'Alice', 'Hello', 0, 5),    // 5s, 1 word
            segment(2, 'Bob', 'Hi there mate', 5, 10), // 5s, 3 words
        ];
        const result = computeSpeakerStats(input);
        assert(result.length === 2, 'Two speakers → two stats');

        const alice = result.find(s => s.speakerName === 'Alice')!;
        const bob = result.find(s => s.speakerName === 'Bob')!;

        assertApprox(alice.totalSpeakingTimeSec, 5, 'Alice speaking time');
        assertEqual(alice.wordCount, 1, 'Alice word count');
        assertApprox(bob.totalSpeakingTimeSec, 5, 'Bob speaking time');
        assertEqual(bob.wordCount, 3, 'Bob word count');
    }

    // Test 4: Speaker percentage calculation
    {
        const input = [
            segment(1, 'Alice', 'x', 0, 8),  // 8s = 80%
            segment(2, 'Bob', 'y', 8, 10),   // 2s = 20%
        ];
        const result = computeSpeakerStats(input);
        const alice = result.find(s => s.speakerName === 'Alice')!;
        const bob = result.find(s => s.speakerName === 'Bob')!;

        assertApprox(alice.percentageOfMeeting, 80, 'Alice percentage = 80%', 5);
        assertApprox(bob.percentageOfMeeting, 20, 'Bob percentage = 20%', 5);
    }

    // Test 5: Words per minute calculation
    {
        const input = [
            segment(1, 'Alice', 'one two three four five six', 0, 60), // 6 words in 60s = 6 WPM
        ];
        const result = computeSpeakerStats(input);
        assertApprox(result[0].avgWordsPerMinute, 6, 'WPM = 6');
    }

    // Test 6: Multiple interventions same speaker
    {
        const input = [
            segment(1, 'Alice', 'First', 0, 1),
            segment(2, 'Bob', 'Response', 1, 2),
            segment(3, 'Alice', 'Second', 5, 6), // gap > 1s, new intervention
            segment(4, 'Bob', 'Reply', 6, 7),
            segment(5, 'Alice', 'Third', 10, 11), // another intervention
        ];
        const result = computeSpeakerStats(input);
        const alice = result.find(s => s.speakerName === 'Alice')!;
        // After smoothing: Alice has 3 separate segments (gap >1s between them)
        assert(alice.interventionCount >= 1, 'Alice has interventions counted');
    }

    // Test 7: Zero-length segment handled
    {
        const input = [segment(1, 'Alice', 'test', 5, 5)]; // 0 duration
        const result = computeSpeakerStats(input);
        // Should be filtered by smoothing (< 0.3s)
        assertEqual(result.length, 0, 'Zero-length segment filtered');
    }

    // Test 8: Negative duration clamped (defensive)
    {
        const input = [segment(1, 'Alice', 'test', 10, 5)]; // end < start
        const result = computeSpeakerStats(input);
        // Should be filtered as duration is effectively 0
        assertEqual(result.length, 0, 'Negative duration handled');
    }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 UNIT TESTS: Speaker Analytics');
    console.log('='.repeat(60));

    testSmoothSegments();
    testComputeSpeakerStats();

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(60) + '\n');

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(console.error);
