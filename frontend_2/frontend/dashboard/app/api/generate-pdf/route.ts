import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function POST(req: NextRequest) {
  try {
    const { html } = await req.json();

    if (!html) {
      return NextResponse.json({ error: 'HTML content is required' }, { status: 400 });
    }

    // Launch puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const page = await browser.newPage();
    
    // Set content with some basic styling to ensure it looks good
    const styledHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              font-size: 14px;
              line-height: 1.5;
              color: #333;
              margin: 40px;
            }
            h1 { font-size: 24px; margin-bottom: 16px; font-weight: 700; }
            h2 { font-size: 20px; margin-top: 24px; margin-bottom: 12px; font-weight: 600; }
            h3 { font-size: 18px; margin-top: 20px; margin-bottom: 10px; font-weight: 600; }
            ul, ol { margin-left: 20px; margin-bottom: 16px; }
            li { margin-bottom: 4px; }
            p { margin-bottom: 12px; }
            .content { max-width: 800px; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="content">
            ${html}
          </div>
        </body>
      </html>
    `;

    await page.setContent(styledHtml, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm',
      },
    });

    await browser.close();

    // Return PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=meeting-summary.pdf',
      },
    });

  } catch (error: any) {
    console.error('PDF generation error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF', details: error.message }, { status: 500 });
  }
}
