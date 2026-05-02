import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();

const RECORDING_MAX_SIZE = 500 * 1024 * 1024; // 500 MB
const SIGNED_URL_EXPIRY_DAYS = 7;

function getAdminApp() {
  return admin.app();
}

export async function POST(request: NextRequest) {
  try {
    getAdminApp();
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const formData = await request.formData();
    const meetingId = formData.get('meetingId') as string | null;
    const file = formData.get('recording') as File | null;

    if (!meetingId || !file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'meetingId and recording file are required' },
        { status: 400 }
      );
    }

    if (file.size > RECORDING_MAX_SIZE) {
      return NextResponse.json(
        { error: 'Recording file too large' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `users/${userId}/meetings/${meetingId}/recording.webm`;

    const bucket = admin.storage().bucket();
    const storageFile = bucket.file(storagePath);

    await storageFile.save(buffer, {
      metadata: { contentType: 'video/webm' },
      resumable: false,
    });

    const [signedUrl] = await storageFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + SIGNED_URL_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    });

    const db = admin.firestore();
    const meetingRef = db.collection('users').doc(userId).collection('meetings').doc(meetingId);
    await meetingRef.set(
      {
        recordingUrl: signedUrl,
        recordingStoragePath: storagePath,
        recordingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, recordingUrl: signedUrl });
  } catch (error: any) {
    console.error('Error uploading recording:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload recording',
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
