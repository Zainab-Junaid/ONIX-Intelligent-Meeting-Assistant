/**
 * Comprehensive Test for Redis Buffer System
 * Tests the complete flow: Push -> Buffer -> Flush -> MongoDB
 */

import { getRedisClient } from '../src/config/redis';
import { initMongoConnection, saveBatchToMongo } from '../src/infrastructure/mongo/transcriptRepo';
import { pushCaptionsBatch } from '../src/application/transcription/captionService';
import { getBufferSize } from '../src/application/transcription/captionBuffer';

async function comprehensiveTest() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 COMPREHENSIVE REDIS BUFFER SYSTEM TEST');
  console.log('='.repeat(60) + '\n');

  // Step 1: Test Connections
  console.log('📋 Step 1: Testing Connections');
  console.log('-'.repeat(60));
  
  const redis = getRedisClient();
  const redisPing = await redis.ping();
  console.log(`✅ Redis: ${redisPing === 'PONG' ? 'Connected' : 'Failed'}`);
  
  await initMongoConnection();
  console.log('✅ MongoDB: Connected\n');

  // Step 2: Clear old test data
  console.log('📋 Step 2: Cleaning up old test data');
  console.log('-'.repeat(60));
  const testMeetingId = `comprehensive-test-${Date.now()}`;
  console.log(`Test Meeting ID: ${testMeetingId}\n`);

  // Step 3: Push captions (exactly 10 to trigger size-based flush)
  console.log('📋 Step 3: Pushing 10 captions to buffer');
  console.log('-'.repeat(60));
  const segments = Array.from({ length: 10 }, (_, i) => ({
    start: i,
    end: i + 1,
    text: `Comprehensive test segment ${i + 1}`,
    speaker: i % 2 === 0 ? 'Alice' : 'Bob',
  }));

  await pushCaptionsBatch(testMeetingId, segments, 'test-user', 'Comprehensive Test Meeting');
  const bufferSize = await getBufferSize(testMeetingId);
  console.log(`✅ Pushed ${segments.length} segments`);
  console.log(`✅ Buffer size: ${bufferSize} items\n`);

  // Step 4: Verify in Redis
  console.log('📋 Step 4: Verifying data in Redis');
  console.log('-'.repeat(60));
  const bufferKey = `meeting:${testMeetingId}:buffer`;
  const activeMeetings = await redis.smembers('active_meetings');
  const lastActive = await redis.get(`meeting:${testMeetingId}:last_active`);
  
  console.log(`✅ Buffer key exists: ${await redis.exists(bufferKey) ? 'Yes' : 'No'}`);
  console.log(`✅ Buffer length: ${await redis.llen(bufferKey)}`);
  console.log(`✅ In active_meetings set: ${activeMeetings.includes(testMeetingId) ? 'Yes' : 'No'}`);
  console.log(`✅ Last active timestamp: ${lastActive ? new Date(parseInt(lastActive)).toISOString() : 'None'}\n`);

  // Step 5: Wait for flush worker (or trigger manually)
  console.log('📋 Step 5: Waiting for flush worker to process');
  console.log('-'.repeat(60));
  console.log('⏳ Waiting 6 seconds for flush worker to process buffer...');
  console.log('   (Buffer should flush when size >= 10 or idle > 5s)\n');
  
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const currentSize = await redis.llen(bufferKey);
    if (currentSize === 0) {
      console.log(`✅ Buffer flushed after ${i + 1} seconds!`);
      break;
    }
    if (i === 5) {
      console.log(`⚠️ Buffer still has ${currentSize} items after 6 seconds`);
      console.log('   This means the flush worker may not be running.');
      console.log('   Start it with: npx ts-node src/flushWorker.ts\n');
    }
  }

  // Step 6: Verify MongoDB
  console.log('📋 Step 6: Verifying data in MongoDB');
  console.log('-'.repeat(60));
  
  // Import mongoose to query directly
  const mongoose = await import('mongoose');
  const TranscriptSegment = mongoose.default.model('TranscriptSegment');
  const MeetingTranscript = mongoose.default.model('MeetingTranscript');
  
  const segmentCount = await TranscriptSegment.countDocuments({ meetingId: testMeetingId });
  const meetingDoc = await MeetingTranscript.findOne({ meetingId: testMeetingId });
  
  console.log(`✅ Segments in MongoDB: ${segmentCount}`);
  console.log(`✅ Meeting document exists: ${meetingDoc ? 'Yes' : 'No'}`);
  if (meetingDoc) {
    console.log(`   - Meeting Title: ${meetingDoc.meetingTitle}`);
    console.log(`   - User ID: ${meetingDoc.userId}`);
  }

  // Step 7: Final verification
  console.log('\n📋 Step 7: Final Verification');
  console.log('-'.repeat(60));
  const finalBufferSize = await redis.llen(bufferKey);
  const bufferCleared = finalBufferSize === 0;
  const dataInMongo = segmentCount > 0;
  
  console.log(`Buffer cleared: ${bufferCleared ? '✅' : '❌'} (size: ${finalBufferSize})`);
  console.log(`Data in MongoDB: ${dataInMongo ? '✅' : '❌'} (count: ${segmentCount})`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Redis Connection: ✅`);
  console.log(`MongoDB Connection: ✅`);
  console.log(`Buffer Push: ✅`);
  console.log(`Buffer Flush: ${bufferCleared ? '✅' : '⚠️'}`);
  console.log(`MongoDB Persistence: ${dataInMongo ? '✅' : '⚠️'}`);
  
  if (bufferCleared && dataInMongo) {
    console.log('\n🎉 ALL TESTS PASSED! System is working correctly.');
  } else if (!bufferCleared) {
    console.log('\n⚠️ Buffer not cleared - Flush worker may not be running.');
    console.log('   Start it with: npx ts-node src/flushWorker.ts');
  } else {
    console.log('\n⚠️ Some issues detected. Check logs above.');
  }
  console.log('='.repeat(60) + '\n');

  await mongoose.default.connection.close();
  process.exit(bufferCleared && dataInMongo ? 0 : 1);
}

comprehensiveTest().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

