import Redis from 'ioredis';

/**
 * Singleton Redis client instance.
 * 
 * This ensures we have a single connection pool to Redis across the entire application,
 * preventing connection exhaustion and improving performance.
 * 
 * Configuration:
 * - Reads connection details from environment variables
 * - Defaults to localhost:6379 if not specified
 * - Enables automatic reconnection on connection loss
 */
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisPassword = process.env.REDIS_PASSWORD;
    
    redisClient = new Redis(redisUrl, {
      password: redisPassword,
      retryStrategy: (times) => {
        // Exponential backoff: 50ms, 100ms, 200ms, ... max 3s
        const delay = Math.min(times * 50, 3000);
        console.log(`[Redis] Retrying connection in ${delay}ms (attempt ${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false, // Connect immediately
    });

    redisClient.on('connect', () => {
      console.log('[Redis] ✅ Connected to Redis server');
    });

    redisClient.on('ready', () => {
      console.log('[Redis] ✅ Redis client ready');
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] ❌ Redis connection error:', err);
    });

    redisClient.on('close', () => {
      console.log('[Redis] ⚠️ Redis connection closed');
    });

    redisClient.on('reconnecting', (delay: number) => {
      console.log(`[Redis] 🔄 Reconnecting to Redis in ${delay}ms`);
    });
  }

  return redisClient;
}

/**
 * Gracefully close the Redis connection.
 * Call this during application shutdown.
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] ✅ Redis connection closed gracefully');
  }
}

// Export the client getter as default for convenience
export default getRedisClient;

