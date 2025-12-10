/**
 * Test script for Redis Buffer System
 * 
 * This script tests:
 * 1. Redis connection
 * 2. MongoDB connection
 * 3. Pushing captions to buffer
 * 4. Verifying flush worker processes them
 */

import { getRedisClient } from './redisClient';
import { initMongoConnection } from './mongoLayer';
import { pushCaptionsBatch } from './captionService';
import { getBufferSize, getLastActiveTime } from './captionBuffer';

async function testRedisConnection() {
  console.log('\n🔍 Testing Redis connection...');
  try {
    const redis = getRedisClient();
    const result = await redis.ping();
    if (result === 'PONG') {
      console.log('✅ Redis connection successful');
      return true;
    } else {
      console.log('❌ Redis ping failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    return false;
  }
}

async function testMongoConnection() {
  console.log('\n🔍 Testing MongoDB connection...');
  try {
    await initMongoConnection();
    console.log('✅ MongoDB connection successful');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    return false;
  }
}

async function testBufferPush() {
  console.log('\n🔍 Testing buffer push...');
  try {
    const meetingId = 'test-meeting-' + Date.now();
    const segments = Array.from({ length: 12 }, (_, i) => ({
      start: i,
      end: i + 1,
      text: `Test segment ${i + 1}`,
      speaker: i % 2 === 0 ? 'Alice' : 'Bob',
    }));

    console.log(`📝 Pushing ${segments.length} segments to buffer for meeting ${meetingId}...`);
    await pushCaptionsBatch(meetingId, segments, 'test-user', 'Test Meeting');

    // Check buffer size
    const bufferSize = await getBufferSize(meetingId);
    console.log(`✅ Buffer size after push: ${bufferSize} items`);

    // Check last active time
    const lastActive = await getLastActiveTime(meetingId);
    if (lastActive) {
      console.log(`✅ Last active timestamp: ${new Date(lastActive).toISOString()}`);
    }

    return { meetingId, bufferSize };
  } catch (error) {
    console.error('❌ Buffer push failed:', error);
    return null;
  }
}

async function verifyFlush(meetingId: string) {
  console.log('\n🔍 Waiting for flush worker to process buffer...');
  console.log('⏳ Waiting 3 seconds for flush to complete...');
  
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    const redis = getRedisClient();
    const bufferKey = `meeting:${meetingId}:buffer`;
    const bufferSize = await redis.llen(bufferKey);
    
    if (bufferSize === 0) {
      console.log('✅ Buffer was flushed (size is 0)');
      return true;
    } else {
      console.log(`⚠️ Buffer still has ${bufferSize} items (may need more time)`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error checking buffer:', error);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Redis Buffer System Test\n');
  console.log('='.repeat(50));

  // Test 1: Redis connection
  const redisOk = await testRedisConnection();
  if (!redisOk) {
    console.log('\n❌ Redis test failed. Exiting.');
    process.exit(1);
  }

  // Test 2: MongoDB connection
  const mongoOk = await testMongoConnection();
  if (!mongoOk) {
    console.log('\n❌ MongoDB test failed. Exiting.');
    process.exit(1);
  }

  // Test 3: Push captions
  const pushResult = await testBufferPush();
  if (!pushResult) {
    console.log('\n❌ Buffer push test failed. Exiting.');
    process.exit(1);
  }

  // Test 4: Verify flush (wait a bit)
  const flushOk = await verifyFlush(pushResult.meetingId);

  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Summary:');
  console.log(`  Redis Connection: ${redisOk ? '✅' : '❌'}`);
  console.log(`  MongoDB Connection: ${mongoOk ? '✅' : '❌'}`);
  console.log(`  Buffer Push: ${pushResult ? '✅' : '❌'}`);
  console.log(`  Flush Verification: ${flushOk ? '✅' : '⚠️'}`);

  if (redisOk && mongoOk && pushResult && flushOk) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some tests had issues. Check the logs above.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

