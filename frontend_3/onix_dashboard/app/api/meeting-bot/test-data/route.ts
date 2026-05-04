// Test endpoint to populate test data for bot meetings
// This allows testing the dashboard integration without running the actual bot
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

// Initialize Firebase Admin
getFirebaseAdmin();
// MongoDB is optional - will skip if not available
let mongoose: any;
try {
  const mongooseLib = 'mongoose';
  mongoose = require(mongooseLib);
} catch {
  // mongoose not installed, MongoDB features will be skipped
  mongoose = null;
}



// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/meeting-transcripts';

// POST endpoint to create test data
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

    // Parse request body for number of test meetings
    const body = await request.json().catch(() => ({}));
    const count = body.count || 2; // Default to 2 test meetings

    // Connect to PostgreSQL
    const { Pool } = require('pg');
    const botDbPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc'
    });

    // Connect to MongoDB (optional)
    let mongoConnected = false;
    let MeetingTranscriptModel: any = null;
    
    if (mongoose) {
      try {
        // Define schemas only when mongoose is available
        const SegmentSchema = new mongoose.Schema({
          segmentId: { type: String, required: true },
          start: { type: Number, required: true },
          end: { type: Number, required: true },
          text: { type: String, required: true },
          speaker: { type: String, required: true },
        }, { _id: false });

        const MeetingTranscriptSchema = new mongoose.Schema({
          meetingId: { type: String, required: true, unique: true, index: true },
          userId: { type: String, index: true },
          meetingTitle: { type: String },
          segments: { type: [SegmentSchema], default: [] },
          createdAt: { type: Date, required: true, default: Date.now },
          updatedAt: { type: Date, required: true, default: Date.now },
        });

        if (mongoose.connection.readyState === 0) {
          await mongoose.connect(MONGODB_URI);
          mongoConnected = true;
        }
        MeetingTranscriptModel = mongoose.models.MeetingTranscript || 
          mongoose.model('MeetingTranscript', MeetingTranscriptSchema);
      } catch (mongoError: any) {
        console.warn('MongoDB connection failed, will skip MongoDB test data:', mongoError.message);
      }
    } else {
      console.warn('Mongoose not available, skipping MongoDB test data');
    }

    const testMeetings = [];
    const testSummaries = [];

    // Create test meetings
    for (let i = 0; i < count; i++) {
      const meetingId = `test-meeting-${userId}-${Date.now()}-${i}`;
      const meetingTitle = `Test Bot Meeting ${i + 1}`;
      const meetingUrl = `https://meet.google.com/test-${i}`;

      // Create test segments
      const segments = [
        {
          segmentId: `${meetingId}-seg-1`,
          start: 0,
          end: 5,
          text: 'Hello everyone, welcome to our test meeting.',
          speaker: 'John Doe'
        },
        {
          segmentId: `${meetingId}-seg-2`,
          start: 5,
          end: 10,
          text: 'Thank you for joining. Let\'s discuss the project timeline.',
          speaker: 'Jane Smith'
        },
        {
          segmentId: `${meetingId}-seg-3`,
          start: 10,
          end: 15,
          text: 'I think we should aim to complete phase one by next week.',
          speaker: 'John Doe'
        },
        {
          segmentId: `${meetingId}-seg-4`,
          start: 15,
          end: 20,
          text: 'That sounds reasonable. I\'ll update the team accordingly.',
          speaker: 'Jane Smith'
        },
        {
          segmentId: `${meetingId}-seg-5`,
          start: 20,
          end: 25,
          text: 'Great! Let\'s schedule a follow-up meeting for next Friday.',
          speaker: 'John Doe'
        }
      ];

      // 1. Create MeetingJob in PostgreSQL
      try {
        await botDbPool.query(`
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
        console.log(`✅ Created MeetingJob for ${meetingId}`);
      } catch (pgError: any) {
        console.error(`❌ Failed to create MeetingJob:`, pgError.message);
      }

      // 2. Create transcript in MongoDB
      if (mongoConnected) {
        try {
          await MeetingTranscriptModel.findOneAndUpdate(
            { meetingId },
            {
              meetingId,
              userId,
              meetingTitle,
              segments,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            { upsert: true, new: true }
          );
          console.log(`✅ Created MongoDB transcript for ${meetingId}`);
        } catch (mongoError: any) {
          console.error(`❌ Failed to create MongoDB transcript:`, mongoError.message);
        }
      }

      // 3. Create summary in PostgreSQL
      const summaryText = `## Executive Summary
This was a test meeting to discuss project timelines and next steps.

## Key Discussion Points
- Project timeline review
- Phase one completion target
- Team updates needed
- Follow-up meeting scheduled

## Action Items
- Update team on project timeline
- Schedule follow-up meeting for next Friday
- Review phase one deliverables`;

      try {
        await botDbPool.query(`
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
        console.log(`✅ Created summary for ${meetingId}`);
      } catch (summaryError: any) {
        console.error(`❌ Failed to create summary:`, summaryError.message);
      }

      testMeetings.push({
        meetingId,
        title: meetingTitle,
        meetingUrl,
        userId
      });

      testSummaries.push({
        meetingId,
        summaryText
      });
    }

    // Clean up connections
    await botDbPool.end();
    if (mongoConnected && mongoose) {
      await mongoose.disconnect();
    }

    return NextResponse.json({
      success: true,
      message: `Created ${count} test meetings for user ${userId}`,
      meetings: testMeetings,
      summaries: testSummaries.length
    });

  } catch (error: any) {
    console.error('Error creating test data:', error);
    return NextResponse.json({ 
      error: 'Failed to create test data', 
      details: error?.message 
    }, { status: 500 });
  }
}

// GET endpoint to check if test data exists
export async function GET(request: NextRequest) {
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

    // Connect to PostgreSQL
    const { Pool } = require('pg');
    const botDbPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc'
    });

    // Count user's meetings
    const jobResult = await botDbPool.query(`
      SELECT COUNT(*) as count
      FROM "MeetingJob"
      WHERE "userId" = $1
    `, [userId]);

    const summaryResult = await botDbPool.query(`
      SELECT COUNT(*) as count
      FROM "MeetingSummary" ms
      INNER JOIN "MeetingJob" mj ON ms."meetingId" = mj."meetingId"
      WHERE mj."userId" = $1
    `, [userId]);

    await botDbPool.end();

    return NextResponse.json({
      userId,
      meetingJobs: parseInt(jobResult.rows[0].count),
      summaries: parseInt(summaryResult.rows[0].count)
    });

  } catch (error: any) {
    console.error('Error checking test data:', error);
    return NextResponse.json({ 
      error: 'Failed to check test data', 
      details: error?.message 
    }, { status: 500 });
  }
}

