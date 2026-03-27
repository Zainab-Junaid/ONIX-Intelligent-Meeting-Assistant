// Next.js API route for starting meeting bot
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();



// Meeting Bot Integration

export async function POST(request: NextRequest) {
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

    // Get meeting URL, title, and language from request body
    const { meetingUrl, meetingTitle, language } = await request.json();
    if (!meetingUrl) {
      return NextResponse.json({ error: 'Meeting URL required' }, { status: 400 });
    }

    // Forward to backend to start container (backend will create the job if needed)
    const botResponse = await fetch('http://127.0.0.1:3001/submit-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: meetingUrl,
        userId,
        meetingTitle: meetingTitle || 'Untitled Meeting',
        language: language || 'English'
      })
    });
    
    if (!botResponse.ok) {
      throw new Error('Bot failed to start');
    }

    const data = await botResponse.json().catch(() => ({}));
    return NextResponse.json({ success: true, ...data });

  } catch (error) {
    console.error('Error starting meeting bot:', error);
    return NextResponse.json({ error: 'Failed to start meeting bot' }, { status: 500 });
  }
}
