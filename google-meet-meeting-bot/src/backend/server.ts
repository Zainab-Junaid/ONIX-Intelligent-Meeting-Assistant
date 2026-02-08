import express from "express";
import { createServer } from "http";
import { initializeSocketServer } from "../presentation/socket/socketServer";
import cors from "cors";
import { summarizeTranscript } from "../summarize";
import {
  createMeetingJob,
  getMeetingJob,
  getTranscript,
  saveSummary,
  updateMeetingStatus,
} from "../storage";
import { launchBotContainer } from "./launchBot";
import { prisma } from "../lib/prisma";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  MeetingStatus,
  MeetingJobStatus,
} from "../config/constants";
import { enqueueMeetingProcessing } from "../infrastructure/queue";

// Using singleton prisma client from lib/prisma.ts

const app = express();
// turn on CORS for frontend at localhost:5173
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"],
    methods: ["POST", "GET", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// parse JSON requests
app.use(express.json());

// simple logging for requests
app.use((req, _, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

function validateMeetLink(url: string) {
  const prefix = /^https:\/\/meet\.google\.com/;
  return prefix.test(url);
}

// endpoint to start bot with given url
// Creates Meeting record in PostgreSQL for efficient listing
// LIFECYCLE: CREATED -> BOT_LAUNCHED -> LIVE -> COMPLETED -> PROCESSING -> PROCESSED
app.post("/submit-link", async (req, res) => {
  const { url, jobId: providedJobId, userId, meetingTitle, tenantId } = req.body;
  if (!url) return res.status(400).send(`Missing the URL`);
  if (!validateMeetLink(url)) return res.status(400).send(`Invalid link`);

  try {
    // Step 1: Use configured tenant or default
    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

    // Step 2: Ensure default tenant exists (idempotent upsert)
    await prisma.tenant.upsert({
      where: { id: effectiveTenantId },
      create: {
        id: effectiveTenantId,
        name: DEFAULT_TENANT_NAME,
        domain: 'localhost',
      },
      update: {},
    });

    // Step 3: Create Meeting record FIRST with status CREATED
    // This is the source of truth for meeting metadata
    const meeting = await prisma.meeting.create({
      data: {
        tenantId: effectiveTenantId,
        externalMeetId: url,
        title: meetingTitle || 'Untitled Meeting',
        status: MeetingStatus.CREATED,  // Initial status
        platform: 'google_meet',
      },
    });
    console.log(`✅ Meeting lifecycle: Created Meeting (id=${meeting.id}, status=${MeetingStatus.CREATED})`);

    // Step 4: Create MeetingJob linked to Meeting (for job orchestration)
    // Use provided jobId if dashboard supplied one, otherwise use meeting.id
    const jobId = providedJobId || meeting.id;
    await prisma.meetingJob.upsert({
      where: { id: jobId },
      create: {
        id: jobId,
        meetingUrl: url,
        meetingTitle: meetingTitle || 'Untitled Meeting',
        userId: userId || null,
        meetingId: meeting.id,  // FK link to Meeting
        status: MeetingJobStatus.PENDING,
      },
      update: {
        meetingId: meeting.id,
        status: MeetingJobStatus.RUNNING,
      },
    });
    console.log(`✅ Meeting lifecycle: Created MeetingJob (id=${jobId}, linked to meeting=${meeting.id})`);

    // Step 5: Update Meeting status to BOT_LAUNCHED before launching container
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: MeetingStatus.BOT_LAUNCHED },
    });
    console.log(`✅ Meeting lifecycle: Status -> ${MeetingStatus.BOT_LAUNCHED} (launching container)`);

    // Step 6: Launch bot container with meeting ID
    // NOTE: Bot should use meeting.id to tag Redis buffers
    await launchBotContainer(url, meeting.id, userId, meetingTitle);

    res.json({
      message: 'Bot started for meeting',
      jobId: jobId,
      meetingId: meeting.id,
      status: MeetingStatus.BOT_LAUNCHED,
    });
  } catch (err) {
    console.error('❌ Failed to start meeting:', err);
    res.status(500).send(`Failed to launch bot`);
  }
});

// endpoint when bot detects first caption (meeting is actively capturing)
// LIFECYCLE: BOT_LAUNCHED -> LIVE
app.post("/bot-live", async (req, res) => {
  const { meetingId } = req.body;
  if (!meetingId) return res.status(400).send("Missing meetingId");

  try {
    // Atomic update: only transition if status is currently BOT_LAUNCHED
    // This prevents race conditions and duplicate transitions
    const result = await prisma.meeting.updateMany({
      where: {
        id: meetingId,
        status: MeetingStatus.BOT_LAUNCHED, // Only transition from BOT_LAUNCHED
      },
      data: {
        status: MeetingStatus.LIVE,
        startTime: new Date(),
      },
    });

    if (result.count > 0) {
      console.log(`✅ Meeting lifecycle: Status -> ${MeetingStatus.LIVE} (id=${meetingId})`);
      res.json({ success: true, status: MeetingStatus.LIVE });
    } else {
      // Meeting may already be LIVE or in a different state
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { status: true },
      });
      console.log(`ℹ️ Meeting ${meetingId} not transitioned to LIVE (current status: ${meeting?.status})`);
      res.json({ success: true, status: meeting?.status || 'unknown', message: 'Already in this or later state' });
    }
  } catch (err) {
    console.error(`❌ Failed to update meeting status to LIVE:`, err);
    res.status(500).send("Failed to update meeting status");
  }
});

// endpoint to fetch summary for meeting
app.get("/meeting-summary/:id", async (req, res) => {
  const meetingId = req.params.id;
  const transcript = await getTranscript(meetingId);

  if (!transcript) return res.status(404).send("Transcript not ready");

  const summary = await summarizeTranscript(transcript);
  await saveSummary(summary.summary);
  if (summary.actionItems?.length) {
    try {
      const { saveActionItems } = await import("../storage");
      await saveActionItems(summary.actionItems);
    } catch (e) {
      console.warn("Failed to save action items:", e);
    }
  }
  res.json({ summary });
});

// endpoint when bot signals it's done
// Updates Meeting record status to 'completed' in PostgreSQL
// LIFECYCLE: ... -> COMPLETED (meeting ended, awaiting post-processing)
app.post("/bot-done", async (req, res) => {
  const { jobId, meetingId } = req.body;
  if (!jobId || !meetingId) return res.status(400).send("Missing fields");

  try {
    console.log(`Bot reported completion for job ${jobId}, meeting ${meetingId}`);

    // Step 1: Update Meeting status to COMPLETED in PostgreSQL
    // This is the signal that the meeting has ended and is ready for post-processing
    try {
      const updatedMeeting = await prisma.meeting.update({
        where: { id: jobId },
        data: {
          status: MeetingStatus.COMPLETED,
          endTime: new Date(),
          mongoTranscriptId: meetingId, // Reference to MongoDB transcript
        },
      });
      console.log(`✅ Meeting lifecycle: Status -> ${MeetingStatus.COMPLETED} (id=${jobId})`);
    } catch (meetingError) {
      // Non-fatal: Meeting may not exist if started before lifecycle implementation
      console.warn(`⚠️ Could not update Meeting record (may not exist):`, meetingError);
    }

    // Step 2: Update MeetingJob status
    await updateMeetingStatus(jobId, MeetingJobStatus.TRANSCRIPT_SAVED, meetingId);

    // Update Firestore meeting document with meetingId (non-blocking)
    try {
      const frontendUrls = [
        process.env.FRONTEND_URL,
        "http://localhost:3000",
        "http://host.docker.internal:3000",
        "http://127.0.0.1:3000"
      ].filter(Boolean);

      let updated = false;
      for (const frontendUrl of frontendUrls) {
        try {
          console.log(`📝 Attempting to update Firestore meeting ID via ${frontendUrl}`);
          const response = await fetch(`${frontendUrl}/api/meetings/update-meeting-id`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId, meetingId }),
            signal: AbortSignal.timeout(5000), // 5 second timeout
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              console.log(`✅ Successfully updated Firestore meeting ID: jobId=${jobId} -> meetingId=${meetingId}`);
              updated = true;
              break;
            }
          } else {
            console.log(`⚠️ Failed to update Firestore (${response.status})`);
          }
        } catch (urlError: any) {
          console.log(`⚠️ Failed to reach ${frontendUrl}:`, urlError.message);
          continue;
        }
      }

      if (!updated) {
        console.log(`⚠️ Could not update Firestore meeting ID after trying all URLs. Email sending may fail.`);
      }
    } catch (err) {
      console.log(`⚠️ Error updating Firestore meeting ID:`, err);
    }

    // Step 3: Post-meeting processing
    // Use queue-based processing if enabled, otherwise fall back to sync processing
    const useQueueProcessing = process.env.ENABLE_QUEUE_PROCESSING === '1';

    if (useQueueProcessing) {
      // Queue-based: Enqueue job for async processing by worker
      try {
        const job = await enqueueMeetingProcessing(jobId);
        if (job) {
          console.log(`✅ Enqueued post-meeting processing job for meeting ${jobId}`);
        } else {
          console.log(`ℹ️ Job already queued for meeting ${jobId}`);
        }
        res.json({
          message: 'Meeting completed, processing queued',
          meetingId: jobId,
          status: MeetingStatus.COMPLETED,
          processingQueued: true,
        });
        return;
      } catch (queueError) {
        console.error(`❌ Failed to enqueue processing job:`, queueError);
        // Fall through to sync processing as fallback
      }
    }

    // Sync processing (legacy fallback)
    const transcript = await getTranscript(meetingId);
    if (!transcript) {
      console.warn(`Transcript not found for meeting ${meetingId}`);
      return res.status(202).send("Transcript not found yet");
    }

    await processSummaryForMeeting(meetingId, jobId);

    // log summary and transcript for debugging
    console.log(`Transcript is: `);
    console.dir(await getTranscript(meetingId));
    console.log(`Summary is: (see saved row in MeetingSummary)`);
    res.send("Summary completed and saved");
  } catch (err) {
    console.error(`Error processing job ${jobId}:`, err);
    res.status(500).send("Failed to finalize job");
  }
});

// endpoint to get meeting job info by meetingId
app.get("/meeting-job/:meetingId", async (req, res) => {
  const meetingId = req.params.meetingId;
  try {
    const job = await prisma.meetingJob.findFirst({
      where: { meetingId },
    });
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  } catch (err) {
    console.error(`Error fetching job for meeting ${meetingId}:`, err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

// Get individual transcript from MongoDB (source of truth for transcripts)
app.get("/api/meetings/:meetingId/transcript", async (req, res) => {
  const meetingId = req.params.meetingId;
  try {
    const { getTranscriptFromMongo, initMongoConnection } = await import("../infrastructure/mongo/transcriptRepo");
    await initMongoConnection();

    const transcript = await getTranscriptFromMongo(meetingId);
    if (!transcript) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    res.json(transcript);
  } catch (err) {
    console.error(`Error fetching transcript for meeting ${meetingId}:`, err);
    res.status(500).json({ error: "Failed to fetch transcript" });
  }
});

// Get meeting analytics (speaker stats + meeting overview)
// ARCHITECTURE: Returns post-processing analytics from PostgreSQL
app.get("/api/meetings/:meetingId/analytics", async (req, res) => {
  const meetingId = req.params.meetingId;
  try {
    // Fetch meeting with status check - look up by id OR mongoTranscriptId
    let meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
      },
    });

    // If not found by id, try by mongoTranscriptId
    if (!meeting) {
      meeting = await prisma.meeting.findFirst({
        where: { mongoTranscriptId: meetingId },
        select: {
          id: true,
          title: true,
          status: true,
          startTime: true,
          endTime: true,
        },
      });
    }

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    // Fetch speaker stats using resolved meeting.id
    const speakerStats = await prisma.speakerStats.findMany({
      where: { meetingId: meeting.id },
      orderBy: { speakingTimeSeconds: 'desc' },
      select: {
        id: true,
        speakerLabel: true,
        speakingTimeSeconds: true,
        wordCount: true,
        turnCount: true,
        interruptionCount: true,
        questionCount: true,
        talkToListenRatio: true,
        sentiment: true,
      },
    });

    // Fetch meeting analytics using resolved meeting.id
    const meetingAnalytics = await prisma.meetingAnalytics.findUnique({
      where: { meetingId: meeting.id },
      select: {
        id: true,
        totalDurationSeconds: true,
        totalSpeakers: true,
        totalWords: true,
        avgSpeakingTimePerPerson: true,
        participationBalanceScore: true,
        questionCount: true,
        sentimentBreakdown: true,
        topicsDiscussed: true,
      },
    });

    // Return combined analytics response
    res.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        status: meeting.status,
        startTime: meeting.startTime?.toISOString() || null,
        endTime: meeting.endTime?.toISOString() || null,
      },
      speakerStats: speakerStats.map(s => ({
        ...s,
        speakerLabel: s.speakerLabel || 'Unknown Speaker',
      })),
      meetingAnalytics: meetingAnalytics || {
        totalDurationSeconds: 0,
        totalSpeakers: speakerStats.length,
        totalWords: speakerStats.reduce((sum, s) => sum + s.wordCount, 0),
        avgSpeakingTimePerPerson: speakerStats.length > 0
          ? speakerStats.reduce((sum, s) => sum + s.speakingTimeSeconds, 0) / speakerStats.length
          : 0,
        participationBalanceScore: null,
        questionCount: 0,
        sentimentBreakdown: null,
        topicsDiscussed: [],
      },
      hasAnalytics: speakerStats.length > 0 || meetingAnalytics !== null,
    });
  } catch (err) {
    console.error(`Error fetching analytics for meeting ${meetingId}:`, err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// endpoint to update meeting summary
app.put("/update-summary/:meetingId", async (req, res) => {
  const meetingId = req.params.meetingId;
  const { summaryText } = req.body;

  if (!summaryText) {
    return res.status(400).json({ error: "Summary text required" });
  }

  try {
    if (process.env.ENABLE_FIRESTORE === "1") {
      // Update in Firestore
      try {
        const { getFirestoreAdmin } = await import("../firestoreAdmin");
        const firebaseAdmin = await import("firebase-admin");
        const db = getFirestoreAdmin();
        const ref = db.collection("meetings").doc(meetingId);

        const doc = await ref.get();
        if (!doc.exists) {
          // Try to create the meeting document with summary
          await ref.set({
            summary: {
              content: summaryText,
              updatedAt: firebaseAdmin.default.firestore.Timestamp.now(),
              edited: true,
            },
          }, { merge: true });
          console.log(`✅ Created meeting document with summary in Firestore for meeting ${meetingId}`);
          return res.json({ success: true, message: "Summary created in Firestore" });
        }

        // Update existing summary
        await ref.update({
          "summary.content": summaryText,
          "summary.updatedAt": firebaseAdmin.default.firestore.Timestamp.now(),
          "summary.edited": true,
        });

        console.log(`✅ Summary updated in Firestore for meeting ${meetingId}`);
        return res.json({ success: true, message: "Summary updated in Firestore" });
      } catch (fsError: any) {
        console.error(`Error updating summary in Firestore for meeting ${meetingId}:`, fsError);
        return res.status(500).json({
          error: "Failed to update summary in Firestore",
          details: fsError?.message
        });
      }
    } else {
      // Update in Prisma database
      let existingSummary = await prisma.meetingSummary.findFirst({
        where: { meetingId },
      });

      if (!existingSummary) {
        // Try to create if it doesn't exist
        try {
          existingSummary = await prisma.meetingSummary.create({
            data: {
              meetingId,
              summaryText,
              generatedAt: new Date(),
              model: "manual-edit",
              isFallback: false,
            },
          });
          console.log(`✅ Created summary in database for meeting ${meetingId}`);
          return res.json({ success: true, summary: existingSummary });
        } catch (createError: any) {
          console.error(`Error creating summary for meeting ${meetingId}:`, createError);
          return res.status(500).json({
            error: "Failed to create summary",
            details: createError?.message
          });
        }
      }

      // Update the summary
      const updatedSummary = await prisma.meetingSummary.update({
        where: { id: existingSummary.id },
        data: {
          summaryText,
        },
      });

      console.log(`✅ Summary updated in database for meeting ${meetingId}`);
      res.json({ success: true, summary: updatedSummary });
    }
  } catch (err: any) {
    console.error(`Error updating summary for meeting ${meetingId}:`, err);
    res.status(500).json({
      error: "Failed to update summary",
      details: err?.message || String(err)
    });
  }
});

// debug endpoint to generate summary for a meeting
app.post("/debug/generate-summary/:meetingId", async (req, res) => {
  const meetingId = req.params.meetingId;
  console.log(`🔧 DEBUG: Generating summary for meeting ${meetingId}`);

  try {
    const savedSummary = await processSummaryForMeeting(meetingId);
    res.json({ success: true, summary: savedSummary, message: "Summary generated and saved successfully" });
  } catch (error) {
    console.error(`❌ Error generating summary for meeting ${meetingId}:`, error);
    res.status(500).json({
      error: "Failed to generate summary",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// list all meetings for dashboard API proxy
// ARCHITECTURE: PostgreSQL Meeting table is source of truth for metadata/listing
// Transcript segments are fetched from MongoDB via /api/meetings/:id/transcript
app.get("/list/meetings", async (_req, res) => {
  try {
    // Get meetings from PostgreSQL (efficient for listing/filtering/sorting)
    const meetings = await prisma.meeting.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit for performance
      select: {
        id: true,
        title: true,
        externalMeetId: true,
        mongoTranscriptId: true,
        status: true,
        startTime: true,
        endTime: true,
        segmentCount: true,
        createdAt: true,
      }
    });

    // Also include legacy MeetingJobs for backward compatibility
    const legacyJobs = await prisma.meetingJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Build Set of meeting IDs from new Meeting table
    const meetingIdSet = new Set(meetings.map(m => m.id));

    // Combine results: new Meeting table + legacy MeetingJob (if not already in Meeting)
    const result = [
      // New Meeting table entries
      ...meetings.map((m) => ({
        meetingId: m.mongoTranscriptId || m.id,
        title: m.title || 'Untitled Meeting',
        createdAtMs: Number(new Date(m.createdAt).getTime()),
        meetingUrl: m.externalMeetId || null,
        status: m.status,
        startTime: m.startTime?.toISOString() || null,
        endTime: m.endTime?.toISOString() || null,
        segmentCount: m.segmentCount || 0,
        // NOTE: segments NOT included for efficiency
        // Use GET /api/meetings/:id/transcript to fetch full transcript
        segments: [],
      })),
      // Legacy MeetingJob entries (not in new Meeting table)
      ...legacyJobs
        .filter(j => j.meetingId && !meetingIdSet.has(j.id))
        .map((j) => ({
          meetingId: j.meetingId!,
          title: j.meetingTitle || 'Untitled Meeting',
          createdAtMs: Number(new Date(j.createdAt).getTime()),
          meetingUrl: j.meetingUrl || null,
          status: j.status,
          startTime: null,
          endTime: null,
          segmentCount: 0,
          segments: [],
        }))
    ];

    res.json(result);
  } catch (e) {
    console.error("/list/meetings error:", e instanceof Error ? e.message : e);
    if (e instanceof Error && e.stack) console.error(e.stack);
    res.status(500).json({ error: "failed to load meetings", details: e instanceof Error ? e.message : String(e) });
  }
});

// Debug endpoint to view all transcripts and segments
app.get("/debug/transcripts", async (_req, res) => {
  try {
    const transcripts = await prisma.meetingTranscript.findMany({
      include: {
        segments: {
          orderBy: { start: "asc" },
          take: 100 // Limit to first 100 segments per meeting for readability
        }
      },
      orderBy: { createdAt: "desc" },
      take: 10 // Limit to 10 most recent meetings
    });

    const result = transcripts.map((t: any) => ({
      meetingId: t.meetingId,
      meetingTitle: t.meetingTitle,
      createdAt: t.createdAt,
      userId: t.userId,
      segmentCount: t.segments.length,
      segments: t.segments.map((s: any) => ({
        speaker: s.speaker,
        text: s.text.substring(0, 100) + (s.text.length > 100 ? '...' : ''),
        start: s.start,
        end: s.end,
        duration: s.end - s.start
      }))
    }));

    res.json(result);
  } catch (e) {
    console.error("/debug/transcripts error:", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "failed to load transcripts", details: e instanceof Error ? e.message : String(e) });
  }
});

// list summaries for dashboard API proxy
app.get("/list/summaries", async (_req, res) => {
  try {
    const result = await prisma.meetingSummary.findMany({
      select: { meetingId: true, summaryText: true, generatedAt: true, model: true },
      orderBy: { generatedAt: "desc" },
    });
    res.json(result);
  } catch (e) {
    console.error("/list/summaries error:", e instanceof Error ? e.message : e);
    if (e instanceof Error && e.stack) console.error(e.stack);
    res.status(500).json({ error: "failed to load summaries", details: e instanceof Error ? e.message : String(e) });
  }
});

// quick DB status for debugging
app.get("/debug/db-status", async (_req, res) => {
  try {
    const transcriptCount = await prisma.meetingTranscript.count();
    const segmentCount = await prisma.segment.count();
    const summaryCount = await prisma.meetingSummary.count();
    res.json({ transcriptCount, segmentCount, summaryCount });
  } catch (e) {
    console.error("/debug/db-status error:", e);
    res.status(500).json({ error: "db status failed" });
  }
});

// Create HTTP server and attach Socket.IO for real-time updates
const httpServer = createServer(app);

// Initialize Socket.IO server with Redis Pub/Sub subscription
// This enables real-time transcript updates from flushWorker to dashboard
initializeSocketServer(httpServer);

httpServer.listen(3001, "0.0.0.0", () => {
  console.log("Backend listening on port 3001 (with Socket.IO enabled)");
});

// --- Helpers ---
async function processSummaryForMeeting(meetingId: string, jobId?: string) {
  // De-dupe: if a job exists, use it to mark summarizing status
  try {
    if (jobId) {
      // if already summarizing or summarized, skip starting a new one
      const job = await prisma.meetingJob.findUnique({ where: { id: jobId } });
      if (job?.status === "summarizing" || job?.status === "summarized") {
        console.log(`⏭️ Skip duplicate summary for ${meetingId} (status=${job?.status})`);
        return null;
      }
      await prisma.meetingJob.update({ where: { id: jobId }, data: { status: "summarizing", meetingId } });
    }
  } catch { }

  // Fetch transcript and trim payload if very large
  const transcript = await getTranscript(meetingId);
  if (!transcript) throw new Error("Transcript not found");
  console.log(`📊 Found transcript with ${transcript.segments.length} segments`);
  const trimmed = trimTranscript(transcript, 16000);

  // Retry on 429/timeouts (2 retries with backoff)
  let attempt = 0;
  let lastError: any = null;
  while (attempt < 3) {
    try {
      const summary = await summarizeTranscript(trimmed);
      console.log(`🤖 Generated summary using model: ${summary.summary.model}`);
      const savedSummary = await saveSummary(summary.summary);
      if (summary.actionItems?.length) {
        try {
          const { saveActionItems } = await import("../storage");
          await saveActionItems(summary.actionItems);
        } catch (e) {
          console.warn("Failed to save action items:", e);
        }
      }
      if (jobId) await updateMeetingStatus(jobId, "summarized", meetingId);
      console.log("💾 Summary saved");

      // Trigger email sending to participants (non-blocking)
      try {
        console.log(`📧 Attempting to send summary emails for meeting ${meetingId}`);

        // Try multiple URLs in order: localhost (local dev), then host.docker.internal (Docker)
        const frontendUrls = [
          process.env.FRONTEND_URL,
          "http://localhost:3000",
          "http://host.docker.internal:3000",
          "http://127.0.0.1:3000"
        ].filter(Boolean);

        let emailSent = false;
        let lastError: any = null;

        for (const frontendUrl of frontendUrls) {
          try {
            console.log(`📧 Trying to send email via ${frontendUrl}`);
            const emailResponse = await fetch(`${frontendUrl}/api/meetings/send-summary-internal`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ meetingId }),
              signal: AbortSignal.timeout(10000), // 10 second timeout
            });

            if (emailResponse.ok) {
              const emailData = await emailResponse.json();
              if (emailData.success) {
                console.log(`✅ Summary emails sent: ${emailData.message}`);
                emailSent = true;
                break;
              } else if (emailData.skipped) {
                console.log(`ℹ️ Email sending skipped: ${emailData.message}`);
                emailSent = true; // Consider skipped as handled
                break;
              }
            } else {
              const errorText = await emailResponse.text().catch(() => '');
              console.log(`⚠️ Email sending failed (${emailResponse.status}): ${errorText.substring(0, 100)}`);
              lastError = new Error(`HTTP ${emailResponse.status}: ${errorText.substring(0, 100)}`);
            }
          } catch (urlError: any) {
            console.log(`⚠️ Failed to reach ${frontendUrl}:`, urlError.message);
            lastError = urlError;
            continue; // Try next URL
          }
        }

        if (!emailSent) {
          console.log(`⚠️ Email sending failed after trying all URLs. Last error:`, lastError?.message || 'Unknown error');
          console.log(`💡 Tip: Set FRONTEND_URL environment variable or ensure frontend is running on port 3000`);
        }
      } catch (emailError) {
        // Don't fail the summary generation if email fails
        console.log(`⚠️ Email sending error (non-critical):`, emailError);
      }

      return savedSummary;
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || e);
      const isRate = /Too Many Requests|429/i.test(msg);
      const isTimeout = /UND_ERR_CONNECT_TIMEOUT|timeout/i.test(msg);
      if (!(isRate || isTimeout)) break;
      attempt++;
      if (attempt >= 3) break;
      const delayMs = attempt === 1 ? 10_000 : 30_000;
      console.warn(`⏳ Backing off ${delayMs / 1000}s (attempt ${attempt}/2) due to: ${msg}`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  if (jobId) {
    try { await updateMeetingStatus(jobId, "transcript_saved", meetingId); } catch { }
  }
  throw lastError || new Error("summary failed");
}

function trimTranscript(t: any, maxChars: number) {
  let total = 0;
  const segments: any[] = [];
  for (let i = t.segments.length - 1; i >= 0; i--) {
    const s = t.segments[i];
    const len = (s?.text || "").length;
    if (total + len > maxChars) break;
    segments.push(s);
    total += len;
  }
  segments.reverse();
  return { ...t, segments };
}
