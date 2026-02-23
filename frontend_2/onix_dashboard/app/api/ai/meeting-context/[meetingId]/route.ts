import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getBackendUrl } from '@/lib/backend';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { MeetingContext, TranscriptSegment } from '@/lib/ai/types';

function initFirebase() {
  return !!getFirebaseAdmin();
}

/**
 * GET /api/ai/meeting-context/:meetingId
 *
 * Aggregates meeting data from backend APIs into a single AI-optimized payload.
 * Processing pipeline:
 *   1. Remove captions with null/system speakers
 *   2. Deduplicate (strict text match per speaker)
 *   3. Normalize speaker names
 *   4. Sort chronologically
 *   5. Cap transcript at max segments
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ meetingId: string }> }
) {
  const params = await props.params;
  const meetingId = params.meetingId;

  try {
    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    initFirebase();
    await getAuth().verifyIdToken(token);

    const backendUrl = getBackendUrl();

    // Fetch all meeting data in parallel
    const [transcriptRes, summaryRes, actionItemsRes] = await Promise.allSettled([
      fetch(`${backendUrl}/api/meetings/${meetingId}/transcript`, {
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${backendUrl}/api/meetings/${meetingId}/summary`, {
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${backendUrl}/api/meetings/${meetingId}/action-items`, {
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    // Parse responses (gracefully handle failures)
    let rawTranscript: any = null;
    let summaryData: any = null;
    let actionItemsData: any = null;

    if (transcriptRes.status === 'fulfilled' && transcriptRes.value.ok) {
      rawTranscript = await transcriptRes.value.json();
    }
    if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
      summaryData = await summaryRes.value.json();
    }
    if (actionItemsRes.status === 'fulfilled' && actionItemsRes.value.ok) {
      actionItemsData = await actionItemsRes.value.json();
    }

    // --- Processing Pipeline ---

    // 1. Extract and clean transcript segments
    const rawSegments: any[] = rawTranscript?.segments || [];
    let segments: TranscriptSegment[] = rawSegments
      .filter((s: any) => {
        // Remove null speakers
        if (!s.speaker) return false;
        // Remove system messages
        if (s.speaker.toLowerCase().includes('system')) return false;
        // Remove empty text
        if (!s.text || !s.text.trim()) return false;
        return true;
      })
      .map((s: any) => ({
        speaker: normalizeSpeakerName(s.speaker),
        text: s.text.trim(),
        timestamp: s.timestamp || s.start?.toString() || '',
      }));

    // 2. Deduplicate (strict text match per speaker, consecutive)
    segments = deduplicateSegments(segments);

    // 3. Sort chronologically (already sorted by MongoDB usually, but ensure)
    // Timestamps may be strings, so we keep the original order if no parseable timestamps

    // 4. Extract unique participants
    const participantSet = new Set<string>();
    segments.forEach((s) => participantSet.add(s.speaker));
    const participants = Array.from(participantSet);

    // 5. Cap transcript
    const MAX_SEGMENTS = 500;
    const cappedTranscript = segments.slice(0, MAX_SEGMENTS);

    // 6. Extract decisions from summary text (if available)
    const decisions = extractDecisions(summaryData?.summaryText || '');

    // 7. Format action items
    const actionItems: string[] = (actionItemsData || []).map(
      (item: any) => item.description || item.text || item.item || String(item)
    );

    // Build AI-optimized context
    const context: MeetingContext = {
      meetingId,
      title: summaryData?.meetingTitle || rawTranscript?.meetingTitle || 'Untitled Meeting',
      duration: null, // Will be enriched by analytics if available
      participants,
      summary: summaryData?.summaryText || null,
      actionItems,
      decisions,
      transcript: cappedTranscript,
    };

    return NextResponse.json(context);
  } catch (error: any) {
    console.error(`Error building meeting context for ${meetingId}:`, error);

    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to build meeting context', details: error?.message },
      { status: 500 }
    );
  }
}

// --- Utility functions ---

function normalizeSpeakerName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function deduplicateSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const result: TranscriptSegment[] = [];
  const seen = new Set<string>();

  for (const seg of segments) {
    const key = `${seg.speaker.toLowerCase()}::${seg.text.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(seg);
    }
  }
  return result;
}

function extractDecisions(summaryText: string): string[] {
  if (!summaryText) return [];

  const decisions: string[] = [];
  const lines = summaryText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // Look for decision-like patterns
    if (
      lower.includes('decided') ||
      lower.includes('agreed') ||
      lower.includes('approved') ||
      lower.includes('resolved') ||
      lower.includes('conclusion') ||
      lower.startsWith('decision:')
    ) {
      // Clean up bullet points and markers
      const cleaned = trimmed.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
      if (cleaned.length > 10 && cleaned.length < 300) {
        decisions.push(cleaned);
      }
    }
  }

  return decisions;
}
