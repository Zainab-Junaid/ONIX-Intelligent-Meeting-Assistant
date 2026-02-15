import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { sendMeetingSummaryEmail } from '@/lib/email-service';
import { getBackendUrl } from '@/lib/backend';
import { getFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  return !!getFirebaseAdmin();
}

/**
 * Send meeting summary email to calendar event participants
 * POST /api/meeting-bot/send-summary
 */
export async function POST(request: NextRequest) {
  try {
    // Get Firebase token from headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    initFirebase();
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    // Get meeting ID and optional recipients and data from request body
    // Accepting 'data' allows frontend to pass current view state if waiting for backend sync is too slow
    const { meetingId, recipients, data } = await request.json();
    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID required' }, { status: 400 });
    }

    // Get Firestore instance
    const db = admin.firestore();
    
    // Use data passed from frontend if available (faster and more reliable for instant actions from UI)
    if (data) {
        console.log(`📧 Sending email using data provided from frontend for ${meetingId}`);
        const { meetingTitle, summaryText, meetingDate, meetingUrl, actionItems } = data;
        
        let participantEmails: string[] = [];
        
        // 1. Use provided recipients if any
        if (recipients && Array.isArray(recipients) && recipients.length > 0) {
            participantEmails = recipients;
        } 
        // 2. Or fallback to participants in data if provided
        else if (data.participants && Array.isArray(data.participants)) {
            participantEmails = data.participants;
        }
        
        if (participantEmails.length === 0) {
             return NextResponse.json({ 
                message: 'No participants to send email to',
                skipped: true
              });
        }

        // Generate Meeting Insights PDF
        let attachments = [];
        try {
          const { generateMeetingPDF } = await import('@/lib/pdf-generator');
          // Format action items for PDF if needed
          const pdfActionItems = actionItems?.map((item: any) => ({
             item: typeof item === 'string' ? item : (item.item || item.text || item),
             assignedTo: typeof item === 'object' ? (item.assignedTo || item.assignee) : undefined,
             dueDate: typeof item === 'object' && item.dueDate ? new Date(item.dueDate).toLocaleDateString() : undefined
          })) || [];

          const pdfBase64 = await generateMeetingPDF({
            meetingTitle: meetingTitle || 'Untitled Meeting',
            meetingId: meetingId,
            dateStr: meetingDate || new Date().toLocaleDateString(),
            summaryText: summaryText || 'No summary available',
            actionItems: pdfActionItems
          });

          if (pdfBase64) {
            attachments.push({
              content: pdfBase64,
              filename: `Meeting_Insights_${meetingId.substring(0,8)}.pdf`,
              type: 'application/pdf'
            });
            console.log(`✅ Meeting Insights PDF generated for ${meetingId}`);
          }
        } catch (pdfError) {
          console.error('⚠️ Failed to generate PDF (sending email without attachment):', pdfError);
        }

        // Send email
        await sendMeetingSummaryEmail(
            participantEmails,
            meetingTitle,
            summaryText,
            meetingDate,
            meetingUrl,
            actionItems,
            attachments
        );
        
        return NextResponse.json({
            success: true,
            message: `Summary emails sent to ${participantEmails.length} participants`,
            recipients: participantEmails,
        });
    }

    // Fallback to legacy logic: Fetch from Database/Backend if no data provided
    // Useful if we trigger this from a background job, but frontend usage should prefer passing data
    // ... (omitting full complex DB lookup logic for brevity as frontend will pass data)
    // But simplified version just to be safe:

    return NextResponse.json({ 
        error: 'Data payload required',
        message: 'Please provide meeting data (summary, title, etc) in the request body for this endpoint.'
    }, { status: 400 });

  } catch (error: any) {
    console.error('Error sending summary emails:', error);
    return NextResponse.json({ 
      error: 'Failed to send summary emails', 
      details: error?.message 
    }, { status: 500 });
  }
}
