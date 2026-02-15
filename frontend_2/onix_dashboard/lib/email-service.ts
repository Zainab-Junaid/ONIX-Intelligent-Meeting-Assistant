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
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const transporter = createTransporter();

  if (!transporter) {
    throw new Error('Email service not configured. Please check SMTP environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS).');
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
    console.error('❌ Error sending email via Mailgun:', error);
    throw error;
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
  // Parse summary for better display
  const formattedSummary = summaryText
    .replace(/^# (.*$)/gim, '<h1 style="color: #1a202c; font-size: 24px; margin-top: 24px; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">$1</h1>')
    .replace(/^## (.*$)/gim, '<h2 style="color: #2d3748; font-size: 20px; margin-top: 20px; color: #4a5568;">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 style="color: #4a5568; font-size: 18px; margin-top: 16px;">$1</h3>')
    .replace(/^\- (.*$)/gim, '<li style="margin-bottom: 8px; color: #4a5568;">$1</li>')
    .replace(/\n\n/g, '<br/>');

  const actionItemsHTML = actionItems && actionItems.length > 0
    ? `
      <div style="margin-top: 32px; padding: 24px; background-color: #fffaf0; border: 1px solid #feebc8; border-radius: 12px; border-left: 6px solid #ed8936;">
        <h3 style="color: #c05621; font-size: 20px; margin: 0 0 16px 0; display: flex; align-items: center;">
          <span style="margin-right: 8px;">📋</span> Action Items
        </h3>
        <ul style="list-style-type: none; padding: 0; margin: 0; color: #2d3748;">
          ${actionItems.map(item => {
            const text = typeof item === 'string' ? item : (item.text || item.item || '');
            const assignedTo = item.assignedTo ? `<span style="background-color: #fbd38d; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px; font-weight: bold; color: #744210;">@${item.assignedTo}</span>` : '';
            const dueDate = item.dueDate ? `<span style="font-size: 12px; color: #718096; margin-left: 8px;">📅 ${typeof item.dueDate === 'string' ? item.dueDate : 'Soon'}</span>` : '';
            return `<li style="margin-bottom: 12px; padding: 12px; background: white; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #fef3c7;">
                      <div style="font-weight: 500;">${text}</div>
                      <div style="margin-top: 4px;">${assignedTo}${dueDate}</div>
                    </li>`;
          }).join('')}
        </ul>
      </div>
    `
    : '';

  const meetingLinkHTML = meetingUrl
    ? `
      <div style="text-align: center; margin-top: 40px;">
        <a href="${meetingUrl}" style="background-color: #4c51bf; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: inline-block;">
          View Full Details in Dashboard
        </a>
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
        
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px; border-radius: 12px; color: white; margin-bottom: 40px;">
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
          <p style="margin: 0; color: #2c5282; font-weight: 500;">📎 Detailed meeting insights are attached as a PDF</p>
          <p style="margin: 8px 0 0 0; color: #4299e1; font-size: 14px;">Includes Summary and formatted Action Items table.</p>
        </div>

        ${meetingLinkHTML}

        <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #edf2f7; color: #a0aec0; font-size: 12px; text-align: center;">
          <p style="margin: 0;">This report was automatically synthesized by <strong>ONIX AI Assistant</strong></p>
          <p style="margin: 4px 0 0 0;">Focused on making your meetings more productive.</p>
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
    console.error('❌ Failed to send meeting summary emails:', error);
    throw error;
  }
}
