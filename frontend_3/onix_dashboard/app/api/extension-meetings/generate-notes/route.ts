import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';
import { AssemblyAI } from 'assemblyai';

// Initialize Firebase Admin
getFirebaseAdmin();



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

    // Get meeting ID, transcript, and optional context from request body
    const { meetingId, transcript, timestamp, previousNotes } = await request.json();
    
    if (!meetingId || !transcript) {
      return NextResponse.json({ error: 'Meeting ID and transcript are required' }, { status: 400 });
    }

    // Check if AssemblyAI API key is configured
    if (!process.env.ASSEMBLYAI_API_KEY) {
      console.warn('⚠️ ASSEMBLYAI_API_KEY not found in environment variables');
      
      // Return fallback notes - extract key points from transcript
      const fallbackNotes = generateFallbackNotes(transcript, timestamp);
      
      return NextResponse.json({ 
        success: true, 
        notes: fallbackNotes,
        isFallback: true
      });
    }

    // Initialize AssemblyAI client
    const client = new AssemblyAI({
      apiKey: process.env.ASSEMBLYAI_API_KEY,
    });

    console.log(`📝 Generating notes for meeting ${meetingId}`);
    console.log(`📝 Transcript length: ${transcript.length} characters`);

    // Generate structured notes using AssemblyAI LeMUR
    // Focus on extracting key concepts, definitions, important points like a student would note
    const notesPrompt = `You are helping a student take comprehensive notes from a lecture/class transcript. Extract and organize information into these categories:

## 1. Key Concepts (💡)
Extract important topics, concepts, theories, and main ideas discussed. These should be the core learning points.

## 2. Definitions (📖)
Extract any definitions, explanations of terms, technical vocabulary, or jargon that was defined during the lecture.

## 3. Important Points (⭐)
Extract key takeaways, main ideas, critical information, and significant points that students should remember.

## 4. Examples (📚)
Extract any examples, case studies, real-world applications, demonstrations, or illustrative scenarios mentioned.

## 5. Questions/Clarifications (❓)
Extract any questions raised, points that need clarification, areas of confusion, or topics that require further investigation.

**Format Requirements:**
- Use clear section headers: "## Key Concepts", "## Definitions", etc.
- Each note item should be a bullet point (use - or •)
- Keep notes concise but informative (1-2 sentences per item)
- Include specific details, names, numbers, or examples when mentioned
- Focus on information that will be useful for studying and review
- Avoid redundancy - if something was already covered, don't repeat it

**Output Format:**
Organize your response with clear section headers. Under each section, list the relevant notes as bullet points. Each bullet point should be a complete, standalone note that makes sense on its own.

${previousNotes ? `\n**Previous Notes Context:**\n${previousNotes.slice(-5).map((n: any, i: number) => `${i + 1}. [${n.type}] ${n.text}`).join('\n')}\n\nAvoid repeating information already covered in previous notes.` : ''}`;

    let notesResp;
    try {
      notesResp = await client.lemur.task({
        input_text: transcript,
        final_model: "anthropic/claude-sonnet-4-20250514",
        prompt: notesPrompt,
        context: "Student note-taking from lecture transcript",
      });

      console.log(`✅ Notes generated successfully`);
    } catch (lemurError: any) {
      // Log the full error for debugging
      console.error('❌ AssemblyAI LeMUR API Error:', lemurError);
      console.error('Error message:', lemurError.message);
      console.error('Error status:', lemurError.status);
      
      // Handle LeMUR access error
      if (lemurError.message?.includes('LeMUR') || 
          lemurError.message?.includes('access') ||
          lemurError.message?.includes('upgrade') ||
          lemurError.status === 403 ||
          lemurError.status === 401) {
        console.warn('⚠️ LeMUR not available, using fallback notes generation');
        // Use fallback notes
        const fallbackNotes = generateFallbackNotes(transcript, timestamp);
        
        return NextResponse.json({ 
          success: true, 
          error: 'Your account does not have access to LeMUR. Please upgrade or contact support@assemblyai.com for more information. Using fallback notes.',
          notes: fallbackNotes,
          isFallback: true
        });
      }
      
      // Re-throw other errors
      throw lemurError;
    }

    const notesText = notesResp.response;
    console.log('📝 Raw notes text from AI:', notesText.substring(0, 500));

    // Parse notes into structured format
    const notes = parseNotesFromText(notesText, timestamp);
    console.log(`📝 Parsed ${notes.length} structured notes`);

    // Save notes directly to Firestore (don't rely on extension to save)
    const db = admin.firestore();
    const docRef = db.collection('users').doc(userId).collection('meetings').doc(meetingId);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      const existingData = docSnap.data();
      const existingNotes = existingData?.notes || [];
      const updatedNotes = [...existingNotes, ...notes];
      
      await docRef.update({
        notes: updatedNotes,
        updatedAt: admin.firestore.Timestamp.now()
      });
      
      console.log(`✅ Saved ${notes.length} notes to Firestore (total: ${updatedNotes.length})`);
    } else {
      console.warn('⚠️ Meeting document not found, cannot save notes');
    }

    return NextResponse.json({ 
      success: true, 
      notes: notes,
      isFallback: false
    });

  } catch (error: any) {
    console.error('❌ Error generating notes:', error);
    
    // Return fallback notes on error
    const { transcript, timestamp } = await request.json().catch(() => ({ transcript: '', timestamp: null }));
    const fallbackNotes = generateFallbackNotes(transcript, timestamp);
    
    return NextResponse.json({ 
      success: true, 
      error: error.message || 'Failed to generate notes. Using fallback notes.',
      notes: fallbackNotes,
      isFallback: true
    });
  }
}

// Parse AI-generated notes into structured format
function parseNotesFromText(notesText: string, timestamp: any): Array<{
  id: string;
  timestamp: any;
  text: string;
  type: 'concept' | 'definition' | 'point' | 'example' | 'question' | 'general';
  createdAt: any;
}> {
  const notes: Array<{
    id: string;
    timestamp: any;
    text: string;
    type: 'concept' | 'definition' | 'point' | 'example' | 'question' | 'general';
    createdAt: any;
  }> = [];

  // Split by sections - look for markdown headers or bold text
  const sectionPattern = /(?:^|\n)(?:##?\s*)?(?:Key Concepts|Definitions|Important Points|Examples|Questions|Clarifications?)[:：]?\s*(?:\n|$)/i;
  const sections = notesText.split(sectionPattern);
  
  // Also try splitting by common section markers
  let allSections: string[] = [];
  if (sections.length > 1) {
    allSections = sections;
  } else {
    // Try alternative splitting methods
    const altSections = notesText.split(/\n\s*(?=##?\s*(?:Key|Definition|Important|Example|Question|Concept|Point))/i);
    if (altSections.length > 1) {
      allSections = altSections;
    } else {
      // Last resort: split by numbered sections or emoji markers
      allSections = notesText.split(/\n\s*(?=[💡📖⭐📚❓]|1\.|2\.|3\.|4\.|5\.)/);
    }
  }

  allSections.forEach((section, sectionIndex) => {
    const lines = section.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;

    // Determine type from section header or content
    const sectionText = section.toLowerCase();
    let type: 'concept' | 'definition' | 'point' | 'example' | 'question' | 'general' = 'general';
    
    if (sectionText.includes('concept') || sectionText.includes('💡') || sectionText.includes('topic')) {
      type = 'concept';
    } else if (sectionText.includes('definition') || sectionText.includes('📖') || sectionText.includes('define')) {
      type = 'definition';
    } else if (sectionText.includes('example') || sectionText.includes('📚') || sectionText.includes('case')) {
      type = 'example';
    } else if (sectionText.includes('question') || sectionText.includes('❓') || sectionText.includes('clarif')) {
      type = 'question';
    } else if (sectionText.includes('point') || sectionText.includes('⭐') || sectionText.includes('takeaway') || sectionText.includes('important')) {
      type = 'point';
    }

    // Extract bullet points or numbered items from the section
    lines.forEach((line, lineIndex) => {
      // Skip header lines
      if (lineIndex === 0 && (line.match(/^#+\s*/) || line.toLowerCase().includes('concept') || line.toLowerCase().includes('definition'))) {
        return;
      }
      
      // Remove bullet points, dashes, numbers, emojis
      const cleaned = line
        .replace(/^[•\-\*\d+\.\)]\s*/, '') // Remove bullets and numbers
        .replace(/^[💡📖⭐📚❓]\s*/, '') // Remove emojis
        .replace(/^##?\s*/, '') // Remove markdown headers
        .trim();
      
      // Only add if it's substantial content (at least 15 characters)
      if (cleaned && cleaned.length > 15 && !cleaned.match(/^(Key|Definition|Example|Question|Important|Concept)/i)) {
        notes.push({
          id: `auto_note_${Date.now()}_${sectionIndex}_${lineIndex}`,
          timestamp: timestamp || admin.firestore.Timestamp.now(),
          text: cleaned,
          type: type,
          createdAt: admin.firestore.Timestamp.now()
        });
      }
    });
  });

  // If no structured notes found, try to extract from plain text
  if (notes.length === 0 && notesText.trim().length > 50) {
    // Try to find bullet points or numbered lists
    const bulletLines = notesText.split(/\n/).filter(line => {
      const trimmed = line.trim();
      return trimmed.match(/^[•\-\*\d+\.\)]/) && trimmed.length > 15;
    });
    
    if (bulletLines.length > 0) {
      bulletLines.forEach((line, index) => {
        const cleaned = line.replace(/^[•\-\*\d+\.\)]\s*/, '').trim();
        if (cleaned.length > 15) {
          notes.push({
            id: `auto_note_${Date.now()}_${index}`,
            timestamp: timestamp || admin.firestore.Timestamp.now(),
            text: cleaned,
            type: 'general',
            createdAt: admin.firestore.Timestamp.now()
          });
        }
      });
    } else {
      // Last resort: create one general note from first part
      notes.push({
        id: `auto_note_${Date.now()}`,
        timestamp: timestamp || admin.firestore.Timestamp.now(),
        text: notesText.substring(0, 500).trim(),
        type: 'general',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
  }

  console.log(`📝 Parsed ${notes.length} notes from AI response`);
  console.log(`📊 Notes by type:`, {
    concept: notes.filter(n => n.type === 'concept').length,
    definition: notes.filter(n => n.type === 'definition').length,
    point: notes.filter(n => n.type === 'point').length,
    example: notes.filter(n => n.type === 'example').length,
    question: notes.filter(n => n.type === 'question').length,
    general: notes.filter(n => n.type === 'general').length
  });

  return notes;
}

// Generate fallback notes when API is not available
function generateFallbackNotes(transcript: string, timestamp: any): Array<{
  id: string;
  timestamp: string;
  text: string;
  type: 'general';
  createdAt: string;
}> {
  // Simple extraction: split by newlines if no punctuation, or by punctuation.
  let sentences = transcript.split(/\n+/).map(s => s.trim()).filter(s => s.length > 15);
  if (sentences.length === 0) {
    sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  }
  
  if (sentences.length === 0 && transcript.length > 0) {
    sentences = [transcript.trim()];
  }

  // Take the most recent/substantial sentences
  const keyPoints = sentences.slice(-5);

  return keyPoints.map((point, index) => ({
    id: `fallback_note_${Date.now()}_${index}`,
    timestamp: new Date().toISOString(),
    text: point.trim(),
    type: 'general' as const,
    createdAt: new Date().toISOString()
  }));
}

