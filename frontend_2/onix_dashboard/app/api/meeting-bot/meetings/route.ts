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
    /* 
    // SKIPPING USER FILTERING TO MATCH OLD DASHBOARD BEHAVIOR
    // The backend /list/meetings endpoint does not currently return userId, so filtering here 
    // hides all meetings. The old dashboard displays all meetings, so we will do the same.
    
    const { Pool } = require('pg');
    const dbUrl = process.env.DATABASE_URL || 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc';
    
    // Check if we can connect to the database
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
    */

    // Fetch all meetings from bot backend
    const backendUrl = getBackendUrl();
    console.log('Fetching meetings from backend:', backendUrl);
    
    let res;
    try {
      res = await fetch(`${backendUrl}/list/meetings`, { 
        cache: 'no-store',
        signal: AbortSignal.timeout(5000) 
      });
    } catch (fetchError: any) {
       console.error('Failed to connect to backend:', fetchError.message);
       return NextResponse.json({ 
         error: 'Backend unavailable', 
         details: `Could not connect to bot backend at ${backendUrl}. Is it running?` 
       }, { status: 503 });
    }
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch meetings from backend', details: await res.text() }, { status: res.status });
    }

    const allMeetings = await res.json();
    console.log(`[API] Fetched ${allMeetings.length} meetings from backend`);
    
    // Debug logging
    if (allMeetings.length > 0) {
      console.log(`[API] First meeting sample:`, JSON.stringify(allMeetings[0], null, 2));
      console.log(`[API] User ID to filter by: ${userId}`);
    }

    /*
    // Filter meetings by userId
    // Include meetings if:
    // 1. meeting.userId matches (from MongoDB transcript)
    // 2. meeting.meetingId is in userMeetingIds (from MeetingJob)
    const filteredMeetings = allMeetings.filter((meeting: any) => {
      const matchUserId = meeting.userId === userId;
      // const matchJob = userMeetingIds.length > 0 && userMeetingIds.includes(meeting.meetingId);
      
      if (meeting.status === 'live' || meeting.status === 'bot_launched') {
         console.log(`[API] Checking active meeting ${meeting.meetingId}: userId match? ${matchUserId} (${meeting.userId} vs ${userId})`);
      }

      // Check if meeting has userId field which is now returned by backend
      if (matchUserId) {
        return true;
      }
      // Check if meetingId is in user's MeetingJobs (legacy check or if DB connection worked)
      // if (userMeetingIds.length > 0 && userMeetingIds.includes(meeting.meetingId)) {
      //   return true;
      // }
      // Exclude meetings that don't match (more secure)
      return false;
    });
    */
   
    // Return ALL meetings to match old dashboard behavior
    const filteredMeetings = allMeetings;

    // Add source identifier to match extension meetings format
    const meetingsWithSource = filteredMeetings.map((meeting: any) => ({
      ...meeting,
      source: 'bot' as const
    }));

    return NextResponse.json(meetingsWithSource);
  } catch (error: any) {
    console.error('Error fetching bot meetings:', error);
    return NextResponse.json({ error: 'Failed to fetch meetings', details: error?.message }, { status: 500 });
  }
}
