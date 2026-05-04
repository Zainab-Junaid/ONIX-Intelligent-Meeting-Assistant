// Next.js API route for generating summary for a bot meeting
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();



export async function POST(
  request: NextRequest,
  { params }: { params: { meetingId: string } }
) {
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

    const meetingId = params.meetingId;

    // Verify user owns this meeting
    const { Pool } = require('pg');
    const botDbPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc'
    });

    try {
      const jobResult = await botDbPool.query(`
        SELECT "meetingId"
        FROM "MeetingJob"
        WHERE "meetingId" = $1 AND "userId" = $2
      `, [meetingId, userId]);

      if (jobResult.rows.length === 0) {
        await botDbPool.end();
        return NextResponse.json({ error: 'Meeting not found or access denied' }, { status: 404 });
      }
    } catch (dbError: any) {
      await botDbPool.end();
      return NextResponse.json({ error: 'Failed to verify meeting ownership', details: dbError.message }, { status: 500 });
    }

    await botDbPool.end();

    // Forward to backend to generate summary
    const botResponse = await fetch(`http://127.0.0.1:3001/debug/generate-summary/${meetingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!botResponse.ok) {
      const errorText = await botResponse.text();
      return NextResponse.json({ 
        error: 'Failed to generate summary', 
        details: errorText 
      }, { status: botResponse.status });
    }

    const data = await botResponse.json();
    return NextResponse.json({ success: true, ...data });

  } catch (error: any) {
    console.error('Error generating bot meeting summary:', error);
    return NextResponse.json({ 
      error: 'Failed to generate summary', 
      details: error?.message 
    }, { status: 500 });
  }
}

