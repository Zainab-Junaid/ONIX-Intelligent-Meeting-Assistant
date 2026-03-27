// Next.js API route for getting meeting job info
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();



export async function GET(
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

    // Forward to backend to get meeting job
    const botResponse = await fetch(`http://127.0.0.1:3001/meeting-job/${meetingId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!botResponse.ok) {
      const errorText = await botResponse.text();
      return NextResponse.json({ 
        error: 'Failed to fetch meeting job', 
        details: errorText 
      }, { status: botResponse.status });
    }

    const jobData = await botResponse.json();

    // Verify user owns this meeting
    if (jobData.userId && jobData.userId !== userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json(jobData);

  } catch (error: any) {
    console.error('Error fetching meeting job:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch meeting job', 
      details: error?.message 
    }, { status: 500 });
  }
}

