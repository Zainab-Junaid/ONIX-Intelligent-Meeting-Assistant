import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { getBackendUrl } from '@/lib/backend';
import { getFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  return !!getFirebaseAdmin();
}

/**
 * Update meeting summary
 * PUT /api/meetings/update-summary
 */
export async function PUT(request: NextRequest) {
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

    // Get meeting ID and updated summary text from request body
    const { meetingId, summaryText } = await request.json();
    if (!meetingId || !summaryText) {
      return NextResponse.json({
        error: 'Meeting ID and summary text required'
      }, { status: 400 });
    }

    initFirebase();

    // Update in backend database
    const backendUrl = getBackendUrl();
    let updated = false;
    let lastError: any = null;
    let lastResponse: Response | null = null;

    try {
      const response = await fetch(`${backendUrl}/update-summary/${meetingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summaryText }),
          signal: AbortSignal.timeout(10000)
        });

      if (response.ok) {
        const data = await response.json();
        updated = true;
        console.log(`✅ Summary updated successfully via ${backendUrl}`);
      } else {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
        lastResponse = response;
        lastError = errorData;
        console.log(`⚠️ Backend returned error (${response.status}):`, errorData);

        // If 404, try direct database update immediately
        if (response.status === 404) {
          console.log(`🔄 Backend endpoint not found (404), trying direct database update...`);

          // Require DATABASE_URL - no hardcoded credentials
          if (!process.env.DATABASE_URL) {
            console.error('DATABASE_URL not set, cannot update directly');
          } else {

          let dbPool: any = null;
          try {
            const { Pool } = require('pg');
            dbPool = new Pool({
              connectionString: process.env.DATABASE_URL,
              connectionTimeoutMillis: 5000,
              max: 2,
            });

            const checkResult = await dbPool.query(
              'SELECT id FROM "MeetingSummary" WHERE "meetingId" = $1 LIMIT 1',
              [meetingId]
            );

            if (checkResult.rows.length > 0) {
              await dbPool.query(
                'UPDATE "MeetingSummary" SET "summaryText" = $1 WHERE "meetingId" = $2',
                [summaryText, meetingId]
              );
              console.log(`✅ Summary updated directly in database for meeting ${meetingId}`);
              updated = true;
              await dbPool.end();
            } else {
              await dbPool.query(
                `INSERT INTO "MeetingSummary" ("id", "meetingId", "summaryText", "generatedAt", "model", "isFallback")
                 VALUES (gen_random_uuid(), $1, $2, NOW(), 'manual-edit', false)`,
                [meetingId, summaryText]
              );
              console.log(`✅ Summary created directly in database for meeting ${meetingId}`);
              updated = true;
              await dbPool.end();
            }
          } catch (dbError: any) {
            console.error(`❌ Direct database update failed:`, dbError);
            if (dbPool) await dbPool.end().catch(() => {});
          }
        }
      }
      }
    } catch (err: any) {
      console.log(`⚠️ Failed to reach backend at ${backendUrl}:`, err.message);
      lastError = err;
    }


    // If still not updated, at least update Firestore as a fallback
    if (!updated) {
      console.log(`⚠️ All backend attempts failed, updating Firestore as fallback...`);
      try {
        const db = admin.firestore();
        const meetingDoc = await db.collection('meetings').doc(meetingId).get();
        if (meetingDoc.exists) {
          await meetingDoc.ref.update({
            'summary.content': summaryText,
            'summary.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
            'summary.edited': true,
          });
          console.log(`✅ Summary updated in Firestore as fallback for meeting ${meetingId}`);
          updated = true;
        }
      } catch (firestoreError: any) {
        console.error(`❌ Firestore update also failed:`, firestoreError);
      }
    }

    if (!updated) {
      const errorMessage = lastResponse
        ? (lastError?.error || lastError?.details || `Backend returned ${lastResponse.status}. ${lastResponse.status === 404 ? 'The /update-summary endpoint may not be registered. Please restart the backend server.' : 'Please check backend logs.'}`)
        : (lastError?.message || 'Could not reach backend service. Make sure the backend is running on port 3001.');

      return NextResponse.json({
        error: 'Failed to update summary',
        message: errorMessage,
        details: lastError,
        suggestion: lastResponse?.status === 404
          ? 'The backend server may need to be restarted to register the new /update-summary endpoint. The summary was not saved.'
          : 'Please check if the backend is running and accessible.'
      }, { status: lastResponse?.status || 500 });
    }

    // Also update in Firestore if the meeting document exists
    const db = admin.firestore();
    const meetingDoc = await db.collection('meetings').doc(meetingId).get();
    if (meetingDoc.exists) {
      await meetingDoc.ref.update({
        'summary.content': summaryText,
        'summary.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        'summary.edited': true,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Summary updated successfully'
    });

  } catch (error: any) {
    console.error('Error updating summary:', error);
    return NextResponse.json({
      error: 'Failed to update summary',
      details: error?.message
    }, { status: 500 });
  }
}
