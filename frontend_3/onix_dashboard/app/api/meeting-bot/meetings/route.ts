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

    // Fetch all meetings from bot backend (graceful when backend is down)
    const botBase = process.env.BOT_BACKEND_URL || 'http://127.0.0.1:3001';
    let allMeetings: any[] = [];
    try {
      const res = await fetch(`${botBase}/list/meetings`, { cache: 'no-store' });
      if (!res.ok) {
        console.warn('Bot backend returned non-OK for /list/meetings:', res.status);
        return NextResponse.json([]);
      }
      allMeetings = await res.json();
    } catch (err: any) {
      if (err?.code === 'ECONNREFUSED' || err?.message?.includes('fetch failed')) {
        console.warn('Meeting bot backend unreachable at', botBase, '- returning empty meetings list.');
      } else {
        console.error('Error fetching bot meetings from backend:', err);
      }
      return NextResponse.json([]);
    }

    // Filter meetings by userId
    // Include meetings if:
    // 1. meeting.userId matches (from MongoDB transcript)
    // 2. meeting.meetingId is in userMeetingIds (from MeetingJob)
    const filteredMeetings = allMeetings.filter((meeting: any) => {
      // Check if meeting has userId field from MongoDB that matches
      if (meeting.userId === userId) {
        return true;
      }
      // Check if meetingId is in user's MeetingJobs
      if (userMeetingIds.length > 0 && userMeetingIds.includes(meeting.meetingId)) {
        return true;
      }
      // Exclude meetings that don't match (more secure)
      return false;
    });

    console.log(`DEBUG: allMeetings=${allMeetings.length}, filteredMeetings=${filteredMeetings.length}, userMeetingIds=${userMeetingIds.length}`);

    // Normalize and add source (avoids duplicate keys from backend)
    const meetingsWithSource = filteredMeetings.map((meeting: any) => ({
      meetingId: meeting.meetingId,
      title: meeting.title,
      createdAtMs: meeting.createdAtMs,
      meetingUrl: meeting.meetingUrl ?? null,
      status: meeting.status,
      startTime: meeting.startTime ?? null,
      endTime: meeting.endTime ?? null,
      segmentCount: meeting.segmentCount ?? 0,
      totalSpeakers: meeting.totalSpeakers ?? 0,
      totalDurationSeconds: meeting.totalDurationSeconds ?? null,
      segments: Array.isArray(meeting.segments) ? meeting.segments : [],
      userId: meeting.userId ?? undefined,
      source: 'bot' as const
    }));

    return NextResponse.json(meetingsWithSource);
  } catch (error: any) {
    console.error('Error fetching bot meetings:', error);
    return NextResponse.json({ error: 'Failed to fetch meetings', details: error?.message }, { status: 500 });
  }
}
