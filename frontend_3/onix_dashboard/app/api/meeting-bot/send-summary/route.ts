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
  console.log('🚀 [API] POST /api/meeting-bot/send-summary - Started');
  try {
    // Get Firebase token from headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('❌ [API] No auth token provided');
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    try {
        initFirebase();
        const decodedToken = await getAuth().verifyIdToken(token);
        console.log(`👤 [API] Authenticated user: ${decodedToken.uid}`);
    } catch (authError) {
        console.error('❌ [API] Auth validation failed:', authError);
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // Get meeting ID and optional recipients and data from request body
    const body = await request.json();
    const { meetingId, recipients, data } = body;
    
    console.log(`📝 [API] Request Data: MeetingID=${meetingId}, Recipients=${recipients?.length}, DataProvided=${!!data}`);

    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID required' }, { status: 400 });
    }
    
    // Use data passed from frontend if available
    if (data) {
        console.log(`📧 [API] Processing email with frontend data for ${meetingId}`);
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
             console.log('⚠️ [API] No participants found to send email to.');
             return NextResponse.json({ 
                message: 'No participants to send email to',
                skipped: true
              });
        }

        console.log(`👥 [API] Target Recipients: ${participantEmails.join(', ')}`);

        // Generate Meeting Insights PDF
        let attachments: any[] = [];
        try {
          console.log('📄 [API] Generating PDF...');
          const { generateMeetingPDF } = await import('@/lib/pdf-generator');
          
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
            console.log(`✅ [API] PDF Generated successfully.`);
          } else {
            console.log(`⚠️ [API] PDF Generation returned null/empty.`);
          }
        } catch (pdfError) {
          console.error('⚠️ [API] Failed to generate PDF (sending email without attachment):', pdfError);
        }

        // Send email
        console.log('📨 [API] Sending email via service...');
        try {
            await sendMeetingSummaryEmail(
                participantEmails,
                meetingTitle,
                summaryText,
                meetingDate,
                meetingUrl,
                actionItems,
                attachments
            );
            console.log('✅ [API] Email service returned success.');
        } catch (emailServiceError) {
            console.error('❌ [API] Email service threw error:', emailServiceError);
            throw emailServiceError;
        }
        
        return NextResponse.json({
            success: true,
            message: `Summary emails sent to ${participantEmails.length} participants`,
            recipients: participantEmails,
        });
    }

    return NextResponse.json({ 
        error: 'Data payload required',
        message: 'Please provide meeting data (summary, title, etc) in the request body for this endpoint.'
    }, { status: 400 });

  } catch (error: any) {
    console.error('❌ [API] Critical Error in send-summary route:', error);
    return NextResponse.json({ 
      error: 'Failed to send summary emails', 
      details: error?.message 
    }, { status: 500 });
  }
}
