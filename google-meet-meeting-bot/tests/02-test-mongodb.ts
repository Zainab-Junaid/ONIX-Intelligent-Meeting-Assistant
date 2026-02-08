/**
 * Test 2: MongoDB Connection
 * 
 * Run: npx ts-node tests/02-test-mongodb.ts
 */

import {
    initMongoConnection,
    getTranscriptFromMongo,
    getAllTranscriptsFromMongo,
    closeMongoConnection
} from '../src/infrastructure/mongo/transcriptRepo';

async function main() {
    console.log('\n📦 TEST 2: MongoDB Connection\n' + '='.repeat(50));

    try {
        // Test 2.1: Basic connection
        console.log('2.1 Testing connection...');
        await initMongoConnection();
        console.log('    ✅ MongoDB connected successfully');

        // Test 2.2: Get all transcripts
        console.log('2.2 Testing getAllTranscriptsFromMongo...');
        const transcripts = await getAllTranscriptsFromMongo();
        console.log(`    ✅ Found ${transcripts.length} transcripts`);

        // Test 2.3: Show sample data
        if (transcripts.length > 0) {
            console.log('2.3 Sample transcript data:');
            const sample = transcripts[0];
            console.log(`    - Meeting ID: ${sample.meetingId}`);
            console.log(`    - Title: ${sample.meetingTitle || 'Untitled'}`);
            console.log(`    - Segments: ${sample.segments.length}`);
            console.log(`    - Created: ${sample.createdAt}`);

            if (sample.segments.length > 0) {
                console.log('    - First segment:');
                console.log(`      Speaker: ${sample.segments[0].speaker}`);
                console.log(`      Text: "${sample.segments[0].text.substring(0, 50)}..."`);
            }
        } else {
            console.log('2.3 No transcripts yet (run a meeting first)');
        }

        // Test 2.4: Test individual fetch
        if (transcripts.length > 0) {
            console.log('2.4 Testing getTranscriptFromMongo...');
            const singleTranscript = await getTranscriptFromMongo(transcripts[0].meetingId);
            if (singleTranscript) {
                console.log(`    ✅ Individual fetch works (${singleTranscript.segments.length} segments)`);
            } else {
                console.log('    ⚠️ Individual fetch returned null');
            }
        }

        // Test 2.5: Graceful disconnect
        console.log('2.5 Testing graceful disconnect...');
        await closeMongoConnection();
        console.log('    ✅ MongoDB disconnected gracefully');

        console.log('\n✅ ALL MONGODB TESTS PASSED!\n');

    } catch (error: any) {
        console.error('\n❌ MONGODB TEST FAILED!');
        console.error('Error:', error.message);
        console.error('\nPossible fixes:');
        console.error('  1. Is MongoDB running? Check: netstat -ano | findstr :27017');
        console.error('  2. Is MONGODB_URI correct in .env?');
        console.error('  3. Default URI: mongodb://localhost:27017/meeting-transcripts');
        process.exit(1);
    }
}

main();
