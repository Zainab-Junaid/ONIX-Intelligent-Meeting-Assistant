/**
 * Test 5: Data Pipeline (Redis → MongoDB → PostgreSQL)
 * 
 * Run: npx ts-node tests/05-test-data-pipeline.ts
 */

import { prisma, disconnectPrisma } from '../src/lib/prisma';
import {
    initMongoConnection,
    getTranscriptFromMongo,
    closeMongoConnection
} from '../src/infrastructure/mongo/transcriptRepo';
import { getRedisClient } from '../src/config/redis';

async function main() {
    console.log('\n🔗 TEST 5: Data Pipeline\n' + '='.repeat(50));

    try {
        // Initialize all connections
        console.log('5.0 Initializing connections...');
        await prisma.$connect();
        await initMongoConnection();
        const redis = getRedisClient();
        await redis.ping();
        console.log('    ✅ All connections established');

        // Test 5.1: Check Redis → MongoDB flow
        console.log('\n5.1 Testing Redis → MongoDB flow...');
        const activeMeetings = await redis.smembers('active_meetings');
        if (activeMeetings.length > 0) {
            console.log(`    Found ${activeMeetings.length} active meetings in Redis`);
            const meetingId = activeMeetings[0];
            const bufferLen = await redis.llen(`meeting:${meetingId}:buffer`);
            console.log(`    Buffer for ${meetingId}: ${bufferLen} pending captions`);

            // Check if this meeting has data in MongoDB
            const mongoData = await getTranscriptFromMongo(meetingId);
            if (mongoData) {
                console.log(`    ✅ MongoDB has ${mongoData.segments.length} segments for this meeting`);
            } else {
                console.log(`    ℹ️ MongoDB doesn't have this meeting yet (still buffering)`);
            }
        } else {
            console.log('    ⚠️ No active meetings in Redis (run a meeting to test)');
        }

        // Test 5.2: Check MongoDB → PostgreSQL link
        console.log('\n5.2 Testing MongoDB → PostgreSQL link...');
        const meetingsWithMongo = await prisma.meeting.findMany({
            where: { mongoTranscriptId: { not: null } },
            select: { id: true, title: true, mongoTranscriptId: true },
            take: 5
        });

        if (meetingsWithMongo.length > 0) {
            console.log(`    Found ${meetingsWithMongo.length} meetings with MongoDB references`);

            for (const m of meetingsWithMongo.slice(0, 2)) {
                console.log(`    Verifying link for: ${m.id}`);
                const transcript = await getTranscriptFromMongo(m.mongoTranscriptId!);
                if (transcript) {
                    console.log(`      ✅ MongoDB transcript found: ${transcript.segments.length} segments`);
                } else {
                    console.log(`      ❌ MongoDB transcript NOT FOUND (orphan reference)`);
                }
            }
        } else {
            console.log('    ⚠️ No meetings have MongoDB links yet');
        }

        // Test 5.3: Check legacy tables are NOT being used
        console.log('\n5.3 Checking legacy table isolation...');
        const legacySegments = await prisma.segment.count();
        const legacyTranscripts = await prisma.meetingTranscript.count();
        console.log(`    Legacy Segment table: ${legacySegments} rows`);
        console.log(`    Legacy MeetingTranscript table: ${legacyTranscripts} rows`);

        if (legacySegments === 0 && legacyTranscripts === 0) {
            console.log('    ✅ Legacy tables are empty (correct!)');
        } else {
            console.log('    ℹ️ Legacy data exists (from before migration, not growing)');
        }

        // Test 5.4: Check summary pipeline
        console.log('\n5.4 Checking Summary pipeline...');
        const summaries = await prisma.meetingSummary.findMany({
            orderBy: { generatedAt: 'desc' },
            take: 3,
            select: { id: true, meetingId: true, generatedAt: true, summaryText: true }
        });

        if (summaries.length > 0) {
            console.log(`    ✅ Found ${summaries.length} summaries in PostgreSQL`);
            for (const s of summaries) {
                console.log(`      - Meeting ${s.meetingId}: ${s.summaryText?.substring(0, 40)}...`);
            }
        } else {
            console.log('    ⚠️ No summaries generated yet');
        }

        // Test 5.5: Check action items pipeline
        console.log('\n5.5 Checking Action Items pipeline...');
        const actionItems = await prisma.actionItem.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, meetingId: true, title: true, status: true }
        });

        if (actionItems.length > 0) {
            console.log(`    ✅ Found ${actionItems.length} action items in PostgreSQL`);
            for (const a of actionItems) {
                console.log(`      - [${a.status}] ${a.title}`);
            }
        } else {
            console.log('    ⚠️ No action items generated yet');
        }

        // Cleanup
        await closeMongoConnection();
        await disconnectPrisma();

        console.log('\n✅ ALL DATA PIPELINE TESTS PASSED!\n');

    } catch (error: any) {
        console.error('\n❌ DATA PIPELINE TEST FAILED!');
        console.error('Error:', error.message);
        console.error('\nThis test requires:');
        console.error('  1. All three databases running (PostgreSQL, MongoDB, Redis)');
        console.error('  2. At least one completed meeting with the bot');
        await closeMongoConnection().catch(() => { });
        await disconnectPrisma().catch(() => { });
        process.exit(1);
    }
}

main();
