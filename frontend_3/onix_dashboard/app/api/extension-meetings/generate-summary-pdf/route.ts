import { NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import { handleOptions, withCors } from '../../../../lib/cors';


const GUEST_MEETING_ID = '00000000-0000-0000-0000-000000000000';

/** Strip markdown and return lines with a flag for section headers (was # / ## / ###). */
function formatSummaryLines(raw: string): { text: string; isSectionHeader: boolean }[] {
  const out: { text: string; isSectionHeader: boolean }[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push({ text: '', isSectionHeader: false });
      continue;
    }
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const title = headerMatch[2]
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .trim();
      out.push({ text: title, isSectionHeader: true });
    } else {
      const plain = trimmed
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .trim();
      out.push({ text: plain, isSectionHeader: false });
    }
  }
  return out;
}

/**
 * POST /api/extension-meetings/generate-summary-pdf
 * Guest only (x-guest-mode: true). Body: { transcript, meetingTitle? }.
 * Calls generate-summary API then returns a PDF of the summary and action items.
 */

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('x-guest-mode') !== 'true') {
      return withCors(NextResponse.json({ error: 'Guest mode required' }, { status: 403 }));
    }

    const body = await request.json();
    const { transcript, meetingTitle = 'Meeting' } = body;

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return withCors(NextResponse.json(
        { error: 'transcript is required' },
        { status: 400 }
      ));
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
      return withCors(NextResponse.json(
        { error: err.error || 'Summary generation failed' },
        { status: summaryRes.status }
      ));
    }

    const data = await summaryRes.json();
    const summaryText = data.summary?.text ?? 'No summary available.';
    const actionItems = Array.isArray(data.actionItems) ? data.actionItems : [];
    const title = (meetingTitle && String(meetingTitle).trim()) || 'Meeting';
    const dateStr = new Date().toLocaleString();

    // Build PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPos = 20;

    // Header
    doc.setFillColor(40, 167, 69); // green
    doc.rect(0, 0, pageWidth, 36, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('Meeting Summary', margin, 14);
    doc.setFontSize(10);
    doc.text(`Generated ${dateStr}`, margin, 24);

    yPos = 48;
    doc.setTextColor(0, 0, 0);

    // Title
    doc.setFontSize(16);
    const titleLines = doc.splitTextToSize(title, pageWidth - 2 * margin);
    doc.text(titleLines, margin, yPos);
    yPos += titleLines.length * 7 + 4;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${dateStr}`, margin, yPos);
    yPos += 12;
    doc.setTextColor(0, 0, 0);

    // Summary (proper formatting: section headers from ### as bold, no raw markdown)
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', margin, yPos);
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const maxW = pageWidth - 2 * margin;
    const formatted = formatSummaryLines(summaryText);
    for (const { text, isSectionHeader } of formatted) {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      if (!text) {
        yPos += 4;
        continue;
      }
      const lines = doc.splitTextToSize(text, maxW);
      if (isSectionHeader) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(lines[0], margin, yPos);
        yPos += 6;
        for (let i = 1; i < lines.length; i++) {
          if (yPos > 270) { doc.addPage(); yPos = 20; }
          doc.text(lines[i], margin, yPos);
          yPos += 5;
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        yPos += 2;
      } else {
        for (const line of lines) {
          if (yPos > 270) { doc.addPage(); yPos = 20; }
          doc.text(line, margin, yPos);
          yPos += 5;
        }
      }
    }
    yPos += 10;

    // Action items
    if (actionItems.length > 0) {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Action Items', margin, yPos);
      yPos += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      for (const item of actionItems) {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        const text = item.text || '';
        const assigned = item.assignedTo ? ` (@${item.assignedTo})` : '';
        const due = item.dueDate ? ` — ${item.dueDate}` : '';
        const full = `• ${text}${assigned}${due}`;
        const itemLines = doc.splitTextToSize(full, pageWidth - 2 * margin - 4);
        for (const ln of itemLines) {
          doc.text(ln, margin + 4, yPos);
          yPos += 5;
        }
        yPos += 2;
      }
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
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
    return withCors(NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate PDF' },
      { status: 500 }
    ));
  }
}
