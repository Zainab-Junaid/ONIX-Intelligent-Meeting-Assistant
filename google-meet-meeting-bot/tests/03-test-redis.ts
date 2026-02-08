/**
 * Test 3: Redis Connection
 * 
 * Run: npx ts-node tests/03-test-redis.ts
 */

import { getRedisClient } from '../src/config/redis';

async function main() {
    console.log('\n⚡ TEST 3: Redis Connection\n' + '='.repeat(50));

    let redis;
    try {
        // Test 3.1: Get client
        console.log('3.1 Getting Redis client...');
        redis = getRedisClient();
        console.log('    ✅ Redis client created');

        // Test 3.2: Ping
        console.log('3.2 Testing connection (PING)...');
        const pong = await redis.ping();
        console.log(`    ✅ Redis responded: ${pong}`);

        // Test 3.3: Check active meetings
        console.log('3.3 Checking active_meetings set...');
        const activeMeetings = await redis.smembers('active_meetings');
        console.log(`    ✅ Active meetings: ${activeMeetings.length}`);
        if (activeMeetings.length > 0) {
            console.log(`    - IDs: ${activeMeetings.slice(0, 5).join(', ')}${activeMeetings.length > 5 ? '...' : ''}`);
        }

        // Test 3.4: Check for any meeting buffers
        console.log('3.4 Checking for meeting buffers...');
        const bufferKeys = await redis.keys('meeting:*:buffer');
        console.log(`    ✅ Buffer keys found: ${bufferKeys.length}`);

        if (bufferKeys.length > 0) {
            console.log('    Buffers with data (means meeting is LIVE):');
            for (const key of bufferKeys.slice(0, 3)) {
                const len = await redis.llen(key);
                console.log(`      - ${key}: ${len} items`);
            }
        } else {
            console.log('    ℹ️ No buffers (no active meetings or all flushed)');
        }

        // Test 3.5: Check for last_active timestamps
        console.log('3.5 Checking last_active timestamps...');
        const activeKeys = await redis.keys('meeting:*:last_active');
        console.log(`    ✅ Last active keys: ${activeKeys.length}`);

        // Test 3.6: Check for dead letter queues
        console.log('3.6 Checking for dead letter queues...');
        const dlqKeys = await redis.keys('meeting:*:failed');
        if (dlqKeys.length > 0) {
            console.log(`    ⚠️ Found ${dlqKeys.length} DLQ keys (failed flushes):`);
            for (const key of dlqKeys) {
                const len = await redis.llen(key);
                console.log(`      - ${key}: ${len} failed items`);
            }
        } else {
            console.log('    ✅ No dead letter queues (good!)');
        }

        // Test 3.7: Check pubsub channels
        console.log('3.7 Checking Pub/Sub channels...');
        try {
            const channels = await redis.pubsub('CHANNELS', 'meeting:*');
            console.log(`    ✅ Active channels: ${(channels as string[]).length}`);
        } catch {
            console.log('    ℹ️ Pub/Sub check not available');
        }

        console.log('\n✅ ALL REDIS TESTS PASSED!\n');

    } catch (error: any) {
        console.error('\n❌ REDIS TEST FAILED!');
        console.error('Error:', error.message);
        console.error('\nPossible fixes:');
        console.error('  1. Is Redis running? Check: netstat -ano | findstr :6379');
        console.error('  2. Is REDIS_URL correct in .env?');
        console.error('  3. Default: redis://localhost:6379');
        process.exit(1);
    }
}

main();
