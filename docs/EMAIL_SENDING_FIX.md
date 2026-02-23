# Email Sending Fix - Summary

## Issues Fixed

### 1. **No Manual Email Option**
   - **Problem**: Users had no way to manually send emails after summary generation
   - **Solution**: Added "Send Email to Participants" button on the summaries page
   - **Location**: `frontend/dashboard/app/summaries/page.tsx`

### 2. **Automatic Email Not Working**
   - **Problem**: Backend couldn't reach frontend API (URL issues)
   - **Solution**: 
     - Added multiple URL fallbacks (localhost, host.docker.internal, etc.)
     - Better error handling and logging
     - Timeout protection
   - **Location**: `google-meet-meeting-bot/src/backend/server.ts`

### 3. **Calendar Event Matching**
   - **Problem**: Email sending failed if calendar event wasn't matched at start
   - **Solution**: Automatic calendar event matching when sending emails
   - **Location**: `frontend/dashboard/app/api/meetings/send-summary/route.ts`

### 4. **Meeting Document Lookup**
   - **Problem**: Meeting documents might not be found by meetingId
   - **Solution**: Multiple lookup strategies (by ID, by query, etc.)
   - **Location**: Both send-summary endpoints

## New Features

### Manual Email Sending
- **Button Location**: On each summary card in the summaries page
- **Functionality**:
  - Click "Send Email to Participants" button
  - Shows loading state while sending
  - Displays success/error message
  - Automatically matches calendar event if needed
  - Sends to all accepted attendees

### Improved Automatic Sending
- **Better URL Resolution**: Tries multiple URLs to reach frontend
- **Better Logging**: More detailed logs for debugging
- **Graceful Failures**: Won't break summary generation if email fails

## How to Use

### Manual Email Sending

1. Go to **Summaries** page (`/summaries`)
2. Find the meeting summary you want to send
3. Click **"Send Email to Participants"** button
4. Wait for confirmation message
5. Check participant inboxes

### Automatic Email Sending

Automatic sending happens when:
1. Meeting ends
2. Summary is generated
3. Backend automatically calls frontend API
4. Emails are sent to participants

**Note**: For automatic sending to work:
- Frontend must be running on port 3000
- Backend must be able to reach frontend (localhost or Docker network)
- Set `FRONTEND_URL` environment variable if needed

## Troubleshooting

### Manual Email Button Not Working

**Check:**
1. Are you signed in? (Button requires authentication)
2. Is calendar connected? (Check settings)
3. Does meeting have a calendar event? (System will try to match automatically)
4. Check browser console for errors

### Automatic Email Not Sending

**Check Backend Logs:**
```bash
# Look for these log messages:
📧 Attempting to send summary emails for meeting <id>
✅ Summary emails sent: <message>
⚠️ Email sending failed: <error>
```

**Common Issues:**

1. **Frontend not reachable**
   - Error: `Failed to reach http://localhost:3000`
   - Fix: Ensure frontend is running on port 3000
   - Fix: Set `FRONTEND_URL` environment variable in backend

2. **Meeting document not found**
   - Error: `Meeting not found in Firestore`
   - Fix: Meeting must be started through the dashboard
   - Fix: Check if meeting document exists in Firestore

3. **Calendar event not matched**
   - Error: `No calendar event linked to this meeting`
   - Fix: System will try to match automatically
   - Fix: Ensure meeting URL matches a calendar event

4. **No participants**
   - Message: `No participants to send email to`
   - This is normal if:
     - All attendees declined
     - Only organizer is in the event
     - No attendees in calendar event

5. **SendGrid not configured**
   - Error: `SENDGRID_API_KEY is not configured`
   - Fix: Add SendGrid API key to `.env.local`
   - See `EMAIL_SUMMARY_SETUP.md` for details

## Environment Variables

### Frontend (`frontend/dashboard/.env.local`)
```env
SENDGRID_API_KEY=SG.your-api-key-here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

### Backend (`google-meet-meeting-bot/.env`)
```env
FRONTEND_URL=http://localhost:3000  # For local development
# OR
FRONTEND_URL=http://host.docker.internal:3000  # For Docker
```

## Testing

### Test Manual Email Sending

1. Start a meeting with calendar event
2. Let bot capture and generate summary
3. Go to Summaries page
4. Click "Send Email" button
5. Verify success message
6. Check participant inboxes

### Test Automatic Email Sending

1. Start a meeting with calendar event
2. Let bot capture meeting
3. Wait for summary generation
4. Check backend logs for email sending
5. Check participant inboxes

### Verify Email Delivery

- Check SendGrid dashboard for email activity
- Check participant spam folders
- Verify email content is correct

## UI Changes

### Summaries Page
- Added "Send Email" button to each summary
- Shows loading state while sending
- Displays success/error messages
- Button disabled while sending

### Button States
- **Default**: "Send Email to Participants" with mail icon
- **Loading**: "Sending..." with spinner
- **Success**: Green message with checkmark
- **Error**: Red message with alert icon

## Next Steps

1. **Set up SendGrid** (if not done)
   - See `EMAIL_SUMMARY_SETUP.md`

2. **Test the flow**
   - Start a meeting
   - Generate summary
   - Try manual email sending
   - Verify automatic sending

3. **Monitor logs**
   - Check backend logs for email attempts
   - Check frontend console for errors
   - Check SendGrid dashboard for delivery

4. **Customize email template** (optional)
   - Edit `frontend/dashboard/lib/email-service.ts`
   - Modify `generateSummaryEmailHTML` function


