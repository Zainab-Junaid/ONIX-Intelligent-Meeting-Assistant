import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';
import { AssemblyAI } from 'assemblyai';
import { setGlobalDispatcher, Agent } from 'undici';
import { setDefaultResultOrder } from 'node:dns';

// Initialize Firebase Admin
getFirebaseAdmin();

// Fix for Node 17+ (and Node 22) favoring IPv6, causing timeouts with some APIs
try {
  setDefaultResultOrder('ipv4first');
} catch (error) {
  console.warn('Failed to set default result order to ipv4first:', error);
}

// Increase global connection timeout to 60 seconds (default is 10s)
// This fixes the 'Connect Timeout Error' when connecting to AssemblyAI API
setGlobalDispatcher(new Agent({
  connect: {
    timeout: 60000,
  },
  headersTimeout: 60000,
  bodyTimeout: 60000,
}));



export async function POST(request: NextRequest) {
  try {
    // Check for Guest Mode
    const isGuest = request.headers.get('x-guest-mode') === 'true';
    let userId = '';

    if (isGuest) {
      userId = 'guest';
      console.log('👤 Guest mode request received');
    } else {
      // Get Firebase token from headers
      const authHeader = request.headers.get('authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'No token provided' }, { status: 401 });
      }

      const token = authHeader.split('Bearer ')[1];

      // Verify Firebase token
      const decodedToken = await getAuth().verifyIdToken(token);
      userId = decodedToken.uid;
    }

    // Get meeting ID and transcript from request body
    const { meetingId, transcript } = await request.json();

    if (!meetingId || !transcript) {
      return NextResponse.json({ error: 'Meeting ID and transcript are required' }, { status: 400 });
    }

    // Check if AssemblyAI API key is configured
    if (!process.env.ASSEMBLYAI_API_KEY) {
      console.warn('⚠️ ASSEMBLYAI_API_KEY not found in environment variables');

      // Return fallback summary
      const fallbackSummary = {
        text: `# Meeting Summary (Fallback - No API Key)

## Note
⚠️ AssemblyAI API key is not configured. For AI-powered summaries, please configure your ASSEMBLYAI_API_KEY environment variable.

## Transcript Preview
${transcript.substring(0, 500)}...`,
        generatedAt: new Date(),
        model: 'fallback-no-api-key'
      };

      const fallbackActionItems: Array<{ text: string; assignedTo?: string; dueDate?: any }> = [];

      // Update Firestore document only if not guest
      if (!isGuest) {
        const db = admin.firestore();
        const docRef = db.collection('users').doc(userId).collection('meetings').doc(meetingId);
        await docRef.update({
          summary: fallbackSummary,
          actionItems: fallbackActionItems,
          updatedAt: admin.firestore.Timestamp.now()
        });
      }

      return NextResponse.json({
        success: true,
        summary: fallbackSummary,
        actionItems: fallbackActionItems,
        isFallback: true
      });
    }

    // Initialize AssemblyAI client
    const apiKey = process.env.ASSEMBLYAI_API_KEY;

    if (!apiKey) {
      console.error('❌ ASSEMBLYAI_API_KEY is not set in environment variables');
      throw new Error('ASSEMBLYAI_API_KEY is not configured');
    }

    console.log(`🤖 Generating summary for meeting ${meetingId}`);
    console.log(`📝 Transcript length: ${transcript.length} characters`);
    console.log(`🔑 API Key present: ${apiKey ? 'Yes (starts with ' + apiKey.substring(0, 10) + '...)' : 'No'}`);

    const client = new AssemblyAI({
      apiKey: apiKey,
    });

    // Generate summary using AssemblyAI LeMUR (no character limit for testing)
    let summaryResp, actionItemsResp;
    let textToProcess = transcript;

    try {
      // Step 1: Translate transcript if needed using LeMUR
      // We'll ask LeMUR to translate to English if it's not already
      console.log('🌍 Checking/Translating transcript to English...');
      try {
        const translationResp = await client.lemur.task({
          input_text: transcript,
          final_model: "anthropic/claude-sonnet-4-20250514",
          prompt: "You are a professional translator. specialized in technical and business meetings. \n\nTask: Translate the provided transcript into clear, professional English. \n- If the text is already in English, output it exactly as is.\n- If it is in another language (e.g., Urdu, Hindi, Spanish), translate it to English while preserving the original meaning, tone, and speaker context.\n- Do not add any introductory or concluding remarks (like 'Here is the translation'). JUST return the English text.",
        });

        if (translationResp.response && translationResp.response.length > 0) {
          textToProcess = translationResp.response;
          console.log('✅ Transcript ready for processing (potentially translated)');
        }
      } catch (transError) {
        console.warn('⚠️ Translation step failed, proceeding with original transcript:', transError);
        // We continue with original text if translation fails
      }

      // Step 2: Generate Summary from (translated) text
      summaryResp = await client.lemur.summary({
        input_text: textToProcess, // Use the translated text
        answer_format: "bulleted_list",
        final_model: "anthropic/claude-sonnet-4-20250514",
        context: `Generate a comprehensive, detailed meeting summary that captures all important information. Structure your summary as follows:

## Executive Summary
- Brief overview of the meeting purpose and main outcomes

## Key Discussion Points
- All major topics discussed
- Important conversations and exchanges
- Different perspectives shared
- Any debates or decisions in progress

## Decisions Made
- All decisions reached during the meeting
- Who made the decisions
- Rationale behind key decisions

## Action Items
- Specific tasks identified
- Who is responsible (include speaker names when mentioned)
- Any deadlines or due dates mentioned
- Priority level if indicated

## Next Steps
- Follow-up actions required
- Future meetings or check-ins scheduled
- Resources or information needed
- Timeline for completion

## Important Information
- Key facts, figures, or data shared
- Important dates, deadlines, or milestones
- Resources or tools mentioned
- Contacts or references provided

Make the summary thorough, well-organized, and easy to scan. Include specific details, names, and context. Focus on actionable insights and information that will be useful for future reference.`,
      });

      // Generate action items using the same prompt as the meeting bot
      actionItemsResp = await client.lemur.task({
        input_text: textToProcess,
        final_model: "anthropic/claude-sonnet-4-20250514",
        prompt: `You are extracting action items from a meeting transcript.
The transcript may be in any language — always extract items in ENGLISH, translating if needed.

Return ONLY a valid JSON array. Each object must have:
{
  "item": "Clear description of the task",
  "assignedTo": "Person name or null",
  "dueDate": "YYYY-MM-DD or null",
  "priority": "high|medium|low"
}

Rules:
- Only include concrete, actionable tasks — not vague suggestions
- If the transcript attributes a task to a specific person, include their name in "assignedTo"
- If no one is assigned, set "assignedTo" to null
- Set priority based on urgency cues in the transcript
- There is no fixed number of action items — extract as many or as few as the meeting warrants
- If no action items exist at all, return an empty array []`,
        context: "Action items extraction from meeting transcript",
      });
    } catch (lemurError: any) {
      // Log the full error for debugging
      console.error('❌ AssemblyAI LeMUR API Error:', lemurError);
      console.error('Error message:', lemurError.message);
      console.error('Error status:', lemurError.status);
      console.error('Error response:', lemurError.response);

      // Handle LeMUR access error
      if (lemurError.message?.includes('LeMUR') ||
        lemurError.message?.includes('access') ||
        lemurError.message?.includes('upgrade') ||
        lemurError.status === 403 ||
        lemurError.status === 401) {
        console.warn('⚠️ LeMUR not available, using fallback summary generation');
        // Use fallback summary generation
        const fallbackSummary = {
          text: `# Meeting Summary (Fallback - LeMUR Not Available)

## Note
⚠️ Your AssemblyAI account does not have access to LeMUR. Please upgrade your plan or contact support@assemblyai.com.

## Transcript Summary
${transcript.substring(0, 2000)}${transcript.length > 2000 ? '...' : ''}

## Key Points
- This is a basic summary. For AI-powered summaries, please upgrade your AssemblyAI account to access LeMUR.
- The full transcript is available in the Transcript tab.`,
          generatedAt: new Date(),
          model: 'fallback-no-lemur'
        };

        const fallbackActionItems: Array<{ text: string; assignedTo?: string; dueDate?: any }> = extractActionItemsFromText(transcript);

        // Update Firestore document only if not guest
        if (!isGuest) {
          const db = admin.firestore();
          const docRef = db.collection('users').doc(userId).collection('meetings').doc(meetingId);
          await docRef.update({
            summary: fallbackSummary,
            actionItems: fallbackActionItems,
            updatedAt: admin.firestore.Timestamp.now()
          });
        }

        return NextResponse.json({
          success: true,
          summary: fallbackSummary,
          actionItems: fallbackActionItems,
          isFallback: true,
          error: 'LeMUR not available - using fallback summary'
        });
      }
      throw lemurError; // Re-throw if it's a different error
    }

    console.log(`✅ Summary and action items generated successfully`);

    const summaryText = summaryResp.response;
    const actionItemsText = actionItemsResp.response;

    // Parse action items from JSON response (format: item, assignedTo, dueDate, priority)
    let actionItems: Array<{ text: string; assignedTo?: string; dueDate?: any; priority?: string }> = [];
    try {
      const parsedActionItems = JSON.parse(actionItemsText);
      if (Array.isArray(parsedActionItems)) {
        actionItems = parsedActionItems.map((item: any) => {
          const actionItem: any = {
            text: item.item || item.description || item.task || String(item),
          };
          const assignedTo = item.assignedTo || item.assignee || item.assigned_to;
          if (assignedTo && String(assignedTo).trim() !== '' && String(assignedTo).toLowerCase() !== 'null') {
            actionItem.assignedTo = String(assignedTo).trim();
          }
          if (item.dueDate) {
            try {
              const dueDate = new Date(item.dueDate);
              if (!isNaN(dueDate.getTime())) {
                actionItem.dueDate = admin.firestore.Timestamp.fromDate(dueDate);
              }
            } catch (dateError) {
              console.warn('Invalid due date:', item.dueDate);
            }
          }
          if (item.priority && ['high', 'medium', 'low'].includes(String(item.priority).toLowerCase())) {
            actionItem.priority = String(item.priority).toLowerCase();
          }
          return actionItem;
        }).filter(item => item.text && item.text.trim() !== '');
      }
    } catch (parseError) {
      console.warn(`⚠️ Failed to parse action items JSON: ${parseError}`);
      actionItems = extractActionItemsFromText(summaryText);
    }

    // Clean action items - remove any undefined values
    actionItems = actionItems.map(item => {
      const cleanItem: any = { text: item.text };
      if (item.assignedTo) cleanItem.assignedTo = item.assignedTo;
      if (item.dueDate) cleanItem.dueDate = item.dueDate;
      if (item.priority) cleanItem.priority = item.priority;
      return cleanItem;
    });

    console.log(`📋 Extracted ${actionItems.length} action items`);

    const summary = {
      text: summaryText,
      generatedAt: admin.firestore.Timestamp.now(),
      model: 'assemblyai-lemur'
    };

    // Update Firestore document - use set with merge to avoid undefined issues (ONLY IF NOT GUEST)
    if (!isGuest) {
      const db = admin.firestore();
      const docRef = db.collection('users').doc(userId).collection('meetings').doc(meetingId);

      // Get existing data first
      const docSnap = await docRef.get();
      const existingData = docSnap.exists ? docSnap.data() : {};

      // Prepare update data, only including defined values
      const updateData: any = {
        summary: summary,
        actionItems: actionItems,
        updatedAt: admin.firestore.Timestamp.now()
      };

      // Preserve existing notes if they exist
      if (existingData?.notes) {
        updateData.notes = existingData.notes;
      }

      await docRef.set(updateData, { merge: true });
    }

    return NextResponse.json({
      success: true,
      summary: summary,
      actionItems: actionItems,
      isFallback: false
    });

  } catch (error: any) {
    console.error('❌ Error generating summary:', error);

    // Return error fallback
    const errorSummary = {
      text: `# Meeting Summary (Error)

## Note
⚠️ An error occurred while generating the summary: ${error.message || 'Unknown error'}`,
      generatedAt: new Date(),
      model: 'error-fallback'
    };

    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to generate summary',
      summary: errorSummary,
      actionItems: [],
      isFallback: true
    }, { status: 500 });
  }
}

// Helper function to extract action items from text (fallback)
function extractActionItemsFromText(text: string): Array<{ text: string; assignedTo?: string; dueDate?: any }> {
  const actionItems: Array<{ text: string; assignedTo?: string; dueDate?: any }> = [];

  // Look for action items patterns in the text
  // 1. Name/You : Task (by Date)
  // 2. Task assigned to Name
  // 3. To-do: Task
  const actionItemPatterns = [
    /([A-Z][a-z]+|You|I)\s+(?:should|must|needs to|is supposed to|will)\s+([^.!?\n]+)(?:\s+(?:by|on|at)\s+([^.!?\n]+))?/gi,
    /(?:task|action item|todo):\s*([^.!?\n]+)/gi,
    /([^.!?\n]+)\s+(?:assigned to|for)\s+([A-Z][a-z]+|You)/gi,
  ];

  actionItemPatterns.forEach((pattern, index) => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (index === 0) { // Name/You should Task by Date
        actionItems.push({
          text: match[2].trim(),
          assignedTo: match[1].trim(),
          dueDate: match[3]?.trim()
        });
      } else if (index === 1) { // generic todo
        actionItems.push({
          text: match[1].trim()
        });
      } else if (index === 2) { // Task assigned to Name
        actionItems.push({
          text: match[1].trim(),
          assignedTo: match[2].trim()
        });
      }
    }
  });

  return actionItems;
}

