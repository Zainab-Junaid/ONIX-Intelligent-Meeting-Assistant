import { MeetingSummaryInput, MeetingTranscript, ActionItemInput, KeyTopicsResult } from "./domain/transcription/models";
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

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

const SUMMARY_PROMPT = `You are an expert meeting analyst. Analyze the following meeting transcript and produce a structured summary.

IMPORTANT: The transcript may be in ANY language (Urdu, Arabic, Japanese, etc.). You MUST always produce the output in ENGLISH, translating as needed.

## Output Format (use markdown):

### 🎯 Key Topics
Exactly 3 topics that best describe what this meeting was about:
1. **Topic name** — One sentence description
2. **Topic name** — One sentence description
3. **Topic name** — One sentence description

### 📝 Summary
Write the summary as short, readable paragraphs — NOT bullet points. Each paragraph should be 2-4 sentences.
You MUST attribute key points to speakers by name throughout, e.g. "Ahmed proposed that...", "Sara highlighted...", "John raised the concern that...".
Cover what was discussed, who contributed what, key arguments, and important context.

### ✅ Decisions Made
- Decision description — proposed by **[Speaker Name]**
(Only include if explicit decisions were made. If none, write "No explicit decisions were made.")

### ⏭️ Next Steps
- Next step — **[Owner Name]** (if attributed)
(Only include if next steps were discussed. If none, omit this section entirely.)

### ⚠️ Open Questions / Unresolved Issues
- Question or issue that was raised but not resolved
(Only include if there are unresolved items. If none, omit this section entirely.)

### 📋 TL;DR
A 2-3 sentence executive summary of the entire meeting. Get straight to the point.`;

const KEY_TOPICS_PROMPT = `Extract the key topics and keywords from this meeting transcript.
The transcript may be in any language — always respond in ENGLISH.
Return a JSON object with:
{
  "topics": ["topic1", "topic2", "topic3"],
  "keywords": [
    { "keyword": "word", "category": "topic|entity|action", "relevance": 0.9 }
  ]
}
Rules:
- "topics" must have EXACTLY 3 items — the 3 best descriptions of what this meeting was about
- "keywords" should list 5-15 important terms from the meeting
Return ONLY valid JSON, no markdown.`;

const ACTION_ITEMS_PROMPT = `You are extracting action items from a meeting transcript.
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
- If no action items exist at all, return an empty array []`;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function summarizeTranscript(
  transcript: MeetingTranscript,
): Promise<{ summary: MeetingSummaryInput; actionItems: ActionItemInput[]; keyTopics: KeyTopicsResult | null }> {
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
      keyTopics: null,
    };
  }

  // Format transcript WITH speaker labels — this is critical for attribution
  const combinedSegments = transcript.segments
    .map((seg) => `[${seg.speaker}]: ${seg.text}`)
    .join("\n");

  console.log(`📝 Combined transcript length: ${combinedSegments.length} characters`);
  console.log(`📄 First 300 chars:\n${combinedSegments.substring(0, 300)}...`);

  // Check if we have API key
  if (!process.env.ASSEMBLYAI_API_KEY) {
    console.warn(`⚠️ ASSEMBLYAI_API_KEY not found in environment variables`);
    console.log(`📝 Creating fallback summary without API call...`);

    const participants = [...new Set(transcript.segments.map(s => s.speaker))];

    const fallbackSummary = `### 🎯 Key Topics
1. **Meeting Discussion** — General meeting discussion
2. **Participant Contributions** — Input from ${participants.join(', ')}
3. **Follow-up Items** — Areas requiring further discussion

### 📝 Summary
A meeting took place with ${participants.length} participant(s): ${participants.join(', ')}. The meeting contained ${transcript.segments.length} transcript segments.

Due to the AssemblyAI API key not being configured, an AI-powered summary could not be generated. Please configure your API key for detailed summaries with speaker attribution.

### 📋 TL;DR
Meeting with ${participants.join(', ')} — ${transcript.segments.length} segments captured. AI summary unavailable (no API key configured).`;

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
      keyTopics: {
        topics: ["Meeting Discussion", "Participant Contributions", "Follow-up Items"],
        keywords: [],
      },
    };
  }

  try {
    console.log(`🚀 Calling AssemblyAI LLM Gateway...`);

    const makeGatewayCall = async (promptName: string, promptText: string, context: string, maxTokens: number) => {
      console.log(`📋 LLM Gateway Call: ${promptName}...`);
      let attempt = 0;
      let lastError;
      
      while (attempt < 4) {
        try {
          const response = await fetch("https://llm-gateway.assemblyai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.ASSEMBLYAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              messages: [
                { 
                  role: "system", 
                  content: `${context}\n\nYou are processing a meeting transcript. The transcript is provided in the user message.` 
                },
                { 
                  role: "user", 
                  content: `Here is the transcript:\n\n${combinedSegments}\n\nTask:\n${promptText}` 
                }
              ],
              max_tokens: maxTokens,
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLM Gateway Error (${response.status}): ${errorText}`);
          }

          const data = await response.json();
          return data.choices[0].message.content;
        } catch (e: any) {
          lastError = e;
          // Check if it's a network error (like EAI_AGAIN or ECONNRESET) or a rate limit (429)
          const isRetryable = e.message.includes('EAI_AGAIN') || 
                              e.message.includes('ECONN') || 
                              e.message.includes('fetch failed') || 
                              e.message.includes('429') || 
                              e.message.includes('500') ||
                              e.message.includes('502') ||
                              e.message.includes('503') ||
                              e.message.includes('504') ||
                              e.message.includes('timeout');
                              
          if (!isRetryable) {
            throw e; // Unrecoverable error (e.g. 400 Bad Request, 401 Unauthorized)
          }
          
          attempt++;
          if (attempt >= 4) break;
          
          const delayMs = 2000 * Math.pow(2, attempt - 1); // Exponential backoff: 2s, 4s, 8s
          console.warn(`⚠️ Retry ${attempt}/3 for ${promptName} in ${delayMs}ms due to: ${e.message}`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      throw lastError;
    };

    // --- CALL 1: Generate structured summary ---
    const summaryText = await makeGatewayCall(
      "Generating structured summary",
      SUMMARY_PROMPT,
      `Meeting title: ${transcript.meetingTitle || 'Unknown'}. This is a transcript from a meeting with speaker labels in [Speaker]: format.`,
      4000
    );

    // --- CALL 2: Extract key topics & keywords ---
    const keyTopicsText = await makeGatewayCall(
      "Extracting key topics & keywords",
      KEY_TOPICS_PROMPT,
      `Meeting title: ${transcript.meetingTitle || 'Unknown'}.`,
      2000
    );

    // --- CALL 3: Extract action items ---
    const actionItemsText = await makeGatewayCall(
      "Extracting action items",
      ACTION_ITEMS_PROMPT,
      `Meeting title: ${transcript.meetingTitle || 'Unknown'}.`,
      2000
    );

    console.log(`✅ All 3 LLM Gateway calls completed successfully`);

    console.log(`📋 Summary length: ${summaryText.length} characters`);
    console.log(`📝 Summary preview:\n${summaryText.substring(0, 400)}...`);

    // Parse key topics from JSON response
    let keyTopics: KeyTopicsResult | null = null;
    try {
      // Strip markdown code fences if present
      const cleanedTopics = keyTopicsText
        .replace(/^```json?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(cleanedTopics);
      keyTopics = {
        topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 3) : [],
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      };
      console.log(`🏷️ Extracted ${keyTopics.topics.length} topics and ${keyTopics.keywords.length} keywords`);
    } catch (parseError) {
      console.warn(`⚠️ Failed to parse key topics JSON: ${parseError}`);
      console.warn(`⚠️ Raw response: ${keyTopicsText.substring(0, 200)}`);
    }

    // Parse action items from JSON response
    let actionItems: ActionItemInput[] = [];
    try {
      // Strip markdown code fences if present
      const cleanedItems = actionItemsText
        .replace(/^```json?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      const parsedActionItems = JSON.parse(cleanedItems);
      if (Array.isArray(parsedActionItems)) {
        actionItems = parsedActionItems.map((item: any) => ({
          meetingId,
          userId: transcript.userId,
          meetingTitle: transcript.meetingTitle,
          item: item.item || item.description || item.task || String(item),
          assignedTo: item.assignedTo || item.assignee || item.assigned_to || null,
          dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
          priority: item.priority || 'medium',
          status: 'pending',
        }));
      }
    } catch (parseError) {
      console.warn(`⚠️ Failed to parse action items JSON: ${parseError}`);
      console.warn(`⚠️ Raw response: ${actionItemsText.substring(0, 200)}`);
      // Fallback: try to extract action items from summary text
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
        model: "assemblyai-llm-gateway",
        isFallback: false,
      },
      actionItems: actionItems,
      keyTopics: keyTopics,
    };
  } catch (err) {
    console.error(`❌ Failed to summarize transcript for meeting ${meetingId}:`, err);
    // Hard fallback: always return a summary so it gets saved
    const speakers = [...new Set(transcript.segments.map((s) => s.speaker))];

    const fallback = `### 🎯 Key Topics
1. **Meeting Discussion** — General meeting discussion
2. **Participant Input** — Contributions from ${speakers.join(', ')}
3. **Review Required** — Summary generation failed, manual review needed

### 📝 Summary
A meeting took place with participants: ${speakers.join(', ')}. The meeting contained ${transcript.segments.length} transcript segments.

Unfortunately, the AI-powered summary could not be generated due to an API error. Please review the full transcript for details.

### 📋 TL;DR
Meeting with ${speakers.join(', ')} — ${transcript.segments.length} segments captured. AI summary failed due to API error.`;

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
      keyTopics: null,
    };
  }
}

// Helper function to extract action items from text (fallback)
function extractActionItemsFromText(
  text: string,
  meetingId: string,
  userId?: string,
  meetingTitle?: string
): ActionItemInput[] {
  const actionItems: ActionItemInput[] = [];

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
          assignedTo: match[2]?.trim() || null,
          priority: 'medium',
          status: 'pending',
        });
      }
    }
  });

  return actionItems;
}
