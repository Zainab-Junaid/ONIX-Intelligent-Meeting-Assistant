import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { sendEmail, generateSummaryEmailHTML } from '@/lib/email-service';
import { getBackendUrl } from '@/lib/backend';
import { getFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  return !!getFirebaseAdmin();
}

/**
 * Send meeting summary email to calendar event participants
 * POST /api/meetings/send-summary
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
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    // Get meeting ID and optional recipients from request body
    const { meetingId, recipients } = await request.json();
    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID required' }, { status: 400 });
    }

    // Get Firestore instance
    initFirebase();
    const db = admin.firestore();
    
    // Get meeting document to find calendar event ID
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
      return NextResponse.json({ 
        error: 'Meeting not found',
        message: 'Meeting document not found. The meeting may not have been started through the dashboard, or the backend is not accessible.'
      }, { status: 404 });
    }

    const meetingData = meetingDoc.data();
    let calendarEventId = meetingData?.calendarEventId;
    const meetingUrl = meetingData?.meetingUrl;
    const meetingUserId = meetingData?.userId;

    // Get user's calendar access token first (needed for calendar matching)
    if (!meetingUserId) {
      return NextResponse.json({ 
        error: 'User ID not found',
        message: 'Meeting document does not have a userId'
      }, { status: 400 });
    }

    const meetingUserDoc = await db.collection('users').doc(meetingUserId).get();
    if (!meetingUserDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const meetingUserData = meetingUserDoc.data();
    const meetingAccessToken = meetingUserData?.calendarAccessToken;

    if (!meetingAccessToken) {
      return NextResponse.json({ 
        error: 'Calendar access not granted',
        needsAuth: true 
      }, { status: 403 });
    }

    // If calendar event not matched yet, try to match it now
    if (!calendarEventId && meetingUrl) {
      console.log(`🔍 Calendar event not matched yet, attempting to match for meeting ${meetingId}`);
      try {
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
                Authorization: `Bearer ${meetingAccessToken}`,
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
      } catch (matchError) {
        console.log(`⚠️ Failed to match calendar event:`, matchError);
      }
    }

    if (!calendarEventId && (!recipients || recipients.length === 0)) {
       // If no calendar event matched AND no recipients provided manually
      return NextResponse.json({ 
        error: 'No calendar event linked to this meeting',
        message: 'Meeting was not matched to a calendar event. Please ensure the meeting URL matches a calendar event.'
      }, { status: 404 });
    }

    let participantEmails: string[] = [];
    let calendarEvent: any = {}; // Declare calendarEvent here to ensure it's always available

    if (recipients && Array.isArray(recipients) && recipients.length > 0) {
      participantEmails = recipients;
      console.log(`📧 Using provided recipient list: ${participantEmails.join(', ')}`);

      // If recipients are provided, we still need to fetch the calendar event for metadata (title, date)
      // Only attempt if we have a calendarEventId
      if (calendarEventId) {
          const calendarResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}`,
            {
              headers: {
                Authorization: `Bearer ${meetingAccessToken}`,
              },
            }
          );

          if (calendarResponse.ok) {
            calendarEvent = await calendarResponse.json();
          } else if (calendarResponse.status === 401) {
              await db.collection('users').doc(meetingUserId).update({
                calendarAccessToken: admin.firestore.FieldValue.delete(),
              });
              // We can continue without calendar metadata if necessary
              console.warn('Calendar token expired, continuing with partial metadata');
          }
      }

    } else {
      // Fetch calendar event to get attendees
      const calendarResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}`,
        {
          headers: {
            Authorization: `Bearer ${meetingAccessToken}`,
          },
        }
      );

      if (!calendarResponse.ok) {
        if (calendarResponse.status === 401) {
          await db.collection('users').doc(meetingUserId).update({
            calendarAccessToken: admin.firestore.FieldValue.delete(),
          });
          return NextResponse.json({ 
            error: 'Calendar access token expired',
            needsAuth: true 
          }, { status: 401 });
        }
        throw new Error(`Failed to fetch calendar event: ${calendarResponse.statusText}`);
      }

      calendarEvent = await calendarResponse.json();

      // Extract attendee emails (filter to accepted attendees only)
      const attendees = calendarEvent.attendees || [];
      participantEmails = attendees
        .filter((attendee: any) => 
          attendee.email && 
          attendee.responseStatus !== 'declined' &&
          attendee.email !== meetingUserData?.email // Exclude the meeting organizer
        )
        .map((attendee: any) => attendee.email);
    }

    if (participantEmails.length === 0) {
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
      throw new Error('Failed to fetch meeting summary from backend');
    }

    const summaryData = await summaryResponse.json();
    const summary = summaryData.summary;

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
      : (meetingData?.createdAt?.toDate ? meetingData.createdAt.toDate().toLocaleString() : 'Recent meeting');

    // Extract action items if available
    const actionItems = summary.actionItems?.map((item: any) => ({
      item: item.text || item.item || item,
      assignedTo: item.assignedTo || item.assignee || undefined,
      dueDate: item.dueDate ? new Date(item.dueDate).toLocaleDateString() : undefined
    })) || [];

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
