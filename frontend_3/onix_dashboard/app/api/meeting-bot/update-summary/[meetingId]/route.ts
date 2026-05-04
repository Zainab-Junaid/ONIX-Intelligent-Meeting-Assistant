// Next.js API route for updating a bot meeting summary
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();



export async function PUT(
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
    const { summaryText } = await request.json();

    if (!summaryText) {
      return NextResponse.json({ error: 'Summary text required' }, { status: 400 });
    }

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

    // Forward to backend to update summary
    const botResponse = await fetch(`http://127.0.0.1:3001/update-summary/${meetingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summaryText })
    });
    
    if (!botResponse.ok) {
      const errorText = await botResponse.text();
      return NextResponse.json({ 
        error: 'Failed to update summary', 
        details: errorText 
      }, { status: botResponse.status });
    }

    const data = await botResponse.json();
    return NextResponse.json({ success: true, ...data });

  } catch (error: any) {
    console.error('Error updating bot meeting summary:', error);
    return NextResponse.json({ 
      error: 'Failed to update summary', 
      details: error?.message 
    }, { status: 500 });
  }
}

