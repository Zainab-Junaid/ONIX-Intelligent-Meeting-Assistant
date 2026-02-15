// Next.js API route proxies to backend service and filters by userId
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { getBackendUrl } from '@/lib/backend';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  return !!getFirebaseAdmin();
}

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

    initFirebase();

    // First, get user's meetingIds from MeetingJob to ensure accurate filtering
    const { Pool } = require('pg');
    const dbUrl = process.env.DATABASE_URL || 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc';
    
    const botDbPool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 2000,
    });

    let userMeetingIds: string[] = [];
    try {
      const jobResult = await botDbPool.query(`
        SELECT DISTINCT "meetingId"
        FROM "MeetingJob"
        WHERE "userId" = $1 AND "meetingId" IS NOT NULL
      `, [userId]);
      userMeetingIds = jobResult.rows.map((r: any) => r.meetingId).filter(Boolean);
    } catch (dbError: any) {
      console.warn('Could not query MeetingJob for userId filtering:', dbError.message);
    } finally {
      await botDbPool.end().catch(() => {});
    }

    // Fetch all summaries from bot backend
    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/list/summaries`, { 
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch summaries from backend', details: await res.text() }, { status: res.status });
    }

    const allSummaries = await res.json();

    // Filter summaries to only include those for user's meetings
    const filteredSummaries = allSummaries.filter((summary: any) => {
      return userMeetingIds.includes(summary.meetingId);
    });

    return NextResponse.json(filteredSummaries);
  } catch (error: any) {
    console.error('Error fetching bot summaries:', error);
    return NextResponse.json({ error: 'Failed to fetch summaries', details: error?.message }, { status: 500 });
  }
}
