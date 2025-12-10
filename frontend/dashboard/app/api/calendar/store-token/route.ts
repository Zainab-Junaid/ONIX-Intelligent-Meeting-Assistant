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

    // Get request body
    const body = await request.json();
    const { accessToken, refreshToken } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
    }

    // Get Firestore instance
    const db = admin.firestore();
    
    // Store calendar access token in user document
    await db.collection('users').doc(userId).set({
      calendarAccessToken: accessToken,
      calendarRefreshToken: refreshToken || null,
      calendarAccessGranted: true,
      calendarAccessGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true, message: 'Calendar access token stored' });
  } catch (error: any) {
    console.error('Error storing calendar token:', error);
    return NextResponse.json({ 
      error: 'Failed to store calendar token', 
      details: error?.message 
    }, { status: 500 });
  }
}


