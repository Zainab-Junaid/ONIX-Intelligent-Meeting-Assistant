# Running the Meeting Bot Locally

## Prerequisites

- **Docker Desktop** (latest version)
- **Node.js** 18+ 
- **Git**
- **Google Account** (dedicated for bot - not your personal account)
- **AssemblyAI API Key** (get from [AssemblyAI Console](https://www.assemblyai.com/))

## Quick Start Guide

### 1. Clone and Install
```bash
git clone <repository-url>
cd google-meet-meeting-bot
npm install
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.sample .env

# Edit .env with your credentials
nano .env  # or use your preferred editor
```

**Required .env variables:**
```bash
DATABASE_URL=postgresql://meetingbot:supersecret@postgres:5432/meetingbotpoc
ASSEMBLYAI_API_KEY=your-assemblyai-api-key-here
GOOGLE_ACCOUNT_USER=your-bot-google-email@gmail.com
GOOGLE_ACCOUNT_PASSWORD=your-bot-google-password
```

### 3. Generate Google Authentication
```bash
# This opens a browser for Google login and saves session
npm run gen:auth
```

**Note:** Complete 2FA if prompted. The script will save your session to `auth.json`.

### 4. Build and Start Services
```bash
# Build all containers
docker-compose build --no-cache

# Start all services in background
docker compose up -d

# Check if services are running
docker compose ps
```

### 5. Run Database Migrations
```bash
# Enter backend container
docker compose exec backend sh

# Run database migrations
npx prisma migrate deploy

# Exit container
exit
```

### 6. Start Frontend (New Terminal)
```bash
cd src/frontend
npm install
npm run dev
```

### 7. Access the Application
- **Frontend UI:** http://localhost:5173
- **Backend API:** http://localhost:3001
- **Database:** localhost:5432

## Testing the Bot

### 1. Start a Google Meet
- Use your **primary Google account** (not the bot account)
- Start a new meeting
- Copy the meeting URL (before the '?' if present)
- In "Host Controls" → "Meeting Access" → Select "Open"

### 2. Submit Meeting URL
- Go to http://localhost:5173
- Paste the meeting URL
- Click "Submit"
- You should see "Bot started for meeting"

### 3. Monitor Bot Activity
```bash
# Watch backend logs
docker compose logs -f backend

# Watch bot container logs (when running)
docker compose logs -f <bot-container-name>
```

### 4. End the Meeting
- Say "Notetaker, please leave" in the meeting
- Or manually end the meeting
- The bot will automatically generate a summary

## Expected Logs and Output

### Backend Startup
```
Backend listening on port 3001
[POST] /submit-link
Database connection successful
```

### Bot Execution
```
🚀 Creating initial meeting transcript for <meeting-id>
✅ Database connection successful
🔍 Testing database connection...
Validating session before joining meeting...
Session is valid - proceeding to meeting
joined meeting
captions visible
🗣️ Speaker Name: Hello everyone, welcome to the meeting
📝 New caption segment created for Speaker Name (index: 0)
⏰ Timer flush: sending 1 segments to database...
[FLUSH] ✅ SUCCESS: 1/1 segments saved to database
```

### Meeting End
```
Exit phrase heard — hanging up
🎯 MEETING ENDED - Generating summary immediately
🤖 Calling AssemblyAI to generate summary...
✅ SUMMARY GENERATED SUCCESSFULLY!
🎉 Meeting <meeting-id>: 15 segments captured and stored
```

## Troubleshooting

### Bot Won't Join Meeting
- **Check Google Auth:** Verify `auth.json` exists and is recent
- **Regenerate Auth:** Run `npm run gen:auth` again
- **Check Credentials:** Ensure `GOOGLE_ACCOUNT_USER` and `GOOGLE_ACCOUNT_PASSWORD` are correct

### No Captions Captured
- **Enable Captions:** Make sure captions are turned on in the Google Meet
- **Check Meeting Access:** Ensure the meeting allows the bot to join
- **Wait for UI:** The bot needs time to enable captions (up to 60 seconds)

### Summary Generation Fails
- **Check API Key:** Verify `ASSEMBLYAI_API_KEY` is valid and has credits
- **Check Logs:** Look for AssemblyAI error messages in backend logs
- **Manual Summary:** Use debug endpoint: `POST http://localhost:3001/debug/generate-summary/{meetingId}`

### Database Issues
```bash
# Check if PostgreSQL is running
docker compose ps postgres

# Connect to database directly
docker exec -it meetingbot-db psql -U meetingbot -d meetingbotpoc

# Check tables
\dt

# View recent meetings
SELECT "meetingId", "createdAt" FROM "MeetingTranscript" ORDER BY "createdAt" DESC LIMIT 5;
```

### Container Issues
```bash
# Rebuild everything from scratch
docker compose down
docker system prune -f
docker-compose build --no-cache
docker compose up -d

# Check container logs
docker compose logs <service-name>
```

## Development Mode

### Backend Development
```bash
# Run backend in development mode
cd src/backend
npm run dev
```

### Bot Development
```bash
# Run bot directly (without Docker)
cd src/playwright
npm run dev
```

### Database Management
```bash
# Open Prisma Studio
npm run studio

# Reset database
npx prisma migrate reset --schema=src/backend/schema.prisma
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **Use Dedicated Google Account:** Never use your personal Google account for the bot
2. **Rotate Credentials:** Change the default database password from "supersecret"
3. **Secure API Keys:** Keep your AssemblyAI API key secure and don't commit it to version control
4. **Local Only:** This setup is for local development only - not production-ready

## Next Steps

Once you have the bot running locally:

1. **Review the Code:** Read through `src/playwright/runBot.ts` to understand the bot logic
2. **Check the Database:** Use Prisma Studio to explore stored transcripts and summaries
3. **Test Different Scenarios:** Try different meeting types and lengths
4. **Plan Integration:** Review `INTEGRATION_PLAN.md` for ONIX integration steps

## Support

If you encounter issues:

1. Check the logs first (most issues are logged with helpful messages)
2. Verify all prerequisites are installed correctly
3. Ensure your Google account and AssemblyAI API key are working
4. Review the troubleshooting section above
5. Check the main `README-AUDIT.md` for detailed technical information
