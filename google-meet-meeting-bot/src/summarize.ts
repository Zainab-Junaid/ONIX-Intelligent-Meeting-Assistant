import { MeetingSummaryInput, MeetingTranscript, ActionItemInput } from "./models";
import { AssemblyAI } from "assemblyai";
import dotenv from "dotenv";

dotenv.config();

// Initialize AssemblyAI client only when needed
function getAssemblyAIClient() {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error("ASSEMBLYAI_API_KEY is not configured");
  }
  return new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY,
  });
}

// return summary and action items given a transcript
export async function summarizeTranscript(
  transcript: MeetingTranscript,
): Promise<{ summary: MeetingSummaryInput; actionItems: ActionItemInput[] }> {
  const meetingId = transcript.meetingId;
  
  console.log(`🤖 Starting summary generation for meeting ${meetingId}`);
  console.log(`📊 Transcript has ${transcript.segments.length} segments`);
  
  // Check if transcript has segments
  if (!transcript.segments || transcript.segments.length === 0) {
    console.warn(`⚠️ No segments found in transcript for meeting ${meetingId}`);
    return {
      summary: {
        meetingId,
        userId: transcript.userId,
        meetingTitle: transcript.meetingTitle,
        generatedAt: new Date(),
        summaryText: "No transcript content available for summarization.",
        model: "no-content",
        isFallback: true,
      },
      actionItems: [],
    };
  }

  // combine all segments to one long string
  const combinedSegments = transcript.segments
    .map((segment) => segment.text)
    .join(" ");
  
  console.log(`📝 Combined transcript length: ${combinedSegments.length} characters`);
  console.log(`📄 First 200 chars: ${combinedSegments.substring(0, 200)}...`);

  // Check if we have API key
  if (!process.env.ASSEMBLYAI_API_KEY) {
    console.warn(`⚠️ ASSEMBLYAI_API_KEY not found in environment variables`);
    console.log(`📝 Creating fallback summary without API call...`);
    
    // Create a structured fallback summary
    const participants = [...new Set(transcript.segments.map(s => s.speaker))];
    const keyTopics = transcript.segments.slice(0, 5).map(s => s.text.substring(0, 80)).join('... ');
    
    const fallbackSummary = `# Meeting Summary (Fallback - No API Key)

## Meeting Details
- **Meeting ID:** ${meetingId}
- **Duration:** ${transcript.segments.length} segments captured
- **Participants:** ${participants.join(', ')}

## Key Discussion Points
${keyTopics}

## Action Items
- Review meeting notes and follow up on discussed topics
- Schedule follow-up meeting if needed
- Share meeting summary with participants

## Note
⚠️ This is a fallback summary because AssemblyAI API key is not configured. For AI-powered summaries with speaker assignments, please configure your API key.`;
    
    return {
      summary: {
        meetingId,
        userId: transcript.userId,
        meetingTitle: transcript.meetingTitle,
        generatedAt: new Date(),
        summaryText: fallbackSummary,
        model: "fallback-no-api-key",
        isFallback: true,
      },
      actionItems: [],
    };
  }

  try {
    console.log(`🚀 Calling AssemblyAI LeMUR API...`);

    const client = getAssemblyAIClient();
    
    // Generate summary
    const summaryResp = await client.lemur.summary({
      input_text: combinedSegments,
      answer_format: "bulleted_list",
      max_output_size: 3000,
      final_model: "anthropic/claude-3-7-sonnet-20250219",
      context: "Generate a comprehensive meeting summary with the following structure: Key Discussion Points, Decisions Made, Action Items, and Next Steps. Focus on actionable insights and important decisions. For Action Items, include speaker assignments when possible (e.g., 'Task description (assigned to Speaker Name)').",
    });

    // Generate action items separately
    const actionItemsResp = await client.lemur.task({
      input_text: combinedSegments,
      final_model: "anthropic/claude-3-7-sonnet-20250219",
      prompt: "Extract specific action items from this meeting transcript. For each action item, identify: 1) The task description, 2) Who it's assigned to (if mentioned), 3) Any due date mentioned. Return ONLY a JSON array with objects { item, assignedTo, dueDate }.",
      context: "Action items extraction",
    });

    console.log(`✅ Summary and action items generated successfully`);

    const summaryText = summaryResp.response;
    const actionItemsText = actionItemsResp.response;

    console.log(`📋 Summary length: ${summaryText.length} characters`);
    console.log(`📝 Summary preview: ${summaryText.substring(0, 200)}...`);

    // Parse action items from JSON response
    let actionItems: ActionItemInput[] = [];
    try {
      const parsedActionItems = JSON.parse(actionItemsText);
      if (Array.isArray(parsedActionItems)) {
        actionItems = parsedActionItems.map((item: any) => ({
          meetingId,
          userId: transcript.userId,
          meetingTitle: transcript.meetingTitle,
          item: item.item || item.description || item.task || String(item),
          assignedTo: item.assignedTo || item.assignee || item.assigned_to,
          dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
          status: 'pending',
        }));
      }
    } catch (parseError) {
      console.warn(`⚠️ Failed to parse action items JSON: ${parseError}`);
      // Fallback: extract action items from summary text
      actionItems = extractActionItemsFromText(summaryText, meetingId, transcript.userId, transcript.meetingTitle);
    }

    console.log(`📋 Extracted ${actionItems.length} action items`);

    return {
      summary: {
        meetingId,
        userId: transcript.userId,
        meetingTitle: transcript.meetingTitle,
        generatedAt: new Date(),
        summaryText: summaryText,
        model: "assemblyai-lemur",
        isFallback: false,
      },
      actionItems: actionItems,
    };
  } catch (err) {
    console.error(`❌ Failed to summarize transcript for meeting ${meetingId}:`, err);
    // Hard fallback: always return a summary so it gets saved
    const speakers = new Set(transcript.segments.map((s) => s.speaker));
    const keyTopics = transcript.segments.slice(0, 3).map(s => s.text.substring(0, 100)).join('\n• ');
    
    const fallback = `# Meeting Summary (Fallback on Error)

## Meeting Details
- **Meeting ID:** ${meetingId}
- **Duration:** ${transcript.segments.length} segments captured
- **Participants:** ${[...speakers].join(", ")}

## Key Discussion Points
• ${keyTopics}

## Note
⚠️ AssemblyAI error prevented AI-powered summary generation. This is a basic fallback summary.`;
    return {
      summary: {
        meetingId,
        userId: transcript.userId,
        meetingTitle: transcript.meetingTitle,
        generatedAt: new Date(),
        summaryText: fallback,
        model: "assemblyai-error-fallback",
        isFallback: true,
      },
      actionItems: [],
    };
  }
}

// Helper function to extract action items from text
function extractActionItemsFromText(
  text: string, 
  meetingId: string, 
  userId?: string, 
  meetingTitle?: string
): ActionItemInput[] {
  const actionItems: ActionItemInput[] = [];
  
  // Look for action items patterns in the text
  const actionItemPatterns = [
    /(?:action item|action|todo|task|follow.?up|next step)[s]?:?\s*([^.!?]+)/gi,
    /(?:need to|should|must|will)\s+([^.!?]+)/gi,
    /(?:assigned to|assign to)\s+([^:]+):\s*([^.!?]+)/gi,
  ];
  
  actionItemPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        actionItems.push({
          meetingId,
          userId,
          meetingTitle,
          item: match[1].trim(),
          assignedTo: match[2]?.trim(),
          status: 'pending',
        });
      }
    }
  });
  
  return actionItems;
}
