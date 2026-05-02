import { NextRequest, NextResponse } from 'next/server';
import { AssemblyAI } from 'assemblyai';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();

// Initialize Firebase Admin if not already initialized


/**
 * POST /api/extension-meetings/transcribe-audio
 * Accepts audio chunks and returns transcription using AssemblyAI
 * 
 * This endpoint processes audio chunks and returns real-time transcription
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

    // Get audio data from request
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const meetingId = formData.get('meetingId') as string;
    const isFinal = formData.get('isFinal') === 'true';

    if (!audioFile || !meetingId) {
      return NextResponse.json({ 
        error: 'Audio file and meetingId are required' 
      }, { status: 400 });
    }

    // Check if AssemblyAI API key is configured
    if (!process.env.ASSEMBLYAI_API_KEY) {
      return NextResponse.json({ 
        error: 'ASSEMBLYAI_API_KEY not configured' 
      }, { status: 500 });
    }

    // Initialize AssemblyAI client
    const client = new AssemblyAI({
      apiKey: process.env.ASSEMBLYAI_API_KEY,
    });

    // Convert File to Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`🎤 Transcribing audio chunk for meeting ${meetingId}, size: ${buffer.length} bytes`);

    // Use AssemblyAI's transcription API
    // Note: For real-time, we'd use the streaming API, but for now we'll use regular transcription
    const transcript = await client.transcripts.transcribe({
      audio: buffer,
      language_code: 'en',
      punctuate: true,
      format_text: true,
    });

    if (transcript.status === 'error') {
      throw new Error(transcript.error || 'Transcription failed');
    }

    const transcriptionText = transcript.text || '';
    const confidence = transcript.confidence || 0.8;

    console.log(`✅ Transcription result: "${transcriptionText.substring(0, 50)}..."`);

    return NextResponse.json({
      success: true,
      text: transcriptionText,
      confidence: confidence,
      isFinal: isFinal,
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('❌ Error transcribing audio:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to transcribe audio' 
    }, { status: 500 });
  }
}


