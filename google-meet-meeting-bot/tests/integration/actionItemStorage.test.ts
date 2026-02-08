/**
 * Integration Tests: ActionItem Storage
 * 
 * Run: npx tsx tests/integration/actionItemStorage.test.ts
 * 
 * REQUIRES: PostgreSQL running (via Docker or localhost)
 * 
 * Tests that saveActionItems uses ActionItem table (not MeetingJob)
 */

import { PrismaClient } from '@prisma/client';
import { saveActionItems, getActionItems } from '../../src/storage';

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

const TEST_PREFIX = 'action-test-';
const TEST_TENANT_ID = 'default-tenant-001';

async function createTestMeeting(): Promise<string> {
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
            title: 'ActionItem Test Meeting',
            status: 'COMPLETED',
        },
    });

    return id;
}

async function cleanupTestData() {
    try {
        // Get all test meeting IDs
        const meetings = await prisma.meeting.findMany({
            where: { id: { startsWith: TEST_PREFIX } },
            select: { id: true },
        });

        for (const m of meetings) {
            await prisma.actionItem.deleteMany({ where: { meetingId: m.id } });
            await prisma.meetingJob.deleteMany({
                where: {
                    meetingId: m.id,
                    meetingUrl: { startsWith: 'action-item-' }
                }
            });
        }

        await prisma.meeting.deleteMany({
            where: { id: { startsWith: TEST_PREFIX } },
        });
    } catch (e) {
        console.log('Cleanup error (may be ok):', (e as Error).message);
    }
}

// ============================================================================
// TESTS: saveActionItems uses ActionItem table
// ============================================================================

async function testSaveToActionItemTable() {
    console.log('\n📋 Testing saveActionItems() uses ActionItem table...\n');

    const meetingId = await createTestMeeting();

    try {
        // Test 1: Save action items
        {
            const items = [
                { meetingId, item: 'Review the proposal document', status: 'pending' },
                { meetingId, item: 'Schedule follow-up meeting', status: 'pending' },
            ];
            await saveActionItems(items);

            // Check ActionItem table
            const actionItems = await prisma.actionItem.findMany({
                where: { meetingId },
            });
            assert(actionItems.length >= 2, 'ActionItems saved to ActionItem table');
        }

        // Test 2: NOT saved to MeetingJob as action-item-*
        {
            const legacyItems = await prisma.meetingJob.findMany({
                where: {
                    meetingId,
                    meetingUrl: { startsWith: 'action-item-' },
                },
            });
            assertEqual(legacyItems.length, 0, 'NOT saved to MeetingJob (legacy pattern)');
        }

    } finally {
        await cleanupTestData();
    }
}

// ============================================================================
// TESTS: Deduplication
// ============================================================================

async function testDeduplication() {
    console.log('\n🔄 Testing ActionItem deduplication...\n');

    const meetingId = await createTestMeeting();

    try {
        // Test 1: Same item twice in batch - only 1 saved
        {
            const items = [
                { meetingId, item: 'Update the documentation', status: 'pending' },
                { meetingId, item: 'Update the documentation', status: 'pending' }, // Duplicate
            ];
            await saveActionItems(items);

            const actionItems = await prisma.actionItem.findMany({
                where: { meetingId },
            });
            assertEqual(actionItems.length, 1, 'Duplicate in batch: only 1 saved');
        }

    } finally {
        await cleanupTestData();
    }
}

// ============================================================================
// TESTS: getActionItems retrieves from correct table
// ============================================================================

async function testGetActionItems() {
    console.log('\n📥 Testing getActionItems()...\n');

    const meetingId = await createTestMeeting();

    try {
        // Test 1: Retrieve from ActionItem table
        {
            // Insert directly to ActionItem
            await prisma.actionItem.create({
                data: {
                    meetingId,
                    tenantId: TEST_TENANT_ID,
                    description: 'Direct insert action item',
                    status: 'pending',
                    priority: 'medium',
                },
            });

            const items = await getActionItems(meetingId);
            assert(items.length >= 1, 'getActionItems returns from ActionItem table');
            assert(items.some((i: any) => i.item === 'Direct insert action item'),
                'Correct item retrieved');
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
    console.log('🧪 INTEGRATION TESTS: ActionItem Storage');
    console.log('='.repeat(60));

    try {
        await prisma.$connect();
        console.log('✅ Database connected\n');

        await cleanupTestData(); // Clean stale data

        await testSaveToActionItemTable();
        await testDeduplication();
        await testGetActionItems();

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
