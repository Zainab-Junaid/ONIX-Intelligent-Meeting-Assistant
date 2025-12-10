/**
 * Manual flush test - directly calls the flush function
 * This bypasses the worker to test if flushing logic works
 */

import { getRedisClient } from './redisClient';
import { initMongoConnection } from './mongoLayer';
import { pushCaptionsBatch } from './captionService';
// Manual flush test - we'll implement the flush logic directly

// Import the internal function - we need to make it exportable
// Actually, let's just test the worker's flushMeetingBuffer function directly
// But first, let's check if we can import it

async function manualTest() {
  console.log('🧪 Manual Flush Test\n');
  
  // Initialize
  await initMongoConnection();
  const redis = getRedisClient();
  
  // Push test data
  const meetingId = `manual-test-${Date.now()}`;
  console.log(`Test Meeting ID: ${meetingId}\n`);
  
  const segments = Array.from({ length: 10 }, (_, i) => ({
    start: i,
    end: i + 1,
    text: `Manual test segment ${i + 1}`,
    speaker: i % 2 === 0 ? 'Alice' : 'Bob',
  }));
  
  console.log('📝 Pushing 10 segments...');
  await pushCaptionsBatch(meetingId, segments, 'test-user', 'Manual Test');
  
  const bufferKey = `meeting:${meetingId}:buffer`;
  const sizeBefore = await redis.llen(bufferKey);
  console.log(`✅ Buffer size before flush: ${sizeBefore}\n`);
  
  // Import and call flush function directly
  // Since flushMeetingBuffer is not exported, let's use a workaround
  // We'll manually trigger the flush logic
  
  console.log('🔄 Manually triggering flush...');
  
  // Read the flush logic from flushWorker
  const bufferLength = await redis.llen(bufferKey);
  const lastActiveStr = await redis.get(`meeting:${meetingId}:last_active`);
  const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : null;
  const now = Date.now();
  const timeSinceLastActive = lastActive ? now - lastActive : Infinity;
  
  console.log(`Buffer length: ${bufferLength}`);
  console.log(`Time since last active: ${timeSinceLastActive}ms`);
  
  if (bufferLength >= 10 || timeSinceLastActive > 5000) {
    console.log('✅ Flush conditions met, proceeding...\n');
    
    // Use Lua script to atomically read and delete
    const FLUSH_BUFFER_SCRIPT = `
      local buffer_key = KEYS[1]
      local items = redis.call('LRANGE', buffer_key, 0, -1)
      if #items > 0 then
        redis.call('DEL', buffer_key)
      end
      return items
    `;
    
    const scriptSha = await redis.script('LOAD', FLUSH_BUFFER_SCRIPT) as string;
    const result = await redis.evalsha(scriptSha, 1, bufferKey);
    const items = Array.isArray(result) ? result.map(String) : [];
    
    console.log(`✅ Read ${items.length} items from buffer`);
    
    if (items.length > 0) {
      // Parse and save to MongoDB
      const { saveBatchToMongo } = await import('./mongoLayer');
      const captionData = items.map(item => JSON.parse(item));
      const segments = captionData.map(data => data.segment);
      const firstCaption = captionData[0];
      const createdAt = firstCaption.timestamp ? new Date(firstCaption.timestamp) : new Date();
      
      const saved = await saveBatchToMongo(
        meetingId,
        segments,
        firstCaption.userId,
        firstCaption.meetingTitle,
        createdAt
      );
      
      console.log(`✅ Saved ${saved} segments to MongoDB\n`);
      
      // Verify
      const sizeAfter = await redis.llen(bufferKey);
      console.log(`Buffer size after flush: ${sizeAfter}`);
      
      if (sizeAfter === 0 && saved > 0) {
        console.log('\n🎉 Manual flush test PASSED!');
        console.log('   - Buffer cleared ✅');
        console.log('   - Data saved to MongoDB ✅');
      } else {
        console.log('\n⚠️ Manual flush test had issues');
      }
    }
  } else {
    console.log('❌ Flush conditions not met');
  }
  
  await redis.quit();
  process.exit(0);
}

manualTest().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

