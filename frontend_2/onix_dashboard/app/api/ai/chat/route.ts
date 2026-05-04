import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { detectIntent } from '@/lib/ai/intentRouter';
import {
  handleSummary,
  handleParticipants,
  handleDuration,
  handleActionItems,
  handleDecisions,
  handleTranscript,
} from '@/lib/ai/structuredHandlers';
import { askLLM } from '@/lib/ai/llmService';
import { MeetingContext, ChatResponse } from '@/lib/ai/types';

function initFirebase() {
  return !!getFirebaseAdmin();
}

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20; // requests per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * POST /api/ai/chat
 *
 * Flow:
 *   1. Auth check
 *   2. Rate limit check
 *   3. Fetch meeting context
 *   4. Detect intent
 *   5. Route to structured handler or LLM fallback
 *   6. Return response
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    initFirebase();
    const decoded = await getAuth().verifyIdToken(token);
    const userId = decoded.uid;

    // Rate limit
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    // Parse request body
    const { meetingId, question } = await request.json();

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required' }, { status: 400 });
    }
    if (!question || !question.trim()) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    console.log(`🤖 [AI Chat] User ${userId} | Meeting ${meetingId} | Q: "${question.substring(0, 80)}"`);

    // Fetch meeting context from our own endpoint
    const contextUrl = new URL(
      `/api/ai/meeting-context/${meetingId}`,
      request.nextUrl.origin
    );
    const contextRes = await fetch(contextUrl.toString(), {
      headers: { authorization: authHeader },
      signal: AbortSignal.timeout(15000),
    });

    if (!contextRes.ok) {
      const errText = await contextRes.text().catch(() => '');
      console.error(`❌ [AI Chat] Context fetch failed: ${contextRes.status} ${errText.substring(0, 100)}`);

      if (contextRes.status === 401) {
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
      }
      return NextResponse.json(
        { error: 'Failed to load meeting data. Please try again.' },
        { status: 500 }
      );
    }

    const context: MeetingContext = await contextRes.json();

    // Detect intent
    const intent = detectIntent(question);
    console.log(`🤖 [AI Chat] Intent: ${intent}`);

    let answer: string;
    let source: 'structured' | 'llm' = 'structured';

    // Route to handler or LLM
    switch (intent) {
      case 'summary':
        answer = handleSummary(context);
        break;
      case 'participants':
        answer = handleParticipants(context);
        break;
      case 'duration':
        answer = handleDuration(context);
        break;
      case 'action_items':
        answer = handleActionItems(context);
        break;
      case 'decisions':
        answer = handleDecisions(context);
        break;
      case 'transcript':
        answer = handleTranscript(context);
        break;
      case 'fallback':
      default:
        source = 'llm';
        try {
          answer = await askLLM(context, question);
        } catch (llmError: any) {
          console.error(`❌ [AI Chat] LLM error:`, llmError.message, llmError.stack || llmError);
          if (llmError.message?.includes('timed out')) {
            answer = 'The AI service took too long to respond. Please try a simpler question or ask about specific meeting details like the summary, participants, or action items.';
          } else if (llmError.message?.includes('GEMINI_API_KEY')) {
            answer = 'The AI service is not configured. Please contact your administrator to set up the GEMINI_API_KEY.';
          } else {
            answer = 'I encountered an error processing your question. You can try asking about the meeting summary, participants, or action items instead.';
          }
        }
        break;
    }

    const elapsed = Date.now() - startTime;
    console.log(`🤖 [AI Chat] Response (${source}, ${elapsed}ms) | Intent: ${intent}`);

    const response: ChatResponse = { answer, intent, source };
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('❌ [AI Chat] Unhandled error:', error);

    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
