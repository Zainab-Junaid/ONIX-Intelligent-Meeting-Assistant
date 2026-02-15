/**
 * Simple script to create test bot data
 * 
 * Usage:
 * 1. Set your Firebase UID in the userId variable below
 * 2. Ensure PostgreSQL is running
 * 3. Run: node scripts/test-bot-data.js
 * 
 * This will create test meetings that will appear in your dashboard
 */

const { Pool } = require('pg');

// Configuration
const userId = process.env.TEST_USER_ID || 'YOUR_FIREBASE_USER_ID_HERE'; // Replace with your Firebase UID
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc';

const pool = new Pool({ connectionString: DATABASE_URL });

async function createTestData() {
  if (userId === 'YOUR_FIREBASE_USER_ID_HERE') {
    console.error('❌ Please set TEST_USER_ID environment variable or update userId in this script');
    console.error('   Example: TEST_USER_ID=your-firebase-uid node scripts/test-bot-data.js');
    process.exit(1);
  }

  console.log(`📝 Creating test data for user: ${userId}`);

  try {
    // Create 2 test meetings
    for (let i = 0; i < 2; i++) {
      const meetingId = `test-meeting-${userId}-${Date.now()}-${i}`;
      const meetingTitle = `Test Bot Meeting ${i + 1}`;
      const meetingUrl = `https://meet.google.com/test-${i}`;

      // 1. Create MeetingJob
      await pool.query(`
        INSERT INTO "MeetingJob" ("id", "userId", "meetingUrl", "meetingTitle", "status", "meetingId", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT ("id") DO UPDATE SET
          "userId" = EXCLUDED."userId",
          "meetingTitle" = EXCLUDED."meetingTitle",
          "status" = EXCLUDED."status",
          "meetingId" = EXCLUDED."meetingId"
      `, [
        `test-job-${meetingId}`,
        userId,
        meetingUrl,
        meetingTitle,
        'summarized',
        meetingId
      ]);
      console.log(`✅ Created MeetingJob: ${meetingTitle} (${meetingId})`);

      // 2. Create Summary
      const summaryText = `## Executive Summary
This was test meeting ${i + 1} to verify bot integration with the dashboard.

## Key Discussion Points
- Project timeline review
- Phase one completion target
- Team updates needed
- Follow-up meeting scheduled

## Action Items
- Update team on project timeline
- Schedule follow-up meeting
- Review deliverables`;

      await pool.query(`
        INSERT INTO "MeetingSummary" ("id", "meetingId", "summaryText", "generatedAt", "model", "isFallback")
        VALUES ($1, $2, $3, NOW(), $4, false)
        ON CONFLICT ("id") DO UPDATE SET
          "summaryText" = EXCLUDED."summaryText",
          "generatedAt" = EXCLUDED."generatedAt"
      `, [
        `test-summary-${meetingId}`,
        meetingId,
        summaryText,
        'test-model'
      ]);
      console.log(`✅ Created Summary for: ${meetingTitle}`);
    }

    console.log('\n✅ Test data created successfully!');
    console.log('📊 Now refresh your dashboard to see the test meetings.');
    console.log('   They should appear in:');
    console.log('   - Home page (recent transcripts)');
    console.log('   - Meetings page (bot meetings tab)');
    console.log('   - Transcripts page');

  } catch (error) {
    console.error('❌ Error creating test data:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createTestData();

