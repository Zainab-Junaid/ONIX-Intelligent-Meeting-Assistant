import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  return !!getFirebaseAdmin();
}

/**
 * Update meeting document with meetingId
 * Called by backend when bot completes
 * POST /api/meetings/update-meeting-id
 */
export async function POST(request: NextRequest) {
  try {
    // Security: Only allow from localhost/backend
    // In production, add additional security checks
    
    const { jobId, meetingId } = await request.json();
    if (!jobId || !meetingId) {
      return NextResponse.json({ error: 'jobId and meetingId required' }, { status: 400 });
    }

    initFirebase();
    const db = admin.firestore();
    
    // Find meeting by jobId and update with meetingId
    const jobDoc = await db.collection('meetings').doc(jobId).get();
    
    if (jobDoc.exists) {
      const jobData = jobDoc.data();
      // Create/update meeting document with meetingId as key
      await db.collection('meetings').doc(meetingId).set({
        meetingId,
        jobId,
        userId: jobData?.userId,
        meetingUrl: jobData?.meetingUrl,
        meetingTitle: jobData?.meetingTitle,
        status: 'completed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      
      console.log(`✅ Updated meeting document: jobId=${jobId} -> meetingId=${meetingId}`);
      return NextResponse.json({ success: true });
    } else {
      console.log(`⚠️ Meeting with jobId ${jobId} not found`);
      return NextResponse.json({ 
        message: 'Meeting not found',
        skipped: true
      });
    }

  } catch (error: any) {
    console.error('Error updating meeting ID:', error);
    return NextResponse.json({ 
      error: 'Failed to update meeting ID', 
      details: error?.message 
    }, { status: 500 });
  }
}
