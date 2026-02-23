/**
 * LLM Service — Gemini-based fallback for unstructured questions
 * Only used when intent router can't classify the question
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { MeetingContext } from './types';

const SYSTEM_PROMPT = `You are a meeting assistant. Your role is to answer questions about a specific meeting using ONLY the provided meeting data.

STRICT RULES:
1. Answer ONLY using the provided meeting JSON data.
2. If the answer is not present in the data, say: "The information is not available in this meeting."
3. Do NOT fabricate, guess, or infer information that isn't explicitly in the data.
4. Be concise and direct.
5. Format responses with markdown for readability.
6. When quoting from the transcript, attribute quotes to their speakers.
7. Do not reveal internal IDs, database fields, or system metadata.`;

const MAX_CONTEXT_CHARS = 15000; // ~4000 tokens

/**
 * Prepare meeting context for LLM — sanitized and capped
 */
function prepareContext(ctx: MeetingContext): string {
  const sanitized = {
    title: ctx.title,
    duration: ctx.duration,
    participants: ctx.participants,
    summary: ctx.summary,
    actionItems: ctx.actionItems,
    decisions: ctx.decisions,
    // Cap transcript to avoid token overflow
    transcript: ctx.transcript.slice(0, 100).map((s) => ({
      speaker: s.speaker,
      text: s.text,
    })),
  };

  let json = JSON.stringify(sanitized, null, 2);

  // If still too large, progressively reduce transcript
  while (json.length > MAX_CONTEXT_CHARS && sanitized.transcript.length > 10) {
    sanitized.transcript = sanitized.transcript.slice(0, Math.floor(sanitized.transcript.length * 0.7));
    json = JSON.stringify(sanitized, null, 2);
  }

  return json;
}

/**
 * Ask the LLM a question about a meeting
 */
export async function askLLM(
  ctx: MeetingContext,
  question: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  console.log(`🤖 [LLM] Using Gemini API (key: ${apiKey.substring(0, 8)}...)`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 500,
    },
  });

  const contextJson = prepareContext(ctx);

  const prompt = `${SYSTEM_PROMPT}

MEETING DATA:
${contextJson}

USER QUESTION: ${question}`;

  // 15-second timeout guard
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text() || 'I was unable to generate a response. Please try again.';
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('LLM request timed out after 15 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
