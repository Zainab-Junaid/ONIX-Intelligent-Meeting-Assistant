import { MeetingSummaryInput, MeetingTranscript } from "./models";
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

// return summary given a transcript
export async function summarizeTranscript(
  transcript: MeetingTranscript,
): Promise<MeetingSummaryInput> {
  const meetingId = transcript.meetingId;
  
  console.log(`🤖 Starting summary generation for meeting ${meetingId}`);
  console.log(`📊 Transcript has ${transcript.segments.length} segments`);
  
  // Check if transcript has segments
  if (!transcript.segments || transcript.segments.length === 0) {
    console.warn(`⚠️ No segments found in transcript for meeting ${meetingId}`);
    return {
      meetingId,
      generatedAt: new Date(),
      summaryText: "No transcript content available for summarization.",
      model: "no-content",
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

## Note
⚠️ This is a fallback summary because AssemblyAI API key is not configured. For AI-powered summaries, please configure your API key.`;
    
    return {
      meetingId,
      generatedAt: new Date(),
      summaryText: fallbackSummary,
      model: "fallback-no-api-key",
    };
  }

  try {
    console.log(`🚀 Calling AssemblyAI LeMUR API...`);

    const client = getAssemblyAIClient();
    const resp = await client.lemur.summary({
      input_text: combinedSegments,
      answer_format: "bulleted_list", // Changed to bulleted list for better readability
      max_output_size: 3000, // Increased from 2000 to 3000 for more detailed summaries
      final_model: "anthropic/claude-3-5-sonnet", // Keeping the best model
      // Add custom instructions for better summary structure
      context: "Generate a comprehensive meeting summary with the following structure: Key Discussion Points, Decisions Made, Action Items, and Next Steps. Focus on actionable insights and important decisions.",
    });

    console.log(`✅ Summary generated successfully`);

    // AssemblyAI Lemur returns a typed object with `response`
    const summaryText = resp.response;

    console.log(`📋 Summary length: ${summaryText.length} characters`);
    console.log(`📝 Summary preview: ${summaryText.substring(0, 200)}...`);

    // return summary object with metadata
    return {
      meetingId,
      generatedAt: new Date(),
      summaryText: summaryText, // AssemblyAI returns summary text here
      model: "assemblyai-lemur",
    };
  } catch (err) {
    console.error(`❌ Failed to summarize transcript for meeting ${meetingId}:`, err);
    // Hard fallback: always return a summary so it gets saved
    const speakers = new Set(transcript.segments.map((s) => s.speaker));
    const fallback = `Meeting Summary (Fallback on error)\n\n` +
      `Meeting ID: ${meetingId}\n` +
      `Segments: ${transcript.segments.length}\n` +
      `Participants: ${[...speakers].join(", ")}\n` +
      `Note: AssemblyAI error prevented a model summary.`;
    return {
      meetingId,
      generatedAt: new Date(),
      summaryText: fallback,
      model: "assemblyai-error-fallback",
    };
  }
}
