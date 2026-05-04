# Missing Endpoints in frontend_2/onix_dashboard

This document lists all API endpoints that were present in the old `frontend/dashboard` but are **missing** in `frontend_2/onix_dashboard`.

## ❌ Missing Calendar Endpoints

### 1. **GET /api/calendar/oauth-callback**
- **Status**: ❌ MISSING
- **Purpose**: Handles Google OAuth callback after user grants calendar access
- **Referenced By**: 
  - `app/api/calendar/request-access/route.ts` (line 47) - references this endpoint but it doesn't exist
  - `components/auth-provider.tsx` - OAuth flow expects this callback
- **Impact**: Calendar OAuth flow is **broken** - users cannot complete calendar authorization
- **Location Should Be**: `app/api/calendar/oauth-callback/route.ts`

### 2. **POST /api/calendar/store-token**
- **Status**: ❌ MISSING
- **Purpose**: Manually store calendar access tokens (alternative to OAuth callback)
- **Impact**: No manual way to store calendar tokens if OAuth callback fails
- **Location Should Be**: `app/api/calendar/store-token/route.ts`

## ❌ Missing Meeting Endpoints

### 3. **POST /api/meetings/send-summary**
- **Status**: ❌ MISSING
- **Purpose**: Public endpoint for manually triggering email sending to meeting participants
- **Impact**: Users cannot manually send summary emails
- **Location Should Be**: `app/api/meetings/send-summary/route.ts`

### 4. **POST /api/meetings/send-summary-internal**
- **Status**: ❌ MISSING
- **Purpose**: Internal endpoint called by bot backend to automatically send emails after summary generation
- **Referenced By**: 
  - Bot backend (`google-meet-meeting-bot/src/backend/server.ts`) tries to call this endpoint
- **Impact**: **Critical** - Automated email sending after bot meetings is **broken**
- **Location Should Be**: `app/api/meetings/send-summary-internal/route.ts`

### 5. **POST /api/meetings/match-calendar-event**
- **Status**: ❌ MISSING
- **Purpose**: Match a meeting to a Google Calendar event to extract participant emails
- **Impact**: Cannot automatically link meetings to calendar events for email extraction
- **Location Should Be**: `app/api/meetings/match-calendar-event/route.ts`

### 6. **POST /api/meetings/update-meeting-id**
- **Status**: ❌ MISSING
- **Purpose**: Update Firestore meeting document with meetingId from bot backend
- **Referenced By**: 
  - Bot backend (`google-meet-meeting-bot/src/backend/server.ts`) tries to call this endpoint
- **Impact**: **Critical** - Bot cannot update Firestore with meeting IDs, breaking email sending flow
- **Location Should Be**: `app/api/meetings/update-meeting-id/route.ts`

### 7. **PUT /api/meetings/update-summary**
- **Status**: ❌ MISSING
- **Purpose**: Update meeting summary in Firestore (for extension meetings)
- **Impact**: Cannot update summaries for extension meetings
- **Note**: Bot meetings have `/api/meeting-bot/update-summary/[meetingId]` but extension meetings don't
- **Location Should Be**: `app/api/meetings/update-summary/route.ts`

## 📋 Summary

### Critical Missing Endpoints (Breaking Functionality):
1. ❌ `/api/calendar/oauth-callback` - **Breaks calendar OAuth flow**
2. ❌ `/api/meetings/send-summary-internal` - **Breaks automated email sending**
3. ❌ `/api/meetings/update-meeting-id` - **Breaks bot-to-dashboard communication**

### Important Missing Endpoints (Feature Gaps):
4. ❌ `/api/calendar/store-token` - Manual token storage
5. ❌ `/api/meetings/send-summary` - Manual email sending
6. ❌ `/api/meetings/match-calendar-event` - Calendar event matching
7. ❌ `/api/meetings/update-summary` - Extension meeting summary updates

## ❌ Missing Service Files

### 8. **lib/email-service.ts**
- **Status**: ❌ MISSING
- **Purpose**: SendGrid email service for sending meeting summary emails
- **Required By**: 
  - `/api/meetings/send-summary`
  - `/api/meetings/send-summary-internal`
- **Impact**: **Critical** - Cannot send emails without this service
- **Functions Needed**:
  - `sendEmail(options: EmailOptions): Promise<void>`
  - `generateSummaryEmailHTML(...): string`
  - `sendMeetingSummaryEmail(...): Promise<void>`

### 9. **lib/calendar-service.ts**
- **Status**: ❌ MISSING
- **Purpose**: Google Calendar API wrapper for fetching events and extracting participant emails
- **Required By**:
  - `/api/meetings/match-calendar-event`
  - `/api/calendar/events` (may need enhancements)
- **Impact**: Cannot match meetings to calendar events or extract participant emails
- **Functions Needed**:
  - `getCalendarEvents(accessToken, timeMin, timeMax)`
  - `extractParticipantEmails(event)`
  - `findMatchingCalendarEvent(meetingUrl, timeRange)`

## 🔧 Required Dependencies

These endpoints require the service files listed above:
- **Email Service**: `lib/email-service.ts` (for SendGrid email sending) - ❌ MISSING
- **Calendar Service**: `lib/calendar-service.ts` (for Google Calendar API) - ❌ MISSING

## 📝 Notes

- The bot backend expects these endpoints to exist and will fail silently if they don't
- Calendar OAuth flow is completely broken without the callback endpoint
- Email automation after bot meetings will not work without `send-summary-internal`
- Check the old `frontend/dashboard` folder (if still available) or documentation for implementation details

