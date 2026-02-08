// Next.js API route for getting user action items from bot database
// Uses a properly managed connection pool that's reused across requests
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require('../../../../backend/firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Singleton pool management for Next.js serverless environment
const { Pool } = require('pg');

// Use global to prevent pool recreation in hot reloads
const globalForPg = globalThis as unknown as { pgPool: typeof Pool | undefined };

function getPool() {
  if (!globalForPg.pgPool) {
    globalForPg.pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5, // Limit connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Log pool errors
    globalForPg.pgPool.on('error', (err: Error) => {
      console.error('PostgreSQL pool error:', err);
    });
  }
  return globalForPg.pgPool;
}

export async function GET(request: NextRequest) {
  // Require DATABASE_URL to be set - no hardcoded credentials
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable not set');
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    // Get Firebase token from headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];

    // Verify Firebase token
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    // Get user's action items from bot database (MeetingJobs that are action items)
    const pool = getPool();
    const result = await pool.query(`
      SELECT "id", "meetingId", "meetingTitle" as "item", "status", "createdAt"
      FROM "MeetingJob"
      WHERE "meetingUrl" LIKE 'action-item-%'
      ORDER BY "createdAt" DESC
    `);

    return NextResponse.json(result.rows);

  } catch (error: any) {
    console.error('Error fetching action items:', error);
    return NextResponse.json({ error: 'Failed to fetch action items', details: error?.message }, { status: 500 });
  }
}
