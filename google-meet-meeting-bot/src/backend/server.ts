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
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
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

// start server on port 3000
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
