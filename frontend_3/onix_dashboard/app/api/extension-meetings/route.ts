import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
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

    // Get Firestore instance
    const db = admin.firestore();
    
    // Query extension meetings from Firestore
    const meetingsRef = db.collection('users').doc(userId).collection('meetings');
    
    let querySnapshot;
    try {
      // Try to order by createdAt first (requires index)
      querySnapshot = await meetingsRef.orderBy('createdAt', 'desc').get();
    } catch (error: any) {
      // If index doesn't exist, fall back to ordering by updatedAt or no ordering
      console.warn('Could not order by createdAt, trying updatedAt:', error.message);
      try {
        querySnapshot = await meetingsRef.orderBy('updatedAt', 'desc').get();
      } catch (error2: any) {
        // If that also fails, just get all documents and sort in memory
        console.warn('Could not order by updatedAt, fetching all and sorting:', error2.message);
        querySnapshot = await meetingsRef.get();
      }
    }
    
    const allMeetings = querySnapshot.docs.map(doc => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.() || data.createdAt || new Date();
      const updatedAt = data.updatedAt?.toDate?.() || data.updatedAt || createdAt;
      
      return {
        id: doc.id,
        title: data.title || 'Untitled meeting',
        transcript: data.transcript || '',
        createdAt: createdAt instanceof Date ? createdAt : new Date(createdAt),
        duration: data.duration || '',
        meetingURL: data.meetingURL || '',
        autosave: data.autosave || false,
        summary: data.summary || null,
        actionItems: data.actionItems || [],
        notes: data.notes || [],
        recordingUrl: data.recordingUrl || '',
        recordingStoragePath: data.recordingStoragePath || '',
        source: 'extension' as const
      };
    });
    
    // If we couldn't use Firestore ordering, sort in memory
    if (allMeetings.length > 0 && !querySnapshot.docs[0].data().createdAt) {
      allMeetings.sort((a, b) => {
        const aTime = a.createdAt.getTime();
        const bTime = b.createdAt.getTime();
        return bTime - aTime; // Descending order
      });
    }

    // Deduplication logic removed to show all transcripts (helpful for debugging)
    /*
    const uniqueMeetings = new Map();
    allMeetings.forEach(meeting => {
      const key = meeting.meetingURL || meeting.id; // Use meetingURL as key, fallback to id
      const existing = uniqueMeetings.get(key);
      
      if (!existing || meeting.createdAt > existing.createdAt) {
        uniqueMeetings.set(key, meeting);
      }
    });

    const meetings = Array.from(uniqueMeetings.values());
    */
    const meetings = allMeetings;

    return NextResponse.json(meetings);
  } catch (error: any) {
    console.error('Error fetching extension meetings:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch extension meetings', 
      details: error?.message 
    }, { status: 500 });
  }
}

