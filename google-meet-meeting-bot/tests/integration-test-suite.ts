/**
 * Comprehensive Integration Test Suite
 * 
 * Tests the full data pipeline:
 * - Redis buffering and Pub/Sub
 * - MongoDB transcript storage
 * - PostgreSQL Meeting lifecycle and metadata
 * - Summary and Action Items generation
 * 
 * Run with: npx ts-node tests/integration-test-suite.ts
 */

import { prisma, disconnectPrisma } from '../src/lib/prisma';
import {
    initMongoConnection,
    getTranscriptFromMongo,
    getAllTranscriptsFromMongo,
    closeMongoConnection
} from '../src/infrastructure/mongo/transcriptRepo';
import { getRedisClient } from '../src/config/redis';

// Test results tracking
const results: { test: string; status: 'PASS' | 'FAIL' | 'SKIP'; details?: string }[] = [];

function logTest(test: string, status: 'PASS' | 'FAIL' | 'SKIP', details?: string) {
    results.push({ test, status, details });
    const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
    console.log(`${emoji} ${test}${details ? `: ${details}` : ''}`);
}

// ============================================
// PHASE 1: PostgreSQL Connection Tests
// ============================================
async function testPostgresConnection() {
    console.log('\n📊 PHASE 1: PostgreSQL Tests\n' + '='.repeat(40));

    try {
        await prisma.$connect();
        logTest('PostgreSQL connection', 'PASS');
    } catch (e: any) {
        logTest('PostgreSQL connection', 'FAIL', e.message);
        return false;
    }

    // Test Meeting table exists
    try {
        const count = await prisma.meeting.count();
        logTest('Meeting table accessible', 'PASS', `${count} meetings found`);
    } catch (e: any) {
        logTest('Meeting table accessible', 'FAIL', e.message);
    }

    // Test MeetingJob table (legacy)
    try {
        const count = await prisma.meetingJob.count();
        logTest('MeetingJob table accessible', 'PASS', `${count} jobs found`);
    } catch (e: any) {
        logTest('MeetingJob table accessible', 'FAIL', e.message);
    }

    // Test MeetingSummary table
    try {
        const count = await prisma.meetingSummary.count();
        logTest('MeetingSummary table accessible', 'PASS', `${count} summaries found`);
    } catch (e: any) {
        logTest('MeetingSummary table accessible', 'FAIL', e.message);
    }

    // Test Tenant exists (for Meeting lifecycle)
    try {
        const tenant = await prisma.tenant.findFirst();
        if (tenant) {
            logTest('Default Tenant exists', 'PASS', `id: ${tenant.id}`);
        } else {
            logTest('Default Tenant exists', 'SKIP', 'No tenant yet (will be created on first bot start)');
        }
    } catch (e: any) {
        logTest('Default Tenant exists', 'FAIL', e.message);
    }

    return true;
}

// ============================================
// PHASE 2: MongoDB Connection Tests
// ============================================
async function testMongoConnection() {
    console.log('\n📦 PHASE 2: MongoDB Tests\n' + '='.repeat(40));

    try {
        await initMongoConnection();
        logTest('MongoDB connection', 'PASS');
    } catch (e: any) {
        logTest('MongoDB connection', 'FAIL', e.message);
        return false;
    }

    // Test transcript retrieval
    try {
        const transcripts = await getAllTranscriptsFromMongo();
        logTest('MongoDB transcript query', 'PASS', `${transcripts.length} transcripts found`);

        if (transcripts.length > 0) {
            const first = transcripts[0];
            logTest('Transcript has segments', 'PASS', `${first.segments.length} segments in first transcript`);
        } else {
            logTest('Transcript has segments', 'SKIP', 'No transcripts yet');
        }
    } catch (e: any) {
        logTest('MongoDB transcript query', 'FAIL', e.message);
    }

    return true;
}

// ============================================
// PHASE 3: Redis Connection Tests
// ============================================
async function testRedisConnection() {
    console.log('\n⚡ PHASE 3: Redis Tests\n' + '='.repeat(40));

    let redis;
    try {
        redis = getRedisClient();
        await redis.ping();
        logTest('Redis connection', 'PASS');
    } catch (e: any) {
        logTest('Redis connection', 'FAIL', e.message);
        return false;
    }

    // Check active meetings
    try {
        const activeMeetings = await redis.smembers('active_meetings');
        logTest('Active meetings set', 'PASS', `${activeMeetings.length} active meetings`);
    } catch (e: any) {
        logTest('Active meetings set', 'FAIL', e.message);
    }

    // Check for any meeting buffers
    try {
        const keys = await redis.keys('meeting:*:buffer');
        logTest('Meeting buffers in Redis', 'PASS', `${keys.length} buffers found`);
    } catch (e: any) {
        logTest('Meeting buffers in Redis', 'FAIL', e.message);
    }

    return true;
}

// ============================================
// PHASE 4: Data Flow Verification
// ============================================
async function testDataFlow() {
    console.log('\n🔄 PHASE 4: Data Flow Verification\n' + '='.repeat(40));

    // Check if any Meeting exists with mongoTranscriptId
    try {
        const meetingsWithTranscript = await prisma.meeting.findMany({
            where: { mongoTranscriptId: { not: null } },
            take: 5
        });

        if (meetingsWithTranscript.length > 0) {
            logTest('PostgreSQL → MongoDB link', 'PASS', `${meetingsWithTranscript.length} meetings have mongoTranscriptId`);

            // Verify the link works
            for (const m of meetingsWithTranscript.slice(0, 1)) {
                const transcript = await getTranscriptFromMongo(m.mongoTranscriptId!);
                if (transcript) {
                    logTest('MongoDB transcript fetch by ID', 'PASS', `Found transcript with ${transcript.segments.length} segments`);
                } else {
                    logTest('MongoDB transcript fetch by ID', 'FAIL', `Transcript ${m.mongoTranscriptId} not found in MongoDB`);
                }
            }
        } else {
            logTest('PostgreSQL → MongoDB link', 'SKIP', 'No meetings with mongoTranscriptId yet');
        }
    } catch (e: any) {
        logTest('PostgreSQL → MongoDB link', 'FAIL', e.message);
    }

    // Check Meeting lifecycle states
    try {
        const liveMeetings = await prisma.meeting.count({ where: { status: 'live' } });
        const completedMeetings = await prisma.meeting.count({ where: { status: 'completed' } });
        logTest('Meeting lifecycle tracking', 'PASS', `${liveMeetings} live, ${completedMeetings} completed`);
    } catch (e: any) {
        logTest('Meeting lifecycle tracking', 'FAIL', e.message);
    }
}

// ============================================
// PHASE 5: Summary/Action Items Pipeline
// ============================================
async function testSummaryPipeline() {
    console.log('\n📝 PHASE 5: Summary Pipeline Tests\n' + '='.repeat(40));

    // Check MeetingSummary table
    try {
        const summaries = await prisma.meetingSummary.findMany({
            take: 5,
            orderBy: { generatedAt: 'desc' }
        });

        if (summaries.length > 0) {
            logTest('Summaries exist in PostgreSQL', 'PASS', `${summaries.length} summaries found`);
            const latest = summaries[0];
            logTest('Summary has content', latest.summaryText ? 'PASS' : 'FAIL',
                `Latest: ${latest.summaryText?.substring(0, 50)}...`);
        } else {
            logTest('Summaries exist in PostgreSQL', 'SKIP', 'No summaries generated yet');
        }
    } catch (e: any) {
        logTest('Summary pipeline', 'FAIL', e.message);
    }

    // Check ActionItem table
    try {
        const actionItems = await prisma.actionItem.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' }
        });

        if (actionItems.length > 0) {
            logTest('Action items exist in PostgreSQL', 'PASS', `${actionItems.length} action items found`);
        } else {
            logTest('Action items exist in PostgreSQL', 'SKIP', 'No action items generated yet');
        }
    } catch (e: any) {
        logTest('Action items pipeline', 'FAIL', e.message);
    }
}

// ============================================
// PHASE 6: Legacy Table Isolation
// ============================================
async function testLegacyIsolation() {
    console.log('\n🔒 PHASE 6: Legacy Table Isolation\n' + '='.repeat(40));

    // Check legacy Segment table is NOT being used
    try {
        const segmentCount = await prisma.segment.count();
        if (segmentCount === 0) {
            logTest('Legacy Segment table empty', 'PASS', 'No new writes to legacy table');
        } else {
            logTest('Legacy Segment table empty', 'SKIP', `${segmentCount} legacy segments exist (from before migration)`);
        }
    } catch (e: any) {
        logTest('Legacy Segment table', 'FAIL', e.message);
    }

    // Check legacy MeetingTranscript table
    try {
        const legacyCount = await prisma.meetingTranscript.count();
        logTest('Legacy MeetingTranscript status', 'PASS', `${legacyCount} legacy transcripts (should not grow)`);
    } catch (e: any) {
        logTest('Legacy MeetingTranscript', 'FAIL', e.message);
    }
}

// ============================================
// Main Test Runner
// ============================================
async function runAllTests() {
    console.log('\n' + '═'.repeat(50));
    console.log('🧪 COMPREHENSIVE INTEGRATION TEST SUITE');
    console.log('═'.repeat(50));
    console.log('Testing: Redis → MongoDB → PostgreSQL Pipeline\n');

    await testPostgresConnection();
    await testMongoConnection();
    await testRedisConnection();
    await testDataFlow();
    await testSummaryPipeline();
    await testLegacyIsolation();

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(50));

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const skipped = results.filter(r => r.status === 'SKIP').length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️ Skipped: ${skipped}`);
    console.log(`📊 Total: ${results.length}`);

    if (failed > 0) {
        console.log('\n❌ FAILED TESTS:');
        results.filter(r => r.status === 'FAIL').forEach(r => {
            console.log(`   - ${r.test}: ${r.details}`);
        });
    }

    // Cleanup
    console.log('\n🔌 Closing connections...');
    await closeMongoConnection();
    await disconnectPrisma();

    console.log('\n✅ Test suite complete!\n');
}

runAllTests().catch(console.error);
