import { NextRequest, NextResponse } from 'next/server';
import { answerFromTranscriptSmart } from '@/lib/live-qa';
import { handleOptions, withCors } from '../../../../lib/cors';




export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript, meetingTitle, question, answerInEnglish } = body;

    if (typeof question !== 'string' || !question.trim()) {
      return withCors(NextResponse.json(
        { error: 'question is required' },
        { status: 400 }
      ));
    }

    const transcriptStr = typeof transcript === 'string' ? transcript : '';
    const title = typeof meetingTitle === 'string' && meetingTitle.trim() ? meetingTitle.trim() : 'This meeting';
    const replyInEnglish = answerInEnglish === true;

    const answer = await answerFromTranscriptSmart(
      { transcript: transcriptStr, meetingTitle: title, question: question.trim(), answerInEnglish: replyInEnglish },
      process.env.ASSEMBLYAI_API_KEY
    );

    return withCors(NextResponse.json({ answer }));
  } catch (error: any) {
    console.error('[extension live-ask] error:', error);
    return withCors(NextResponse.json(
      { error: 'Live Q&A failed', details: error?.message },
      { status: 500 }
    ));
  }
}
