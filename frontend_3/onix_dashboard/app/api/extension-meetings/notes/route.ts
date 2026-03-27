import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();



// DELETE - Delete a note
export async function DELETE(request: NextRequest) {
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

    // Get meeting ID and note ID from query params
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    const noteId = searchParams.get('noteId');
    
    if (!meetingId || !noteId) {
      return NextResponse.json({ error: 'Meeting ID and note ID are required' }, { status: 400 });
    }

    const db = admin.firestore();
    const docRef = db.collection('users').doc(userId).collection('meetings').doc(meetingId);
    
    // Get current document
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const data = docSnap.data();
    const notes = data?.notes || [];
    
    // Remove the note with matching ID
    const updatedNotes = notes.filter((note: any) => note.id !== noteId);
    
    // Update document
    await docRef.update({
      notes: updatedNotes,
      updatedAt: admin.firestore.Timestamp.now()
    });

    console.log(`✅ Note ${noteId} deleted from meeting ${meetingId}`);

    return NextResponse.json({ 
      success: true,
      message: 'Note deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting note:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Failed to delete note'
    }, { status: 500 });
  }
}

// PUT - Update a note
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

    // Get meeting ID, note ID, and updated note data from request body
    const { meetingId, noteId, text, screenshotUrl, deleteScreenshot } = await request.json();
    
    if (!meetingId || !noteId) {
      return NextResponse.json({ error: 'Meeting ID and note ID are required' }, { status: 400 });
    }

    const db = admin.firestore();
    const docRef = db.collection('users').doc(userId).collection('meetings').doc(meetingId);
    
    // Get current document
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const data = docSnap.data();
    const notes = data?.notes || [];
    
    // Find and update the note
    const updatedNotes = notes.map((note: any) => {
      if (note.id === noteId) {
        const updatedNote: any = {
          ...note,
          updatedAt: admin.firestore.Timestamp.now()
        };
        
        // Update text if provided
        if (text !== undefined) {
          updatedNote.text = text;
        }
        
        // Delete screenshot if requested, otherwise update if provided
        if (deleteScreenshot === true) {
          updatedNote.screenshotUrl = null;
          updatedNote.screenshotThumbnail = null;
        } else if (screenshotUrl !== undefined) {
          updatedNote.screenshotUrl = screenshotUrl;
        }
        
        return updatedNote;
      }
      return note;
    });
    
    // Update document
    await docRef.update({
      notes: updatedNotes,
      updatedAt: admin.firestore.Timestamp.now()
    });

    console.log(`✅ Note ${noteId} updated in meeting ${meetingId}`);

    return NextResponse.json({ 
      success: true,
      message: 'Note updated successfully'
    });

  } catch (error: any) {
    console.error('❌ Error updating note:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Failed to update note'
    }, { status: 500 });
  }
}

