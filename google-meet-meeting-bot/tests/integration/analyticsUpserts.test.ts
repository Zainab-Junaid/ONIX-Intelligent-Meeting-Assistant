/**
 * Integration Tests: Analytics Upserts
 * 
 * Run: npx tsx tests/integration/analyticsUpserts.test.ts
 * 
 * REQUIRES: PostgreSQL running (via Docker or localhost)
 * 
 * Tests idempotency of upsert operations
 */

import { PrismaClient } from '@prisma/client';
import {
    upsertSpeakerStats,
    upsertMeetingAnalytics,
    upsertAllAnalytics,
} from '../../src/application/analytics/analyticsUpserts';
import { SpeakerStat } from '../../src/application/analytics/speakerAnalytics';
import { MeetingAnalyticsData } from '../../src/application/analytics/meetingAnalytics';

const prisma = new PrismaClient();

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

// ============================================================================
// TEST SETUP/TEARDOWN
// ============================================================================

const TEST_MEETING_ID = 'test-meeting-' + Date.now();
const TEST_TENANT_ID = 'default-tenant-001';

async function setupTestMeeting(): Promise<string> {
    // Ensure tenant exists
    await prisma.tenant.upsert({
        where: { id: TEST_TENANT_ID },
        create: { id: TEST_TENANT_ID, name: 'Test Tenant', planType: 'free' },
        update: {},
    });

    // Create test meeting
    const meeting = await prisma.meeting.create({
        data: {
            id: TEST_MEETING_ID,
            tenantId: TEST_TENANT_ID,
            title: 'Test Meeting for Upserts',
            status: 'COMPLETED',
        },
    });

    return meeting.id;
}

async function cleanupTestData() {
    try {
        // Delete in order of dependencies
        await prisma.meetingAnalytics.deleteMany({ where: { meetingId: TEST_MEETING_ID } });
        await prisma.speakerStats.deleteMany({ where: { meetingId: TEST_MEETING_ID } });
        await prisma.meeting.deleteMany({ where: { id: TEST_MEETING_ID } });
    } catch (e) {
        // Ignore errors during cleanup
    }
}

// ============================================================================
// TEST DATA FIXTURES
// ============================================================================

function makeSpeakerStat(name: string, time: number, words: number): SpeakerStat {
    return {
        speakerName: name,
        totalSpeakingTimeSec: time,
        wordCount: words,
        interventionCount: Math.ceil(time / 10),
        longestTurnSec: time / 2,
        avgWordsPerMinute: (words / time) * 60,
        percentageOfMeeting: 50, // Placeholder
    };
}

function makeMeetingAnalytics(): MeetingAnalyticsData {
    return {
        totalDurationSec: 600,
        totalSpeechSec: 500,
        silenceSec: 100,
        silencePercentage: 16.7,
        participantCount: 2,
        segmentCount: 50,
        totalWordCount: 1000,
        avgWordsPerMinute: 100,
        dominantSpeaker: 'Alice',
        dominantSpeakerPercentage: 60,
        balanceScore: 85,
        engagementScore: 75,
    };
}

// ============================================================================
// TESTS: upsertSpeakerStats()
// ============================================================================

async function testUpsertSpeakerStats() {
    console.log('\n📊 Testing upsertSpeakerStats()...\n');

    const meetingId = await setupTestMeeting();

    try {
        // Test 1: First insert creates rows
        {
            const stats = [
                makeSpeakerStat('Alice', 100, 200),
                makeSpeakerStat('Bob', 80, 160),
            ];
            await upsertSpeakerStats(meetingId, stats);

            const rows = await prisma.speakerStats.findMany({ where: { meetingId } });
            assertEqual(rows.length, 2, 'First upsert: 2 rows created');
        }

        // Test 2: Second upsert with same data - no duplicates
        {
            const stats = [
                makeSpeakerStat('Alice', 100, 200),
                makeSpeakerStat('Bob', 80, 160),
            ];
            await upsertSpeakerStats(meetingId, stats);

            const rows = await prisma.speakerStats.findMany({ where: { meetingId } });
            assertEqual(rows.length, 2, 'Second upsert: still 2 rows (idempotent)');
        }

        // Test 3: Upsert with updated values
        {
            const stats = [
                makeSpeakerStat('Alice', 150, 300), // Updated values
                makeSpeakerStat('Bob', 80, 160),
            ];
            await upsertSpeakerStats(meetingId, stats);

            const alice = await prisma.speakerStats.findFirst({
                where: { meetingId, speakerLabel: 'Alice' },
            });
            assertEqual(alice?.wordCount, 300, 'Values updated on upsert');
        }

        // Test 4: Empty stats - no error
        {
            await upsertSpeakerStats(meetingId, []);
            assert(true, 'Empty stats array handled');
        }

    } finally {
        await cleanupTestData();
    }
}

// ============================================================================
// TESTS: upsertMeetingAnalytics()
// ============================================================================

async function testUpsertMeetingAnalytics() {
    console.log('\n📊 Testing upsertMeetingAnalytics()...\n');

    const meetingId = await setupTestMeeting();

    try {
        // Test 1: First insert
        {
            await upsertMeetingAnalytics(meetingId, makeMeetingAnalytics());

            const row = await prisma.meetingAnalytics.findUnique({ where: { meetingId } });
            assert(row !== null, 'First upsert: row created');
            assertEqual(row?.totalDurationSeconds, 600, 'Duration saved correctly');
        }

        // Test 2: Second upsert - updates, no duplicate
        {
            const updated = makeMeetingAnalytics();
            updated.totalWordCount = 1500;
            await upsertMeetingAnalytics(meetingId, updated);

            const count = await prisma.meetingAnalytics.count({ where: { meetingId } });
            assertEqual(count, 1, 'Second upsert: still 1 row (idempotent)');

            const row = await prisma.meetingAnalytics.findUnique({ where: { meetingId } });
            assertEqual(row?.totalWords, 1500, 'Values updated');
        }

    } finally {
        await cleanupTestData();
    }
}

// ============================================================================
// TESTS: upsertAllAnalytics() - Transaction
// ============================================================================

async function testUpsertAllAnalytics() {
    console.log('\n📊 Testing upsertAllAnalytics() (transactional)...\n');

    const meetingId = await setupTestMeeting();

    try {
        // Test 1: All-in-one transaction
        {
            const speakerStats = [
                makeSpeakerStat('Alice', 100, 200),
                makeSpeakerStat('Bob', 80, 160),
            ];
            const meetingAnalytics = makeMeetingAnalytics();

            await upsertAllAnalytics(meetingId, speakerStats, meetingAnalytics, ['Alice', 'Bob']);

            const statsCount = await prisma.speakerStats.count({ where: { meetingId } });
            const analyticsCount = await prisma.meetingAnalytics.count({ where: { meetingId } });

            assertEqual(statsCount, 2, 'Transaction: SpeakerStats created');
            assertEqual(analyticsCount, 1, 'Transaction: MeetingAnalytics created');
        }

        // Test 2: Idempotent - run again
        {
            const speakerStats = [
                makeSpeakerStat('Alice', 100, 200),
                makeSpeakerStat('Bob', 80, 160),
            ];
            const meetingAnalytics = makeMeetingAnalytics();

            await upsertAllAnalytics(meetingId, speakerStats, meetingAnalytics, ['Alice', 'Bob']);

            const statsCount = await prisma.speakerStats.count({ where: { meetingId } });
            const analyticsCount = await prisma.meetingAnalytics.count({ where: { meetingId } });

            assertEqual(statsCount, 2, 'Idempotent: still 2 SpeakerStats');
            assertEqual(analyticsCount, 1, 'Idempotent: still 1 MeetingAnalytics');
        }

    } finally {
        await cleanupTestData();
    }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 INTEGRATION TESTS: Analytics Upserts');
    console.log('='.repeat(60));

    try {
        await prisma.$connect();
        console.log('✅ Database connected\n');

        await testUpsertSpeakerStats();
        await testUpsertMeetingAnalytics();
        await testUpsertAllAnalytics();

        console.log('\n' + '='.repeat(60));
        console.log(`📊 Results: ${passed} passed, ${failed} failed`);
        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        failed++;
    } finally {
        await prisma.$disconnect();
    }

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(console.error);
