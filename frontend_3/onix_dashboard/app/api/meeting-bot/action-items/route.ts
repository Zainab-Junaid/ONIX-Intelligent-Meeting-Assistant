// Next.js API route for getting user action items from bot database
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();



// Database connection
const { Pool } = require('pg');

const botDbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc'
});

export async function GET(request: NextRequest) {
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
    // Filter by userId to only show action items for the authenticated user
    const result = await botDbPool.query(`
      SELECT "id", "meetingId", "meetingUrl" as "item", "status", "createdAt"
      FROM "MeetingJob"
      WHERE "meetingUrl" LIKE 'action-item-%'
        AND ("userId" = $1 OR "userId" IS NULL)
      ORDER BY "createdAt" DESC
    `, [userId]);

    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('Error fetching action items:', error);
    return NextResponse.json({ error: 'Failed to fetch action items', details: (error as Error).message }, { status: 500 });
  }
}
