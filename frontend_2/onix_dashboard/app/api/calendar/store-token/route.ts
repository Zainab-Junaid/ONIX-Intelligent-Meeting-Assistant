import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { getFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  return !!getFirebaseAdmin();
}

/**
 * Manually store calendar token
 * POST /api/calendar/store-token
 */
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

    const { accessToken, refreshToken, expiresIn } = await request.json();

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token required' }, { status: 400 });
    }

    // Initialize Firebase
    initFirebase();
    const db = admin.firestore();

    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    await db.collection('users').doc(userId).set({
      calendarAccessToken: accessToken,
      calendarRefreshToken: refreshToken || null,
      calendarAccessGranted: true,
      calendarAccessGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
      calendarTokenExpiresAt: expiresAt,
    }, { merge: true });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error storing token:', error);
    return NextResponse.json({ 
      error: 'Failed to store token', 
      details: error?.message 
    }, { status: 500 });
  }
}
