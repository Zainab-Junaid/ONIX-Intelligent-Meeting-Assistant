import { NextRequest, NextResponse } from 'next/server';
import { answerFromTranscriptSmart } from '@/lib/live-qa';

// Allow Chrome extension origin for live-ask (sidepanel calls dashboard)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript, meetingTitle, question, answerInEnglish } = body;

    if (typeof question !== 'string' || !question.trim()) {
      return NextResponse.json(
        { error: 'question is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const transcriptStr = typeof transcript === 'string' ? transcript : '';
    const title = typeof meetingTitle === 'string' && meetingTitle.trim() ? meetingTitle.trim() : 'This meeting';
    const replyInEnglish = answerInEnglish === true;

    const answer = await answerFromTranscriptSmart(
      { transcript: transcriptStr, meetingTitle: title, question: question.trim(), answerInEnglish: replyInEnglish },
      process.env.ASSEMBLYAI_API_KEY
    );

    return NextResponse.json({ answer }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('[extension live-ask] error:', error);
    return NextResponse.json(
      { error: 'Live Q&A failed', details: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
