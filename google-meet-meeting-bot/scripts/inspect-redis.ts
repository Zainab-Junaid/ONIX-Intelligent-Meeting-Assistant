import Redis from 'ioredis';

async function main() {
    console.log('🔍 Connecting to Redis with IORedis...');

    // Connect to Redis (using default Docker port 6379)
    const redis = new Redis('redis://localhost:6379');

    redis.on('error', (err) => console.error('Redis Client Error', err));
    redis.on('connect', () => console.log('✅ Connected to Redis'));

    // const meetingId = '0ef4581f-e457-414c-bb4b-7009cb9348d5'; // Mouri Ran

    const activeMeetingsKey = 'active_meetings';
    // 5. List all active meetings
    const allActive = await redis.smembers(activeMeetingsKey);
    console.log(`\nAll Active Meetings (${allActive.length}):`, allActive);

    for (const id of allActive) {
        console.log(`\nChecking keys for meeting: ${id}`);
        const bufferKey = `meeting:${id}:buffer`;
        const bufferLen = await redis.llen(bufferKey);
        console.log(`- Buffer Length (${bufferKey}): ${bufferLen}`);
    }

    redis.disconnect();
}

main().catch(console.error);
