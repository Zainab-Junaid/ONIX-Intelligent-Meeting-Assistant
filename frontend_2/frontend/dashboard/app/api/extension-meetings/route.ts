import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require('../../../backend/firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

export async function GET(request: NextRequest) {
  try {
    // Get Firebase token from headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    // Get Firestore instance
    const db = admin.firestore();
    
    // Query extension meetings from Firestore
    const meetingsRef = db.collection('users').doc(userId).collection('meetings');
    const querySnapshot = await meetingsRef.orderBy('createdAt', 'desc').get();
    
    const allMeetings = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || 'Untitled meeting',
        transcript: data.transcript || '',
        createdAt: data.createdAt?.toDate() || new Date(),
        duration: data.duration || '',
        meetingURL: data.meetingURL || '',
        autosave: data.autosave || false,
        // Add source identifier
        source: 'extension'
      };
    });

    // Deduplicate meetings by meetingURL - keep the most recent one
    const uniqueMeetings = new Map();
    allMeetings.forEach(meeting => {
      const key = meeting.meetingURL || meeting.id; // Use meetingURL as key, fallback to id
      const existing = uniqueMeetings.get(key);
      
      if (!existing || meeting.createdAt > existing.createdAt) {
        uniqueMeetings.set(key, meeting);
      }
    });

    const meetings = Array.from(uniqueMeetings.values());

    return NextResponse.json(meetings);
  } catch (error: any) {
    console.error('Error fetching extension meetings:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch extension meetings', 
      details: error?.message 
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const { meetingId, title } = await request.json();
    
    if (!meetingId || !title) {
      return NextResponse.json({ error: 'meetingId and title are required' }, { status: 400 });
    }

    const db = admin.firestore();
    const meetingRef = db.collection('users').doc(userId).collection('meetings').doc(meetingId);
    
    await meetingRef.update({
      title,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true, title });
  } catch (error: any) {
    console.error('Error updating extension meeting title:', error);
    return NextResponse.json({ 
      error: 'Failed to update meeting title', 
      details: error?.message 
    }, { status: 500 });
  }
}

