/**
 * Email Service using Nodemailer (Mailgun SMTP)
 * Handles sending meeting summary emails with attachments
 */

import nodemailer from 'nodemailer';

// Create a transporter using SMTP settings from environment variables
const createTransporter = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️ SMTP configuration missing: SMTP_HOST, SMTP_USER, or SMTP_PASS');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export interface EmailAttachment {
  content: string; // Base64 encoded content
  filename: string;
  type: string;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  attachments?: EmailAttachment[];
}

/**
 * Send email using Nodemailer (Mailgun SMTP)
 * Set USE_MOCK_EMAIL=true in .env.local only if you want to test without sending real emails.
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const transporter = createTransporter();
  const useMock = process.env.USE_MOCK_EMAIL === 'true';

  if (useMock && !transporter) {
    console.log('🚧 MOCK EMAIL: SMTP not configured. Simulating send.');
    console.log('📧 Email Details:', { to: options.to, subject: options.subject, attachmentCount: options.attachments?.length || 0 });
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`✅ (MOCK) Email simulated to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    return;
  }

  if (!transporter) {
    throw new Error('Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env.local to send real emails.');
  }

  const fromEmail = options.from || process.env.SMTP_FROM_EMAIL || 'noreply@onixnotes.online';

  const mailOptions = {
    from: fromEmail,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments?.map(att => ({
      filename: att.filename,
      content: Buffer.from(att.content, 'base64'),
      contentType: att.type,
    })),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully via Mailgun to ${mailOptions.to}`);
  } catch (error: any) {
    console.error('❌ Error sending email via Mailgun:', JSON.stringify(error, null, 2));
    throw error;
  }
}

/**
 * Generate HTML email template for meeting summary (Premium Design)
 */
import { marked, Tokens } from 'marked';

// Custom renderer to add inline styles to HTML elements
class EmailRenderer extends marked.Renderer {
  heading({ tokens, depth }: { tokens: Tokens.Generic[]; depth: number }): string {
    const text = this.parser.parseInline(tokens);
    const styles = [
      'color: #1a202c; font-size: 24px; margin-top: 24px; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;', // h1
      'color: #2d3748; font-size: 20px; margin-top: 20px; color: #4a5568;', // h2
      'color: #4a5568; font-size: 18px; margin-top: 16px;', // h3
      'color: #4a5568; font-size: 16px; margin-top: 16px; font-weight: bold;', // h4
      'color: #4a5568; font-size: 14px; margin-top: 16px; font-weight: bold;', // h5
      'color: #4a5568; font-size: 12px; margin-top: 16px; font-weight: bold;', // h6
    ];
    return `<h${depth} style="${styles[depth - 1]}">${text}</h${depth}>`;
  }

  paragraph({ tokens }: { tokens: Tokens.Generic[] }): string {
    const text = this.parser.parseInline(tokens);
    return `<p style="margin-bottom: 16px; color: #4a5568; line-height: 1.6;">${text}</p>`;
  }

  list(token: Tokens.List): string {
    const type = token.ordered ? 'ol' : 'ul';
    const itemsHtml = token.items.map((item: Tokens.ListItem) => this.listitem(item)).join('');
    return `<${type} style="padding-left: 20px; margin-bottom: 16px; color: #4a5568;">${itemsHtml}</${type}>`;
  }

  listitem(item: Tokens.ListItem): string {
    let content: string;
    try {
      content = item.tokens && item.tokens.length > 0
        ? this.parser.parse(item.tokens)
        : (item.raw?.trim() ?? '');
    } catch {
      content = (item as any).raw?.trim() ?? (item as any).text ?? '';
    }
    return `<li style="margin-bottom: 8px;">${content}</li>`;
  }

  strong({ tokens }: { tokens: Tokens.Generic[] }): string {
    const text = this.parser.parseInline(tokens);
    return `<strong style="font-weight: 600; color: #2d3748;">${text}</strong>`;
  }
}

/**
 * Generate HTML email template for meeting summary (Premium Design)
 */
export function generateSummaryEmailHTML(
  meetingTitle: string,
  summaryText: string,
  meetingDate: string,
  meetingUrl?: string,
  actionItems?: any[]
): string {
  // Parse summary using marked with custom renderer
  const formattedSummary = marked.parse(summaryText, { renderer: new EmailRenderer(), async: false });

  const actionItemsHTML = actionItems && actionItems.length > 0
    ? `
      <div style="margin-top: 32px;">
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="width: 4px; height: 24px; background-color: #ed8936; border-radius: 2px; margin-right: 12px;"></div>
          <h3 style="color: #1a202c; font-size: 22px; font-weight: 700; margin: 0;">Action Items</h3>
        </div>
        <ul style="padding-left: 24px; margin: 0; color: #4a5568; line-height: 1.8; font-size: 16px; list-style-type: disc;">
          ${actionItems.map(item => {
            const text = typeof item === 'string' ? item : (item.text || item.item || '');
            return `<li style="margin-bottom: 8px;">${text}</li>`;
          }).join('')}
        </ul>
      </div>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    </head>
    <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #2d3748; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f7fafc;">
      <div style="background-color: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7; padding-bottom: 24px; margin-bottom: 32px;">
          <div>
            <h1 style="color: #1a202c; font-size: 28px; font-weight: 700; margin: 0 0 8px 0;">ONIX Meeting Insights</h1>
            <p style="color: #718096; font-size: 14px; margin: 0;">${meetingDate}</p>
          </div>
          <div style="background-color: #ebf4ff; color: #3182ce; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
            AI Powered
          </div>
        </div>
        
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; border-radius: 12px; color: white; margin-bottom: 40px;">
          <h2 style="font-size: 24px; font-weight: 700; margin: 0;">${meetingTitle}</h2>
          <p style="opacity: 0.9; margin: 8px 0 0 0; font-size: 16px;">Complete summary and action items from your meeting.</p>
        </div>

        <div style="margin-top: 32px;">
          <div style="display: flex; align-items: center; margin-bottom: 16px;">
            <div style="width: 4px; height: 24px; background-color: #4c51bf; border-radius: 2px; margin-right: 12px;"></div>
            <h3 style="color: #1a202c; font-size: 22px; font-weight: 700; margin: 0;">Summary</h3>
          </div>
          <div style="color: #4a5568; line-height: 1.8; font-size: 16px;">
            ${formattedSummary}
          </div>
        </div>

        ${actionItemsHTML}
        
        <div style="margin-top: 40px; padding: 24px; background-color: #ebf8ff; border-radius: 12px; border: 1px solid #bee3f8; text-align: center;">
          <p style="margin: 0; color: #2c5282; font-weight: 500;">📎 Meeting insights are attached as a PDF</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send meeting summary email to participants
 */
export async function sendMeetingSummaryEmail(
  participantEmails: string[],
  meetingTitle: string,
  summaryText: string,
  meetingDate: string,
  meetingUrl?: string,
  actionItems?: any[],
  attachments?: EmailAttachment[]
): Promise<void> {
  if (participantEmails.length === 0) {
    console.log('⚠️ No participant emails provided, skipping email send');
    return;
  }

  const html = generateSummaryEmailHTML(meetingTitle, summaryText, meetingDate, meetingUrl, actionItems);
  const subject = `Meeting Summary: ${meetingTitle}`;

  try {
    await sendEmail({
      to: participantEmails,
      subject,
      html,
      attachments
    });
    console.log(`✅ Meeting summary emails sent to ${participantEmails.length} participants`);
  } catch (error) {
    console.error('❌ Failed to send meeting summary emails:', JSON.stringify(error, null, 2));
    throw error;
  }
}
