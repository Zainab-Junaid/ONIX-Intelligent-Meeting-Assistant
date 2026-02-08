/**
 * E2E Test: Full Data Pipeline
 * 
 * Run: npx tsx tests/e2e/fullPipeline.test.ts
 * 
 * REQUIRES: PostgreSQL running (via Docker or localhost)
 * 
 * Tests complete flow from meeting creation through analytics persistence
 */

import { PrismaClient } from '@prisma/client';
import { MeetingStatus } from '../../src/config/constants';
import { computeSpeakerStats, TranscriptSegment } from '../../src/application/analytics/speakerAnalytics';
import { computeMeetingAnalytics, extractTranscriptMetadata } from '../../src/application/analytics/meetingAnalytics';
import { upsertAllAnalytics } from '../../src/application/analytics/analyticsUpserts';

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

function assertApprox(actual: number, expected: number, testName: string, tolerance = 5) {
    const match = Math.abs(actual - expected) <= tolerance;
    if (match) {
        console.log(`  ✅ ${testName}`);
        passed++;
    } else {
        console.log(`  ❌ ${testName}: expected ${expected} ± ${tolerance}, got ${actual}`);
        failed++;
    }
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

const TEST_PREFIX = 'e2e-test-';
const TEST_TENANT_ID = 'default-tenant-001';

function generateMockSegments(): TranscriptSegment[] {
    // Simulate realistic meeting transcript
    return [
        { segmentId: 's1', speaker: 'Alice', text: 'Welcome everyone to this meeting', start: 0, end: 5 },
        { segmentId: 's2', speaker: 'Bob', text: 'Thanks for having me', start: 5, end: 8 },
        { segmentId: 's3', speaker: 'Alice', text: 'Let me share the agenda for today', start: 8, end: 12 },
        { segmentId: 's4', speaker: 'Carol', text: 'Sounds great', start: 12.5, end: 14 },
        { segmentId: 's5', speaker: 'Alice', text: 'First we will discuss the project timeline', start: 14, end: 20 },
        { segmentId: 's6', speaker: 'Bob', text: 'I have some concerns about the deadlines', start: 20, end: 26 },
        { segmentId: 's7', speaker: 'Alice', text: 'What specifically concerns you', start: 26, end: 30 },
        { segmentId: 's8', speaker: 'Bob', text: 'The testing phase seems short', start: 30, end: 35 },
        { segmentId: 's9', speaker: 'Carol', text: 'I agree with Bob on that point', start: 35, end: 40 },
        { segmentId: 's10', speaker: 'Alice', text: 'Okay let us extend it by one week', start: 40, end: 45 },
    ];
}

async function createTestMeeting(status: string = MeetingStatus.COMPLETED): Promise<string> {
    const id = TEST_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2);

    await prisma.tenant.upsert({
        where: { id: TEST_TENANT_ID },
        create: { id: TEST_TENANT_ID, name: 'Test Tenant', planType: 'free' },
        update: {},
    });

    await prisma.meeting.create({
        data: {
            id,
            tenantId: TEST_TENANT_ID,
            title: 'E2E Test Meeting',
            status,
            startTime: new Date(),
        },
    });

    return id;
}

async function cleanupTestData() {
    try {
        const meetings = await prisma.meeting.findMany({
            where: { id: { startsWith: TEST_PREFIX } },
            select: { id: true },
        });

        for (const m of meetings) {
            await prisma.meetingAnalytics.deleteMany({ where: { meetingId: m.id } });
            await prisma.speakerStats.deleteMany({ where: { meetingId: m.id } });
            await prisma.actionItem.deleteMany({ where: { meetingId: m.id } });
        }

        await prisma.meeting.deleteMany({
            where: { id: { startsWith: TEST_PREFIX } },
        });
    } catch (e) {
        // Ignore cleanup errors
    }
}

// ============================================================================
// E2E TEST: Happy Path
// ============================================================================

async function testHappyPath() {
    console.log('\n🎯 E2E Test: Happy Path (Normal Meeting)...\n');

    const meetingId = await createTestMeeting();
    const segments = generateMockSegments();

    try {
        // Step 1: Compute speaker stats
        const speakerStats = computeSpeakerStats(segments);
        assert(speakerStats.length === 3, 'Step 1: 3 speakers detected (Alice, Bob, Carol)');

        // Step 2: Extract metadata
        const metadata = extractTranscriptMetadata({
            meetingId,
            meetingTitle: 'E2E Test Meeting',
            segments,
            createdAt: new Date(),
        });
        assertEqual(metadata.segmentCount, 10, 'Step 2: 10 segments');

        // Step 3: Compute meeting analytics
        const meetingAnalytics = computeMeetingAnalytics(speakerStats, metadata);
        assertEqual(meetingAnalytics.participantCount, 3, 'Step 3: 3 participants');
        assert(meetingAnalytics.totalWordCount > 0, 'Step 3: Words counted');
        assert(meetingAnalytics.dominantSpeaker === 'Alice', 'Step 3: Alice is dominant speaker');

        // Step 4: Persist analytics (upsert)
        const speakerNames = [...new Set(segments.map(s => s.speaker))];
        await upsertAllAnalytics(meetingId, speakerStats, meetingAnalytics, speakerNames);

        // Step 5: Verify persistence
        const savedStats = await prisma.speakerStats.findMany({ where: { meetingId } });
        assertEqual(savedStats.length, 3, 'Step 5: 3 SpeakerStats rows');

        const savedAnalytics = await prisma.meetingAnalytics.findUnique({ where: { meetingId } });
        assert(savedAnalytics !== null, 'Step 5: MeetingAnalytics row exists');
        assertEqual(savedAnalytics?.totalSpeakers, 3, 'Step 5: Total speakers saved correctly');

        // Step 6: Update meeting status
        await prisma.meeting.update({
            where: { id: meetingId },
            data: { status: MeetingStatus.PROCESSED },
        });

        const finalMeeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
        assertEqual(finalMeeting?.status, MeetingStatus.PROCESSED, 'Step 6: Status is PROCESSED');

    } finally {
        await cleanupTestData();
    }
}

// ============================================================================
// E2E TEST: Empty Meeting
// ============================================================================

async function testEmptyMeeting() {
    console.log('\n📭 E2E Test: Empty Meeting (0 segments)...\n');

    const meetingId = await createTestMeeting();
    const segments: TranscriptSegment[] = [];

    try {
        // Should handle gracefully
        const speakerStats = computeSpeakerStats(segments);
        assertEqual(speakerStats.length, 0, 'Empty: 0 speaker stats');

        const metadata = extractTranscriptMetadata({
            meetingId,
            meetingTitle: 'Empty Meeting',
            segments,
            createdAt: new Date(),
        });
        assertEqual(metadata.segmentCount, 0, 'Empty: 0 segments in metadata');

        const analytics = computeMeetingAnalytics(speakerStats, metadata);
        assertEqual(analytics.participantCount, 0, 'Empty: 0 participants');

        // Persist should not throw
        await upsertAllAnalytics(meetingId, speakerStats, analytics, []);
        assert(true, 'Empty meeting: No error on persist');

    } finally {
        await cleanupTestData();
    }
}

// ============================================================================
// E2E TEST: Single Speaker
// ============================================================================

async function testSingleSpeaker() {
    console.log('\n👤 E2E Test: Single Speaker Meeting...\n');

    const meetingId = await createTestMeeting();
    const segments: TranscriptSegment[] = [
        { segmentId: 's1', speaker: 'Monologue Man', text: 'I am the only speaker here', start: 0, end: 30 },
        { segmentId: 's2', speaker: 'Monologue Man', text: 'Still just me talking on and on', start: 30, end: 60 },
    ];

    try {
        const speakerStats = computeSpeakerStats(segments);
        assertEqual(speakerStats.length, 1, 'Single speaker: 1 stat');
        assertEqual(speakerStats[0].speakerName, 'Monologue Man', 'Single speaker: correct name');

        const metadata = extractTranscriptMetadata({
            meetingId,
            meetingTitle: 'Monologue Meeting',
            segments,
            createdAt: new Date(),
        });

        const analytics = computeMeetingAnalytics(speakerStats, metadata);
        assertApprox(analytics.balanceScore, 100, 'Single speaker: balance = 100');

        await upsertAllAnalytics(meetingId, speakerStats, analytics, ['Monologue Man']);

        const savedStats = await prisma.speakerStats.findMany({ where: { meetingId } });
        assertEqual(savedStats.length, 1, 'Single speaker: 1 row saved');

    } finally {
        await cleanupTestData();
    }
}

// ============================================================================
// E2E TEST: Idempotency (Duplicate Processing)
// ============================================================================

async function testIdempotency() {
    console.log('\n🔄 E2E Test: Idempotency (Run Twice)...\n');

    const meetingId = await createTestMeeting();
    const segments = generateMockSegments();

    try {
        const speakerStats = computeSpeakerStats(segments);
        const metadata = extractTranscriptMetadata({
            meetingId,
            meetingTitle: 'Idempotency Test',
            segments,
            createdAt: new Date(),
        });
        const analytics = computeMeetingAnalytics(speakerStats, metadata);
        const speakers = [...new Set(segments.map(s => s.speaker))];

        // First run
        await upsertAllAnalytics(meetingId, speakerStats, analytics, speakers);
        const countAfterFirst = await prisma.speakerStats.count({ where: { meetingId } });

        // Second run (should be idempotent)
        await upsertAllAnalytics(meetingId, speakerStats, analytics, speakers);
        const countAfterSecond = await prisma.speakerStats.count({ where: { meetingId } });

        assertEqual(countAfterFirst, countAfterSecond, 'Idempotent: Same row count after 2 runs');
        assertEqual(countAfterSecond, 3, 'Idempotent: Still 3 rows');

        // Verify MeetingAnalytics also idempotent
        const analyticsCount = await prisma.meetingAnalytics.count({ where: { meetingId } });
        assertEqual(analyticsCount, 1, 'Idempotent: Still 1 MeetingAnalytics');

    } finally {
        await cleanupTestData();
    }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 E2E TESTS: Full Data Pipeline');
    console.log('='.repeat(60));

    try {
        await prisma.$connect();
        console.log('✅ Database connected\n');

        await cleanupTestData(); // Clean stale data

        await testHappyPath();
        await testEmptyMeeting();
        await testSingleSpeaker();
        await testIdempotency();

        await cleanupTestData();

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
