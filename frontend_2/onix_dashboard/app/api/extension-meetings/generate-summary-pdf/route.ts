import { NextRequest, NextResponse } from 'next/server';
import { generateMeetingPDF } from '@/lib/pdf-generator';

const GUEST_MEETING_ID = '00000000-0000-0000-0000-000000000000';

/**
 * POST /api/extension-meetings/generate-summary-pdf
 * Guest only (x-guest-mode: true). Body: { transcript, meetingTitle? }.
 * Calls generate-summary API then returns a PDF of the summary and action items.
 * Uses F2's pdf-generator for layout.
 */
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('x-guest-mode') !== 'true') {
      return NextResponse.json({ error: 'Guest mode required' }, { status: 403 });
    }

    const body = await request.json();
    const { transcript, meetingTitle = 'Meeting' } = body;

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return NextResponse.json(
        { error: 'transcript is required' },
        { status: 400 }
      );
    }

    // Invoke summary API (same origin as this request)
    const origin = request.nextUrl?.origin || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const summaryUrl = `${origin}/api/extension-meetings/generate-summary`;
    const summaryRes = await fetch(summaryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-guest-mode': 'true',
      },
      body: JSON.stringify({
        meetingId: GUEST_MEETING_ID,
        transcript: transcript.trim(),
      }),
    });

    if (!summaryRes.ok) {
      const err = await summaryRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error || 'Summary generation failed' },
        { status: summaryRes.status }
      );
    }

    const data = await summaryRes.json();
    const summaryText = data.summary?.text ?? 'No summary available.';
    const rawActionItems = Array.isArray(data.actionItems) ? data.actionItems : [];
    const title = (meetingTitle && String(meetingTitle).trim()) || 'Meeting';
    const dateStr = new Date().toLocaleString();

    // Map API action items (text, assignedTo?, dueDate?) to pdf-generator shape (item, assignedTo?, dueDate?)
    const actionItems = rawActionItems.map((item: { text?: string; assignedTo?: string; dueDate?: string }) => ({
      item: item.text ?? '',
      assignedTo: item.assignedTo,
      dueDate: item.dueDate != null ? String(item.dueDate) : undefined,
    }));

    const pdfBase64 = await generateMeetingPDF({
      meetingTitle: title,
      meetingId: GUEST_MEETING_ID,
      dateStr,
      summaryText,
      actionItems,
    });

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_summary.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error: unknown) {
    console.error('[generate-summary-pdf]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
