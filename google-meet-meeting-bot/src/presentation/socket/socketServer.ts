import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Segment } from '../../domain/transcription/models';

/**
 * Socket Server with Redis Pub/Sub Integration + Redis Adapter for Multi-Instance Support
 * 
 * This module bridges the gap between the flushWorker (separate process) and the frontend Dashboard.
 * 
 * Architecture:
 * 1. flushWorker publishes events to Redis channel "meeting:transcript_update" after saving to MongoDB
 * 2. This server subscribes to that Redis channel
 * 3. When a message is received, it broadcasts to the appropriate Socket.IO room
 * 4. Frontend clients join rooms by meetingId to receive real-time updates
 * 
 * Multi-Instance Scalability:
 * - Uses Redis adapter to sync Socket.IO state across multiple backend instances
 * - Clients can connect to any instance and receive events from any other instance
 * - Rooms are shared via Redis pub/sub
 * 
 * IMPORTANT: Redis requires a dedicated connection for subscriptions (SUBSCRIBE command).
 * This connection cannot be used for regular Redis commands.
 */

const REDIS_CHANNEL = 'meeting:transcript_update';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

/**
 * Payload structure for Redis Pub/Sub messages
 */
interface TranscriptUpdatePayload {
  meetingId: string;
  segments: Segment[];
  userId?: string;
  meetingTitle?: string;
}

let io: SocketIOServer | null = null;
let redisSubscriber: Redis | null = null;

/**
 * Initialize Socket.IO server and Redis subscriber
 * 
 * @param httpServer - The HTTP server instance from Express
 */
export function initializeSocketServer(httpServer: HttpServer): void {
  // Initialize Socket.IO with CORS enabled
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        process.env.FRONTEND_URL || ''
      ].filter(Boolean),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  console.log('[Socket] ✅ Socket.IO server initialized');

  // Configure Redis Adapter for multi-instance scaling
  // This allows multiple backend instances to share Socket.IO rooms via Redis pub/sub
  try {
    const pubClient = new Redis(REDIS_URL, {
      password: REDIS_PASSWORD,
      maxRetriesPerRequest: null, // Required for adapter mode
    });

    const subClient = pubClient.duplicate();

    io.adapter(createAdapter(pubClient, subClient));
    console.log('[Socket] ✅ Redis adapter configured for multi-instance support');
  } catch (adapterError) {
    console.error('[Socket] ❌ Failed to configure Redis adapter:', adapterError);
    console.warn('[Socket] ⚠️ Running in single-instance mode (no horizontal scaling)');
  }

  // Handle client connections
  io.on('connection', (socket) => {
    console.log(`[Socket] ✅ Client connected: ${socket.id}`);

    // Handle join_meeting event
    socket.on('join_meeting', (meetingId: string) => {
      if (!meetingId || typeof meetingId !== 'string') {
        console.warn(`[Socket] ⚠️ Invalid meetingId from client ${socket.id}`);
        return;
      }

      socket.join(meetingId);
      console.log(`[Socket] User ${socket.id} joined meeting: ${meetingId}`);

      // Acknowledge join
      socket.emit('joined_meeting', { meetingId });
    });

    // Handle leave_meeting event
    socket.on('leave_meeting', (meetingId: string) => {
      if (!meetingId || typeof meetingId !== 'string') {
        return;
      }

      socket.leave(meetingId);
      console.log(`[Socket] User ${socket.id} left meeting: ${meetingId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // Initialize Redis subscriber (dedicated connection for subscriptions)
  initializeRedisSubscriber();

  console.log('[Socket] ✅ Socket server ready for connections');
}

/**
 * Initialize Redis subscriber connection
 * 
 * CRITICAL: Redis requires a dedicated connection for SUBSCRIBE commands.
 * This connection cannot execute regular Redis commands (only pub/sub commands).
 */
function initializeRedisSubscriber(): void {
  // Create a dedicated Redis client for subscriptions
  redisSubscriber = new Redis(REDIS_URL, {
    password: REDIS_PASSWORD,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      console.log(`[Socket] Redis subscriber retrying in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: null, // Required for pub/sub mode
  });

  redisSubscriber.on('connect', () => {
    console.log('[Socket] ✅ Redis subscriber connected');
  });

  redisSubscriber.on('ready', () => {
    console.log('[Socket] ✅ Redis subscriber ready');
    subscribeToTranscriptUpdates();
  });

  redisSubscriber.on('error', (err) => {
    console.error('[Socket] ❌ Redis subscriber error:', err);
  });

  redisSubscriber.on('close', () => {
    console.log('[Socket] ⚠️ Redis subscriber connection closed');
  });

  redisSubscriber.on('reconnecting', (delay: number) => {
    console.log(`[Socket] 🔄 Redis subscriber reconnecting in ${delay}ms`);
  });
}

/**
 * Subscribe to Redis channel for transcript updates
 */
function subscribeToTranscriptUpdates(): void {
  if (!redisSubscriber) {
    console.error('[Socket] ❌ Cannot subscribe: Redis subscriber not initialized');
    return;
  }

  redisSubscriber.subscribe(REDIS_CHANNEL, (err, count) => {
    if (err) {
      console.error(`[Socket] ❌ Failed to subscribe to ${REDIS_CHANNEL}:`, err);
      return;
    }
    console.log(`[Socket] ✅ Subscribed to Redis channel: ${REDIS_CHANNEL} (${count} total subscriptions)`);
  });

  // Handle incoming messages from Redis
  redisSubscriber.on('message', (channel: string, message: string) => {
    if (channel !== REDIS_CHANNEL) {
      return; // Ignore other channels
    }

    try {
      const payload: TranscriptUpdatePayload = JSON.parse(message);
      const { meetingId, segments } = payload;

      if (!meetingId || !Array.isArray(segments)) {
        console.warn(`[Socket] ⚠️ Invalid payload structure:`, payload);
        return;
      }

      console.log(
        `[Socket] Broadcasting update to room meeting:${meetingId} (${segments.length} segments)`
      );

      // Broadcast to all clients in the meeting room
      if (io) {
        io.to(meetingId).emit('transcript_update', {
          meetingId,
          segments,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.error('[Socket] ❌ Socket.IO server not initialized');
      }
    } catch (error) {
      console.error(`[Socket] ❌ Failed to parse Redis message:`, error);
      console.error(`[Socket] Raw message:`, message.substring(0, 200));
    }
  });
}

/**
 * Get the Socket.IO server instance (for emitting events from other modules).
 */
export function getSocketIO(): SocketIOServer | null {
  return io;
}

/**
 * Gracefully close Socket.IO and Redis connections
 */
export async function closeSocketServer(): Promise<void> {
  console.log('[Socket] 🛑 Closing socket server...');

  if (io) {
    io.close();
    io = null;
    console.log('[Socket] ✅ Socket.IO server closed');
  }

  if (redisSubscriber) {
    await redisSubscriber.quit();
    redisSubscriber = null;
    console.log('[Socket] ✅ Redis subscriber closed');
  }
}
