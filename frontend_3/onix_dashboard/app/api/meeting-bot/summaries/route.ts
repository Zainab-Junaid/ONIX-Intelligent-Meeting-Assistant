// Next.js API route proxies to backend service and filters by userId
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin if not already initialized
getFirebaseAdmin();

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

    // First, get user's meetingIds from MeetingJob to ensure accurate filtering
    const { Pool } = require('pg');
    const botDbPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc'
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
      await botDbPool.end();
    }

    // Fetch all summaries from bot backend (graceful when backend is down)
    const botBase = process.env.BOT_BACKEND_URL || 'http://127.0.0.1:3001';
    let allSummaries: any[] = [];
    try {
      const res = await fetch(`${botBase}/list/summaries`, { cache: 'no-store' });
      if (!res.ok) {
        console.warn('Bot backend returned non-OK for /list/summaries:', res.status);
        return NextResponse.json([]);
      }
      allSummaries = await res.json();
    } catch (err: any) {
      if (err?.code === 'ECONNREFUSED' || err?.message?.includes('fetch failed')) {
        console.warn('Meeting bot backend unreachable at', botBase, '- returning empty summaries list.');
      } else {
        console.error('Error fetching bot summaries from backend:', err);
      }
      return NextResponse.json([]);
    }

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
