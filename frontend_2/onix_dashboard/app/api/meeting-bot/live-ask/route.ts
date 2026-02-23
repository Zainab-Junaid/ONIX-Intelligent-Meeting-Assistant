import { NextRequest, NextResponse } from 'next/server';
import { answerFromTranscriptSmart } from '@/lib/live-qa';
import { getBackendUrl } from '@/lib/backend';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, question, answerInEnglish, segments: clientSegments, meetingTitle: clientTitle } = body;

    if (!meetingId || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json(
        { error: 'meetingId and question are required' },
        { status: 400 }
      );
    }

    let segments: Array<{ speaker: string; text: string }> = [];
    let meetingTitle = 'Meeting';

    // Use client-provided segments if available (e.g. from UI that already has transcript)
    if (Array.isArray(clientSegments) && clientSegments.length > 0) {
      segments = clientSegments.map((s: any) => ({
        speaker: s.speaker ?? 'Speaker',
        text: typeof s.text === 'string' ? s.text : String(s.text ?? ''),
      }));
      if (typeof clientTitle === 'string' && clientTitle.trim()) meetingTitle = clientTitle.trim();
    }

    // Fetch from backend if no client segments
    if (segments.length === 0) {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/meetings/${encodeURIComponent(meetingId)}/transcript`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        if (res.status === 404) {
          return NextResponse.json({
            answer: 'No transcript available for this meeting yet. The bot may still be joining or the meeting may have ended.',
          });
        }
        const err = await res.json().catch(() => ({}));
        return NextResponse.json(
          { error: 'Failed to fetch transcript', details: err.error || res.statusText },
          { status: 502 }
        );
      }

      const meeting = await res.json();
      segments = meeting.segments || [];
      meetingTitle = meeting.meetingTitle || meeting.title || 'Meeting';
    }

    const transcript = segments
      .map((s: { speaker: string; text: string }) => `${s.speaker}: ${s.text}`)
      .join('\n');

    const replyInEnglish = answerInEnglish === true;
    const answer = await answerFromTranscriptSmart(
      { transcript, meetingTitle, question: question.trim(), answerInEnglish: replyInEnglish },
      process.env.ASSEMBLYAI_API_KEY
    );

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('[live-ask] error:', error);
    return NextResponse.json(
      { error: 'Live Q&A failed', details: error?.message },
      { status: 500 }
    );
  }
}
