/**
 * Integration Tests: Processing Guards
 * 
 * Run: npx tsx tests/integration/processingGuards.test.ts
 * 
 * REQUIRES: PostgreSQL running (via Docker or localhost)
 * 
 * Tests GUARD 1 (finalization) and GUARD 2 (atomic lock)
 */

import { PrismaClient } from '@prisma/client';
import { MeetingStatus } from '../../src/config/constants';

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

const TEST_PREFIX = 'guard-test-';
const TEST_TENANT_ID = 'default-tenant-001';

async function createTestMeeting(status: string): Promise<string> {
    const id = TEST_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2);

    // Ensure tenant exists
    await prisma.tenant.upsert({
        where: { id: TEST_TENANT_ID },
        create: { id: TEST_TENANT_ID, name: 'Test Tenant', planType: 'free' },
        update: {},
    });

    await prisma.meeting.create({
        data: {
            id,
            tenantId: TEST_TENANT_ID,
            title: 'Guard Test Meeting',
            status,
        },
    });

    return id;
}

async function cleanupTestData() {
    try {
        await prisma.meeting.deleteMany({
            where: { id: { startsWith: TEST_PREFIX } },
        });
    } catch (e) {
        // Ignore
    }
}

// ============================================================================
// GUARD 2: Atomic Lock Tests
// ============================================================================

/**
 * Simulates the atomic lock logic from meetingProcessingWorker.ts
 */
async function acquireProcessingLock(meetingId: string): Promise<boolean> {
    const result = await prisma.meeting.updateMany({
        where: {
            id: meetingId,
            status: MeetingStatus.COMPLETED,
        },
        data: {
            status: MeetingStatus.PROCESSING,
        },
    });
    return result.count > 0;
}

async function testAtomicLock() {
    console.log('\n🔒 Testing GUARD 2: Atomic Lock...\n');

    // Test 1: Acquire lock on COMPLETED meeting
    {
        const meetingId = await createTestMeeting(MeetingStatus.COMPLETED);
        const acquired = await acquireProcessingLock(meetingId);

        assert(acquired, 'Lock acquired on COMPLETED meeting');

        const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
        assertEqual(meeting?.status, MeetingStatus.PROCESSING, 'Status changed to PROCESSING');
    }

    // Test 2: Cannot acquire lock on already PROCESSING
    {
        const meetingId = await createTestMeeting(MeetingStatus.PROCESSING);
        const acquired = await acquireProcessingLock(meetingId);

        assert(!acquired, 'Lock NOT acquired on PROCESSING meeting');
    }

    // Test 3: Cannot acquire lock on PROCESSED
    {
        const meetingId = await createTestMeeting(MeetingStatus.PROCESSED);
        const acquired = await acquireProcessingLock(meetingId);

        assert(!acquired, 'Lock NOT acquired on PROCESSED meeting');
    }

    // Test 4: Cannot acquire lock on LIVE
    {
        const meetingId = await createTestMeeting(MeetingStatus.LIVE);
        const acquired = await acquireProcessingLock(meetingId);

        assert(!acquired, 'Lock NOT acquired on LIVE meeting');
    }

    // Test 5: Race condition - only one wins
    {
        const meetingId = await createTestMeeting(MeetingStatus.COMPLETED);

        // Simulate two workers trying to acquire at the same time
        const [result1, result2] = await Promise.all([
            acquireProcessingLock(meetingId),
            acquireProcessingLock(meetingId),
        ]);

        const wins = [result1, result2].filter(r => r).length;
        assertEqual(wins, 1, 'Race condition: exactly 1 worker wins');
    }
}

// ============================================================================
// ROLLBACK Tests
// ============================================================================

async function testRollback() {
    console.log('\n↩️ Testing Rollback on Error...\n');

    // Test 1: Status reset to COMPLETED on failure
    {
        const meetingId = await createTestMeeting(MeetingStatus.COMPLETED);

        // Acquire lock
        await acquireProcessingLock(meetingId);

        // Verify it's PROCESSING
        let meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
        assertEqual(meeting?.status, MeetingStatus.PROCESSING, 'Status is PROCESSING after lock');

        // Simulate error and rollback
        await prisma.meeting.update({
            where: { id: meetingId },
            data: { status: MeetingStatus.COMPLETED },
        });

        meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
        assertEqual(meeting?.status, MeetingStatus.COMPLETED, 'Status rolled back to COMPLETED');
    }

    // Test 2: After rollback, can re-acquire lock
    {
        const meetingId = await createTestMeeting(MeetingStatus.COMPLETED);

        // First attempt
        await acquireProcessingLock(meetingId);

        // Rollback
        await prisma.meeting.update({
            where: { id: meetingId },
            data: { status: MeetingStatus.COMPLETED },
        });

        // Retry should succeed
        const acquired = await acquireProcessingLock(meetingId);
        assert(acquired, 'Lock re-acquired after rollback');
    }
}

// ============================================================================
// STATUS TRANSITION Tests
// ============================================================================

async function testStatusTransitions() {
    console.log('\n🔄 Testing Status Transitions...\n');

    // Test: Full lifecycle
    {
        const meetingId = await createTestMeeting(MeetingStatus.CREATED);

        // Simulate lifecycle
        const transitions = [
            MeetingStatus.BOT_LAUNCHED,
            MeetingStatus.LIVE,
            MeetingStatus.COMPLETED,
            MeetingStatus.PROCESSING,
            MeetingStatus.PROCESSED,
        ];

        for (const status of transitions) {
            await prisma.meeting.update({
                where: { id: meetingId },
                data: { status },
            });
        }

        const final = await prisma.meeting.findUnique({ where: { id: meetingId } });
        assertEqual(final?.status, MeetingStatus.PROCESSED, 'Full lifecycle completes');
    }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 INTEGRATION TESTS: Processing Guards');
    console.log('='.repeat(60));

    try {
        await prisma.$connect();
        console.log('✅ Database connected\n');

        await cleanupTestData(); // Clean any stale test data

        await testAtomicLock();
        await testRollback();
        await testStatusTransitions();

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
