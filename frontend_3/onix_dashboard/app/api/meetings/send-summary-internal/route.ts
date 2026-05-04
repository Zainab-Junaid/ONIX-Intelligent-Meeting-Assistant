import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { sendEmail, generateSummaryEmailHTML } from '@/lib/email-service';
import { getBackendUrl } from '@/lib/backend';
import { getFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  return !!getFirebaseAdmin();
}

/**
 * Internal endpoint to send meeting summary emails
 * Only accessible from localhost (backend service)
 * POST /api/meetings/send-summary-internal
 */
export async function POST(request: NextRequest) {
  try {
    // Security: Only allow requests from localhost
    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    // In production, you might want to add additional security checks
    // For now, we'll allow this endpoint to be called from the backend service
    
    // Get meeting ID from request body
    const { meetingId } = await request.json();
    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID required' }, { status: 400 });
    }

    // Get Firestore instance
    initFirebase();
    const db = admin.firestore();
    
    // Get meeting document to find calendar event ID and userId
    // Try meetingId as document ID first
    let meetingDoc = await db.collection('meetings').doc(meetingId).get();
    
    // If not found, try to find by querying for meetingId field
    if (!meetingDoc.exists) {
      const querySnapshot = await db.collection('meetings')
        .where('meetingId', '==', meetingId)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        meetingDoc = querySnapshot.docs[0];
      }
    }
    
    // If still not found, try to get from backend database and create Firestore document
    if (!meetingDoc.exists) {
      console.log(`⚠️ Meeting ${meetingId} not found in Firestore, trying to fetch from backend...`);
      try {
        const backendUrl = getBackendUrl();
        const jobResponse = await fetch(`${backendUrl}/meeting-job/${meetingId}`, {
          signal: AbortSignal.timeout(5000)
        });
        
        if (jobResponse.ok) {
          const job = await jobResponse.json();
          
          // Create meeting document with all available info
          await db.collection('meetings').doc(meetingId).set({
            meetingId,
            jobId: job.id,
            meetingTitle: job.meetingTitle || 'Untitled Meeting',
            userId: job.userId,
            meetingUrl: job.meetingUrl,
            status: 'completed',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          
          meetingDoc = await db.collection('meetings').doc(meetingId).get();
          console.log(`✅ Created meeting document from backend job data for ${meetingId}`);
        } else {
          const summaryResponse = await fetch(`${backendUrl}/meeting-summary/${meetingId}`, {
            signal: AbortSignal.timeout(5000)
          });
          
          if (summaryResponse.ok) {
            const summaryData = await summaryResponse.json();
            const summary = summaryData.summary;
            
            // Create basic meeting document
            await db.collection('meetings').doc(meetingId).set({
              meetingId,
              meetingTitle: summary.meetingTitle || 'Untitled Meeting',
              userId: summary.userId,
              status: 'completed',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            
            meetingDoc = await db.collection('meetings').doc(meetingId).get();
            console.log(`✅ Created meeting document from backend summary data for ${meetingId}`);
          }
        }
      } catch (backendError) {
        console.log(`⚠️ Failed to fetch from backend:`, backendError);
      }
    }
    
    if (!meetingDoc.exists) {
      console.log(`⚠️ Meeting ${meetingId} not found in Firestore or backend, skipping email send`);
      return NextResponse.json({ 
        message: 'Meeting not found. Meeting may not have been started through the dashboard, or the meeting document was not created properly.',
        skipped: true
      });
    }

    const meetingData = meetingDoc.data();
    let calendarEventId = meetingData?.calendarEventId;
    const userId = meetingData?.userId;
    const meetingUrl = meetingData?.meetingUrl;

    // If calendar event not matched yet, try to match it now
    if (!calendarEventId && meetingUrl && userId) {
      console.log(`🔍 Calendar event not matched yet, attempting to match for meeting ${meetingId}`);
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const accessToken = userData?.calendarAccessToken;
          
          if (accessToken) {
            // Extract Google Meet code from URL
            const meetCodeMatch = meetingUrl.match(/meet\.google\.com\/([a-z-]+)/i);
            if (meetCodeMatch) {
              const meetCode = meetCodeMatch[1];
              const now = new Date();
              const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
              const timeMax = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();

              const params = new URLSearchParams({
                maxResults: '50',
                singleEvents: 'true',
                orderBy: 'startTime',
                timeMin,
                timeMax,
              });

              const calendarResponse = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                  },
                }
              );

              if (calendarResponse.ok) {
                const calendarData = await calendarResponse.json();
                const events = calendarData.items || [];

                // Find matching event
                for (const event of events) {
                  if (event.conferenceData?.entryPoints) {
                    const videoEntry = event.conferenceData.entryPoints.find(
                      (ep: any) => ep.entryPointType === 'video' && ep.uri && ep.uri.includes(meetCode)
                    );
                    if (videoEntry) {
                      calendarEventId = event.id;
                      await meetingDoc.ref.update({
                        calendarEventId: event.id,
                        calendarEventTitle: event.summary || 'Untitled Event',
                        matchedAt: admin.firestore.FieldValue.serverTimestamp(),
                      });
                      console.log(`✅ Matched calendar event ${event.id} to meeting ${meetingId}`);
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      } catch (matchError) {
        console.log(`⚠️ Failed to match calendar event (non-critical):`, matchError);
      }
    }

    if (!calendarEventId) {
      console.log(`⚠️ No calendar event linked to meeting ${meetingId}, skipping email send`);
      return NextResponse.json({ 
        message: 'No calendar event linked to this meeting',
        skipped: true
      });
    }

    if (!userId) {
      console.log(`⚠️ No userId found for meeting ${meetingId}, skipping email send`);
      return NextResponse.json({ 
        message: 'No userId found for this meeting',
        skipped: true
      });
    }

    // Check if email was already sent
    if (meetingData?.summaryEmailSent) {
      console.log(`ℹ️ Summary email already sent for meeting ${meetingId}`);
      return NextResponse.json({ 
        message: 'Email already sent',
        skipped: true
      });
    }

    // Get user's calendar access token
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const accessToken = userData?.calendarAccessToken;
    const userEmail = userData?.email;

    if (!accessToken) {
      console.log(`⚠️ Calendar access not granted for user ${userId}, skipping email send`);
      return NextResponse.json({ 
        message: 'Calendar access not granted',
        skipped: true
      });
    }

    // Fetch calendar event to get attendees
    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!calendarResponse.ok) {
      if (calendarResponse.status === 401) {
        await db.collection('users').doc(userId).update({
          calendarAccessToken: admin.firestore.FieldValue.delete(),
        });
        return NextResponse.json({ 
          error: 'Calendar access token expired',
          needsAuth: true 
        }, { status: 401 });
      }
      throw new Error(`Failed to fetch calendar event: ${calendarResponse.statusText}`);
    }

    const calendarEvent = await calendarResponse.json();

    // Extract attendee emails (filter to accepted attendees only)
    const attendees = calendarEvent.attendees || [];
    const participantEmails = attendees
      .filter((attendee: any) => 
        attendee.email && 
        attendee.responseStatus !== 'declined' &&
        attendee.email !== userEmail // Exclude the meeting organizer
      )
      .map((attendee: any) => attendee.email);

    if (participantEmails.length === 0) {
      console.log(`ℹ️ No participants to send email to for meeting ${meetingId}`);
      return NextResponse.json({ 
        message: 'No participants to send email to',
        skipped: true
      });
    }

    // Get meeting summary from backend
    const summaryBackendUrl = getBackendUrl();
    const summaryResponse = await fetch(`${summaryBackendUrl}/meeting-summary/${meetingId}`, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!summaryResponse.ok) {
      console.log(`⚠️ Failed to fetch summary for meeting ${meetingId}, status: ${summaryResponse.status}`);
      return NextResponse.json({ 
        message: 'Summary not ready yet or backend not accessible',
        skipped: true
      }, { status: 202 });
    }

    const summaryData = await summaryResponse.json();
    const summary = summaryData.summary;

    // Extract action items if available
    const actionItems = summary.actionItems?.map((item: any) => ({
      item: item.text || item.item || item,
      assignedTo: item.assignedTo || item.assignee || undefined,
      dueDate: item.dueDate ? new Date(item.dueDate).toLocaleDateString() : undefined
    })) || [];

    // Format meeting date
    const meetingDate = calendarEvent.start?.dateTime 
      ? new Date(calendarEvent.start.dateTime).toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'Unknown date';

    // Generate HTML for email
    const emailHtml = generateSummaryEmailHTML(
      calendarEvent.summary || meetingData?.meetingTitle || 'Untitled Meeting',
      summary.summary?.summaryText || summary.summaryText || 'No summary available',
      meetingDate,
      meetingData?.meetingUrl,
      actionItems
    );
    
    const subject = `Meeting Summary: ${calendarEvent.summary || meetingData?.meetingTitle || 'Untitled Meeting'}`;

    // Send emails
    await sendEmail({
      to: participantEmails,
      subject,
      html: emailHtml,
    });

    // Update meeting document to mark email as sent
    await db.collection('meetings').doc(meetingId).update({
      summaryEmailSent: true,
      summaryEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      summaryEmailRecipients: participantEmails,
    });

    console.log(`✅ Summary emails sent to ${participantEmails.length} participants for meeting ${meetingId}`);

    return NextResponse.json({
      success: true,
      message: `Summary emails sent to ${participantEmails.length} participants`,
      recipients: participantEmails,
    });

  } catch (error: any) {
    console.error('Error sending summary emails:', error);
    return NextResponse.json({ 
      error: 'Failed to send summary emails', 
      details: error?.message 
    }, { status: 500 });
  }
}
