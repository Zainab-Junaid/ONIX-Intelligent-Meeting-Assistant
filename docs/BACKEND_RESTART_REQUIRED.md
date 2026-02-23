# Backend Restart Required

## Issue: 404 Error on Summary Update

If you're getting a **404 error** when trying to update a summary, it means the backend server hasn't picked up the new `/update-summary/:meetingId` endpoint.

## Solution

**Restart the backend server** to register the new endpoint:

### If running locally:
```bash
cd google-meet-meeting-bot
# Stop the current server (Ctrl+C)
# Then restart it
npm start
# or
node src/backend/server.ts
```

### If running in Docker:
```bash
cd google-meet-meeting-bot
docker-compose restart backend
# or
docker-compose down
docker-compose up -d
```

## Fallback Solution

The system now has a **fallback** that will update the database directly if the backend endpoint returns 404. However, for best results, please restart the backend server.

## Verify Backend is Running

Check if backend is accessible:
```bash
curl http://localhost:3001/list/summaries
```

If this works, the backend is running. If it doesn't, start the backend server first.

## After Restart

Once the backend is restarted, the `/update-summary/:meetingId` endpoint will be available and summary editing will work properly.


