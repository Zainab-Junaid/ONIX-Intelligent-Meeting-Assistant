import express from "express";
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
import { PrismaClient } from "@prisma/client";

// Reuse a single Prisma client to avoid opening too many DB connections
const prisma = new PrismaClient();

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
app.post("/submit-link", async (req, res) => {
  const { url, jobId: providedJobId, userId, meetingTitle } = req.body;
  if (!url) return res.status(400).send(`Missing the URL`);
  if (!validateMeetLink(url)) return res.status(400).send(`Invalid link`);

  try {
    // If dashboard provided a jobId, prefer that; otherwise create one
    const job = providedJobId ? { id: providedJobId } : await createMeetingJob(url, userId, meetingTitle);
    await launchBotContainer(url, job.id, userId, meetingTitle);

    res.json({ message: 'Bot started for meeting', jobId: job.id });
  } catch (err) {
    console.error(err);
    res.status(500).send(`Failed to launch bot`);
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
app.post("/bot-done", async (req, res) => {
  const { jobId, meetingId } = req.body;
  if (!jobId || !meetingId) return res.status(400).send("Missing fields");

  try {
    console.log(
      `Bot reported completion for job ${jobId}, meeting ${meetingId}`,
    );

        // job saved its transcript
        await updateMeetingStatus(jobId, "transcript_saved", meetingId);

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

// list all meetings with segments for dashboard API proxy
app.get("/list/meetings", async (_req, res) => {
  try {
    const transcripts = await prisma.meetingTranscript.findMany({
      orderBy: { createdAt: "desc" },
      include: { segments: { orderBy: { start: "asc" } } },
    });
    const meetingIds = transcripts.map((t: any) => t.meetingId);
    const jobs = await prisma.meetingJob.findMany({
      where: { meetingId: { in: meetingIds } },
      orderBy: { createdAt: "desc" },
    });
    const jobByMeeting = new Map<string, any>();
    for (const j of jobs) {
      if (!j.meetingId) continue;
      if (!jobByMeeting.has(j.meetingId)) jobByMeeting.set(j.meetingId, j);
    }

    const result = await Promise.all(transcripts.map(async (t: any) => {
      const j = jobByMeeting.get(t.meetingId) || {};
      return {
        meetingId: t.meetingId,
        title: (t.meetingTitle || j.meetingTitle || ""),
        createdAtMs: Number(new Date(t.createdAt).getTime()),
        meetingUrl: j.meetingUrl || null,
        status: j.status || null,
        segments: (t.segments || []).map((s: any) => ({
          speaker: s.speaker,
          text: s.text,
          start: s.start,
          end: s.end,
        })),
      };
    }));
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

app.listen(3001, "0.0.0.0", () => {
  console.log("Backend listening on port 3001");
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
  } catch {}

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
    try { await updateMeetingStatus(jobId, "transcript_saved", meetingId); } catch {}
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
