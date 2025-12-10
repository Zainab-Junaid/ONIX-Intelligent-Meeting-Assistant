# Email Summary Setup Guide

This guide explains how to set up automatic email sending of meeting summaries to calendar participants using SendGrid.

## Overview

When a meeting ends and a summary is generated, the system will:
1. Match the meeting to a Google Calendar event (by Meet URL)
2. Extract participant emails from the calendar event
3. Send a beautifully formatted email with the meeting summary to all participants

## Prerequisites

1. **SendGrid Account**: Sign up at [SendGrid](https://sendgrid.com/)
2. **SendGrid API Key**: Create an API key in SendGrid dashboard
3. **Verified Sender**: Verify a sender email address in SendGrid

## Setup Steps

### Step 1: Create SendGrid Account

1. Go to [SendGrid](https://sendgrid.com/) and sign up for a free account
2. Complete email verification

### Step 2: Create SendGrid API Key

1. Log in to SendGrid dashboard
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Name it: "ONIX Meeting Assistant"
5. Select **Full Access** or **Restricted Access** with Mail Send permissions
6. **Copy the API key** (you won't be able to see it again!)

### Step 3: Verify Sender Email

1. In SendGrid dashboard, go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Fill in your email details:
   - **From Email**: `noreply@yourdomain.com` (or your email)
   - **From Name**: ONIX Meeting Assistant
   - Complete the verification process
4. Check your email and click the verification link

### Step 4: Configure Environment Variables

Add the following to your `.env.local` file in `frontend/dashboard/`:

```env
# SendGrid Configuration
SENDGRID_API_KEY=SG.your-api-key-here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

**Important**: 
- Replace `SG.your-api-key-here` with your actual SendGrid API key
- Replace `noreply@yourdomain.com` with your verified sender email

### Step 5: Configure Backend (Optional)

If your backend runs in Docker and needs to call the frontend API, add this to your backend `.env`:

```env
FRONTEND_URL=http://host.docker.internal:3000
```

For local development without Docker, use:
```env
FRONTEND_URL=http://localhost:3000
```

## How It Works

### 1. Meeting Start
- When a bot starts for a meeting, the system tries to match the Google Meet URL to a calendar event
- If a match is found, the calendar event ID is stored with the meeting

### 2. Summary Generation
- After the meeting ends, a summary is automatically generated
- The backend calls the frontend API to send emails

### 3. Email Sending
- The system fetches the calendar event to get participant emails
- Filters out declined attendees and the meeting organizer
- Sends a beautifully formatted HTML email with:
  - Meeting title and date
  - Full meeting summary
  - Action items (if any)
  - Link to view meeting details

## Email Template

The email includes:
- **Header**: Meeting Summary with date
- **Meeting Title**: Prominently displayed
- **Summary**: Full meeting summary in a readable format
- **Action Items**: Bulleted list (if available)
- **Footer**: Attribution to ONIX Meeting Assistant

## Testing

### Test Email Sending

1. Start a meeting with a Google Calendar event
2. Ensure the meeting has attendees
3. Let the bot capture the meeting
4. Wait for summary generation
5. Check participant inboxes for the summary email

### Manual Email Send

You can also manually trigger email sending via the API:

```bash
curl -X POST http://localhost:3000/api/meetings/send-summary \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"meetingId": "your-meeting-id"}'
```

## Troubleshooting

### Emails Not Sending

1. **Check SendGrid API Key**: Verify it's correctly set in `.env.local`
2. **Check Sender Verification**: Ensure your sender email is verified in SendGrid
3. **Check Logs**: Look for email-related errors in console
4. **Check Calendar Matching**: Ensure the meeting was matched to a calendar event
5. **Check Participants**: Ensure there are accepted attendees (not just declined)

### Common Errors

- **"SENDGRID_API_KEY is not configured"**: Add the API key to `.env.local`
- **"Calendar access not granted"**: User needs to connect their Google Calendar
- **"No calendar event linked"**: Meeting URL didn't match any calendar event
- **"No participants to send email to"**: All attendees declined or only organizer present

### SendGrid Limits

- **Free Tier**: 100 emails/day
- **Paid Tiers**: Higher limits available
- Check your SendGrid dashboard for usage statistics

## Security Notes

1. **API Key Security**: Never commit `.env.local` to version control
2. **Internal Endpoint**: The `/api/meetings/send-summary-internal` endpoint is designed for backend use
3. **Email Privacy**: Only sends to accepted attendees, excludes organizer

## Next Steps

- Customize email template in `frontend/dashboard/lib/email-service.ts`
- Add email preferences (opt-in/opt-out)
- Add email scheduling options
- Track email delivery status


