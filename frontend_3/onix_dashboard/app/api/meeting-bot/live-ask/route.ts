import { NextRequest, NextResponse } from 'next/server';
import { answerFromTranscriptSmart } from '@/lib/live-qa';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, question, answerInEnglish } = body;

    if (!meetingId || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json(
        { error: 'meetingId and question are required' },
        { status: 400 }
      );
    }

    let transcript = body.transcript;
    let meetingTitle = body.meetingTitle || 'Meeting';

    // If transcript not provided by client, try to fetch from backend (legacy/fallback)
    if (!transcript) {
        const res = await fetch(`${BACKEND_URL}/transcript/${encodeURIComponent(meetingId)}`, {
        cache: 'no-store',
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
        const segments = meeting.segments || [];
        transcript = segments
        .map((s: { speaker: string; text: string }) => `${s.speaker}: ${s.text}`)
        .join('\n');
        meetingTitle = meeting.title || 'Meeting';
    }

    const replyInEnglish = answerInEnglish === true;
    const answer = await answerFromTranscriptSmart(
      { transcript, meetingTitle, question: question.trim(), answerInEnglish: replyInEnglish },
      // Use env var or default if not set
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
