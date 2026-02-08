import { BrowserContext, Page, chromium } from "playwright";
import { pushFinalCaption, pushRawCaption } from "../application/transcription/captionService";
import { v4 as uuidv4 } from "uuid";
import { Segment } from "../domain/transcription/models";
import fs from "fs";
import path from "path";

// bot will leave the meeting immediately if it hears any of the following phrases
const EXIT_PHRASES = [
  "notetaker, please leave",
  "note taker, please leave",
  "no taker please leave",
  "notetaker please leave",
].map((p) => p.toLowerCase());

// selector used to detect the meeting has ended or bot was removed
const LEAVE_BANNER_SEL =
  'body > div[role="heading"]:has-text("You left the meeting"),' +
  'body > div[role="heading"]:has-text("You’ve left the call"),' +
  'body:has(div:has-text("You were removed")),' +
  'body:has(div:has-text("You’ve been removed")),' +
  'body:has(div:has-text("removed from the meeting"))';

// launches broswer, joins Google Meet, records captions
export async function runBot(url: string): Promise<string> {
  // CRITICAL: Use meeting ID from backend (PostgreSQL) - NEVER generate new IDs
  // This ensures PostgreSQL, Redis, MongoDB, and dashboard all use the SAME ID
  const meetingId = process.env.JOB_ID;

  if (!meetingId) {
    console.error("❌ FATAL: JOB_ID environment variable is missing!");
    console.error("Bot MUST receive meeting ID from backend - it should NEVER generate its own.");
    console.error("This indicates a bug in launchBot.ts or the container launch process.");
    throw new Error("FATAL: JOB_ID missing. Bot cannot start without meeting ID from backend.");
  }

  console.log(`🆔 BOT STARTING WITH MEETING ID: ${meetingId}`);
  console.log(`📍 Meeting URL: ${url}`);

  const createdAt = new Date();

  // Get userId and meetingTitle from environment (passed from backend)
  const userId = process.env.USER_ID;
  const meetingTitle = process.env.MEETING_TITLE;

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:23', message: 'runBot entry', data: { meetingId, url, userId, meetingTitle, hasGoogleUser: !!process.env.GOOGLE_ACCOUNT_USER, hasGooglePassword: !!process.env.GOOGLE_ACCOUNT_PASSWORD }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
  // #endregion

  console.log(`🚀 Starting meeting capture for ${meetingId}`);

  // #region agent log
  const authJsonPath = path.resolve(process.cwd(), "auth.json");
  const authJsonExists = fs.existsSync(authJsonPath);
  const authJsonSize = authJsonExists ? fs.statSync(authJsonPath).size : 0;
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:35', message: 'auth.json check', data: { authJsonPath, authJsonExists, authJsonSize, cwd: process.cwd() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
  // #endregion

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
    ],
  });

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:48', message: 'before newContext', data: { storageStatePath: 'auth.json' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
  // #endregion

  const context: BrowserContext = await browser.newContext({
    storageState: "auth.json",
  });
  const page = await context.newPage();

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:52', message: 'context created', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
  // #endregion

  // for debugging so that you see all console lines in terminal
  page.on("console", (msg) => console.log(`[page:${msg.type()}]`, msg.text()));

  // track auth failures to auto-heal expired sessions
  let authErrorCount = 0;
  page.on("response", (res) => {
    try {
      const status = res.status();
      const url = res.url();
      if (
        status === 401 &&
        /google\.com|gstatic\.com|clients6\.googleapis\.com/.test(url)
      ) {
        authErrorCount++;
      }
    } catch { }
  });

  try {
    await context.tracing.start({ screenshots: true, snapshots: true });

    // ALWAYS validate and refresh session before attempting to join meeting
    console.log("Validating session before joining meeting...");
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:72', message: 'before validateAndRefreshSession', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
    // #endregion
    await validateAndRefreshSession(page, context);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:75', message: 'after validateAndRefreshSession', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
    // #endregion

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:77', message: 'before goto meeting url', data: { url }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D' }) }).catch(() => { });
    // #endregion
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:80', message: 'after goto meeting url', data: { finalUrl: page.url() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D' }) }).catch(() => { });
    // #endregion

    // if we saw repeated 401s, refresh session and reload meet URL once
    if (authErrorCount >= 2) {
      console.warn(`Detected ${authErrorCount} auth errors – attempting re-login`);
      await loginIfNeeded(page, context);
      authErrorCount = 0;
      await page.goto(url, { waitUntil: "domcontentloaded" });
    }

    // mute mic, turn off camera, clear popup
    await clickIfVisible(page, 'button[aria-label*="Turn off microphone"]');
    await clickIfVisible(page, 'button[aria-label*="Turn off camera"]');
    await clickIfVisible(page, 'button:has-text("Got it")');

    console.log("Current URL:", page.url());
    console.log(
      "Visible buttons on screen:",
      await page.locator("button").allTextContents(),
    );

    // join/ask to join, handle 2-step join preview, close modals, wait until in meeting
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:99', message: 'before clickJoin', data: { currentUrl: page.url() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
    // #endregion
    await clickJoin(page);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:102', message: 'after clickJoin', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
    // #endregion
    await collapsePreviewIfNeeded(page);
    await dismissOverlays(page);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:105', message: 'before waitUntilJoined', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'F' }) }).catch(() => { });
    // #endregion
    await waitUntilJoined(page);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:108', message: 'after waitUntilJoined', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'F' }) }).catch(() => { });
    // #endregion
    console.log("joined meeting");

    // turn captions on
    await ensureCaptionsOn(page);
    console.log("captions visible");

    // scrape captions
    const mid = await scrapeCaptions(page, meetingId, createdAt);
    console.log("done scraping. Returning meetingId.");

    // persist refreshed session for next runs
    try {
      await context.storageState({ path: "auth.json" });
    } catch { }

    await context.tracing.stop({ path: "run.zip" });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:118', message: 'runBot success', data: { meetingId: mid }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
    return mid;
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:121', message: 'runBot error', data: { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
    throw new Error(`Run Bot error: ${err}`);
  }
}

async function scrapeCaptions(
  page: Page,
  meetingId: string,
  createdAt: Date,
): Promise<string> {
  const userId = process.env.USER_ID;
  const meetingTitle = process.env.MEETING_TITLE;
  // exitRequested = exit condition
  let exitRequested = false;
  const meetingStartTime = createdAt.getTime(); // Real meeting start time

  type CurrentSegment = {
    segmentId: string;
    speaker: string;
    text: string;
    startMs: number;
    lastUpdateMs: number;
  };

  let currentSegment: CurrentSegment | null = null;
  let finalizedSegmentCount = 0; // Counter for summary generation (no longer storing full array in memory)
  const SILENCE_MS = 1500;
  let silenceInterval: NodeJS.Timeout | null = null;

  // STATEFUL SEGMENT TRACKING: Persistent segmentId that only changes on speaker change or finalization
  let currentSegmentId: string | null = null;

  // filter system msgs and UI elements
  const isNotRealCaption = (text: string) => {
    const normalized = text.toLowerCase();
    return /you left the meeting|return to home screen|leave call|feedback|audio and video|learn more|arrow_downward|jump to bottom|jump to top|you have joined|your camera is off|your microphone is off|your hand is|there is one other person|there are \d+ other people|you were removed|you've been removed|joined|has raised a hand|reactions are not being announced|press shift\+r|keep_outline|pin.*to your main screen|mic_none|you can't remotely mute|more_vert|more options|combat\.|hello\. hello\. for\./i.test(normalized) ||
      /^\s*(joined|has raised|reactions|press|keep_outline|pin|mic_none|more_vert|combat)\s*$/i.test(text.trim());
  };

  // Helper: finalize the current stabilized segment and push to Redis clean buffer
  const finalizeCurrentSegment = async () => {
    if (!currentSegment) return;
    const now = Date.now();
    // Use floating point seconds for precision (3 decimal places) to prevent 0-duration segments
    const startSec = Math.max(0, (currentSegment.startMs - meetingStartTime) / 1000);
    let endSec = Math.max(startSec, (currentSegment.lastUpdateMs - meetingStartTime) / 1000);

    // Ensure end is strictly greater than start if they are too close (min 100ms duration)
    if (endSec - startSec < 0.1) {
      endSec = startSec + 0.1;
    }

    const segment: Segment = {
      segmentId: currentSegment.segmentId,
      speaker: currentSegment.speaker,
      text: currentSegment.text.trim(),
      start: Number(startSec.toFixed(3)),
      end: Number(endSec.toFixed(3)),
    };
    try {
      await pushFinalCaption(meetingId, segment, userId || undefined, meetingTitle || undefined);
      finalizedSegmentCount++;
      console.log(`✅ Finalized segment [${segment.segmentId}] ${segment.speaker}: "${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}" (${segment.start}s-${segment.end}s)`);
    } catch (err) {
      console.error('❌ Failed to push final caption to buffer', err);
    } finally {
      // Reset segment state after finalization - new segmentId will be generated on next caption
      currentSegment = null;
      currentSegmentId = null;
      lastSeenTextForSegment = ""; // Reset last seen text for next segment
    }
  };

  // Silence watchdog to auto-finalize if no updates
  const startSilenceWatchdog = () => {
    if (silenceInterval) clearInterval(silenceInterval);
    silenceInterval = setInterval(() => {
      if (!currentSegment) return;
      const idle = Date.now() - currentSegment.lastUpdateMs;
      if (idle > SILENCE_MS) {
        console.log(`🤫 Silence detected (> ${SILENCE_MS}ms). Finalizing segment.`);
        void finalizeCurrentSegment();
      }
    }, 500);
  };

  // Track last seen text per segment to extract only NEW text (prevent accumulating duplicates)
  let lastSeenTextForSegment: string = "";

  // Helper: Calculate text similarity (simple word overlap)
  const calculateTextSimilarity = (text1: string, text2: string): number => {
    const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 2));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  };

  // Create a closure to capture userId for the callback
  // STATEFUL SEGMENT TRACKING: currentSegmentId persists across DOM mutations
  const createCaptionHandler = () => {
    return async (speaker: string, text: string) => {
      const caption = text.trim();
      if (!caption) return;

      // Filter out system messages and UI elements
      if (isNotRealCaption(caption)) {
        console.log(`🚫 Filtered system message: "${caption.substring(0, 50)}${caption.length > 50 ? '...' : ''}"`);
        return;
      }

      const now = Date.now();

      // Push raw flicker stream for debugging/training
      try {
        await pushRawCaption(meetingId, {
          meetingId,
          text: caption,
          speaker,
          timestamp: now,
        });
      } catch (err) {
        console.error('❌ Failed to push raw caption to buffer', err);
      }

      const normalized = caption.toLowerCase();
      const isExit = EXIT_PHRASES.some((p) => normalized.includes(p));
      if (isExit) {
        console.log("Exit phrase heard — hanging up");
        exitRequested = true;
      }

      // CRITICAL: Speaker change → finalize previous segment and generate new segmentId
      if (currentSegment && currentSegment.speaker !== speaker) {
        console.log(`🔄 Speaker changed from "${currentSegment.speaker}" to "${speaker}" - finalizing previous segment`);
        await finalizeCurrentSegment();
        // After finalization, currentSegmentId is reset to null, will be generated below
        lastSeenTextForSegment = ""; // Reset last seen text for new speaker
      }

      // STATEFUL ID PERSISTENCE: Only generate new segmentId if we don't have one
      // This ensures the same ID is used across all DOM mutations for the same segment
      if (!currentSegmentId) {
        currentSegmentId = uuidv4();
        console.log(`🆕 Generated new persistent segmentId: ${currentSegmentId} for speaker "${speaker}"`);
        lastSeenTextForSegment = ""; // Reset when starting new segment
      }

      // CRITICAL: Extract only NEW text to prevent accumulating duplicates
      // The DOM may send full accumulated text, but we only want the new part
      let textToAdd = caption;
      if (lastSeenTextForSegment && caption.startsWith(lastSeenTextForSegment)) {
        // Extract only the new part
        textToAdd = caption.substring(lastSeenTextForSegment.length).trim();
        if (textToAdd.length === 0) {
          // No new content, skip this update
          return;
        }
        console.log(`✂️ Extracted new text: "${textToAdd}" (full text was: "${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}")`);
      } else if (lastSeenTextForSegment && lastSeenTextForSegment.includes(caption)) {
        // The new text is a substring of what we've already seen (backtrack), skip
        console.log(`⏭️ Skipping backtrack: new text "${caption}" is already in last seen "${lastSeenTextForSegment.substring(0, 100)}"`);
        return;
      }

      // Start or update stabilization buffer with persistent segmentId
      if (!currentSegment) {
        // New segment - use the persistent segmentId and the extracted text
        currentSegment = {
          segmentId: currentSegmentId, // Use persistent ID, not generate new one
          speaker,
          text: textToAdd, // Use only the new text, not full accumulated
          startMs: now,
          lastUpdateMs: now,
        };
        lastSeenTextForSegment = caption; // Track full accumulated text for next comparison
        console.log(`📝 New stabilized segment [${currentSegmentId}] for ${speaker}: "${textToAdd.substring(0, 80)}${textToAdd.length > 80 ? '...' : ''}"`);
      } else {
        // Update existing segment
        // CRITICAL: Keep the same segmentId for upsert operations
        if (textToAdd === caption && currentSegment.text !== caption) {
          // This is a correction/replacement, not an append
          currentSegment.text = textToAdd;
          console.log(`🔄 Corrected segment [${currentSegmentId}] text: "${textToAdd.substring(0, 80)}${textToAdd.length > 80 ? '...' : ''}"`);
        } else {
          // Append only the new text part
          currentSegment.text = (currentSegment.text + " " + textToAdd).trim();
          console.log(`🔄 Updated segment [${currentSegmentId}] - added: "${textToAdd}" | full text: "${currentSegment.text.substring(0, 80)}${currentSegment.text.length > 80 ? '...' : ''}"`);
        }
        currentSegment.lastUpdateMs = now;
        lastSeenTextForSegment = caption; // Track full accumulated text for next comparison
      }

      // Auto-finalization triggers (silence > 1.5s or punctuation . ? !)
      // BUT: Only finalize if we have substantial content to avoid premature finalization
      const endsWithPunct = /[.!?]\s*$/.test(caption);
      const idleMs = Date.now() - (currentSegment?.lastUpdateMs || now);
      const hasSubstantialContent = currentSegment && currentSegment.text.trim().length > 10;

      // Only finalize on punctuation if we have substantial content
      if (endsWithPunct && hasSubstantialContent) {
        console.log('✒️ Punctuation detected with substantial content, finalizing segment.');
        await finalizeCurrentSegment();
        // After finalization, currentSegmentId is reset, will generate new one on next caption
      } else if (currentSegment && idleMs > SILENCE_MS && hasSubstantialContent) {
        // Only finalize on silence if we have substantial content
        console.log(`🤫 Silence detected (> ${SILENCE_MS}ms) with substantial content. Finalizing segment.`);
        await finalizeCurrentSegment();
        // After finalization, currentSegmentId is reset, will generate new one on next caption
      } else if (endsWithPunct && !hasSubstantialContent) {
        // Punctuation but not enough content - don't finalize yet, wait for more
        console.log('⏳ Punctuation detected but content too short, waiting for more...');
      }

      startSilenceWatchdog();

      if (isExit) {
        // Finalize anything left and stop
        await finalizeCurrentSegment();
      }
    };
  };

  // browser-side func to receive captions from injected observer
  await page.exposeFunction(
    "onCaption",
    createCaptionHandler()
  );

  // Helper: trigger summary generation against backend with retry logic
  const triggerSummary = async () => {
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        console.log(`🤖 Attempting summary generation (attempt ${retryCount + 1}/${maxRetries})...`);
        const summaryRes = await fetch(`http://backend:3001/debug/generate-summary/${meetingId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (summaryRes.ok) {
          console.log("✅ Summary generation succeeded!");
          return; // Success, exit retry loop
        } else {
          console.error(`❌ Summary generation failed with status: ${summaryRes.status} (attempt ${retryCount + 1}/${maxRetries})`);
          const errorText = await summaryRes.text().catch(() => 'Unknown error');
          console.error(`❌ Error details: ${errorText}`);
        }
      } catch (e) {
        console.error(`❌ Summary generation network error (attempt ${retryCount + 1}/${maxRetries}):`, e);
      }

      retryCount++;
      if (retryCount < maxRetries) {
        console.log(`🔄 Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.error(`❌ CRITICAL: Summary generation failed after ${maxRetries} attempts - manual intervention required`);
  };

  // Helper: Generate summary immediately with detailed logging
  const generateSummaryImmediately = async (meetingId: string, segmentCount: number) => {
    console.log(`🚀 IMMEDIATE SUMMARY GENERATION for meeting ${meetingId}`);
    console.log(`📊 Total segments captured: ${segmentCount}`);

    try {
      // Finalize any remaining active segment before generating summary
      await finalizeCurrentSegment();

      // Note: All segments are already in Redis buffer and will be flushed by worker
      // The summarizer should read from MongoDB (which the worker populates)
      // We just need to ensure the worker has time to flush, or the summarizer reads from Redis

      // Now generate summary with retry logic
      console.log(`🤖 Calling backend to generate summary...`);
      let summaryRes;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          summaryRes = await fetch(`http://backend:3001/debug/generate-summary/${meetingId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          if (summaryRes.ok) {
            const result = await summaryRes.json();
            console.log(`✅ SUMMARY GENERATED SUCCESSFULLY!`);
            console.log(`📝 Summary preview: ${result.summary?.summaryText?.substring(0, 200) || 'No preview available'}...`);
            console.log(`💾 Summary saved to database with ID: ${result.summary?.id || 'Unknown'}`);
            break; // Success, exit retry loop
          } else {
            console.error(`❌ Summary generation failed with status: ${summaryRes.status} (attempt ${retryCount + 1}/${maxRetries})`);
            const errorText = await summaryRes.text();
            console.error(`❌ Error details: ${errorText}`);

            if (retryCount < maxRetries - 1) {
              console.log(`🔄 Retrying in 2 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        } catch (fetchError) {
          console.error(`❌ Network error during summary generation (attempt ${retryCount + 1}/${maxRetries}):`, fetchError);
          if (retryCount < maxRetries - 1) {
            console.log(`🔄 Retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        retryCount++;
      }

      if (retryCount >= maxRetries) {
        console.error(`❌ CRITICAL: Summary generation failed after ${maxRetries} attempts`);
      }
    } catch (error) {
      console.error(`❌ CRITICAL: Summary generation failed completely:`, error);
    }
  };

  // Ensure we emergency‑flush and trigger summary if page/browser is closed (e.g., bot removed)
  const emergencyFlushAndSummarize = async (reason: string) => {
    try {
      console.warn(`⚠️ Page/browser termination detected (${reason}) – finalizing remaining segment`);
      // Finalize any remaining active segment (pushes to Redis buffer)
      await finalizeCurrentSegment();
      console.log(`✅ Emergency finalization completed - segment pushed to Redis buffer`);
    } catch (e) {
      console.error("❌ Emergency finalization failed:", e);
    } finally {
      // Use the more detailed summary generation function
      await generateSummaryImmediately(meetingId, finalizedSegmentCount);
    }
  };

  // Attach shutdown handlers once
  page.once("close", () => { void emergencyFlushAndSummarize("page.close"); });
  page.once("crash", () => { void emergencyFlushAndSummarize("page.crash"); });
  page.context().once("close", () => { void emergencyFlushAndSummarize("context.close"); });
  page.context().browser()?.once("disconnected", () => { void emergencyFlushAndSummarize("browser.disconnected"); });

  // Wait for captions region to be available (after ensureCaptionsOn)
  console.log("Waiting for captions region to be available...");

  // Try multiple selectors for caption regions - ORDER MATTERS
  // We prioritize explicit "Captions" regions and avoid generic ones that catch notifications
  const captionSelectors = [
    // Primary: Explicit caption regions
    '[role="region"][aria-label*="Captions"]',
    '[role="region"][aria-label*="captions"]',
    '[role="region"][aria-label*="Closed captions"]',

    // Secondary: Class-based (less reliable but often works)
    '.captions',
    '.caption',

    // Fallback: Generic aria-live BUT we must be careful
    // '[aria-live="polite"]' // <--- REMOVED: Catches notification toasts (e.g. "You joined")
    '[class*="caption-window"]',
    'div[jsname="dsSSge"]' // Common Google Meet caption container jsname
  ];

  let captionRegion = null;
  for (const selector of captionSelectors) {
    try {
      // Short timeout for each check
      await page.waitForSelector(selector, { timeout: 2000, state: 'attached' });
      const candidates = await page.$$(selector);

      for (const candidate of candidates) {
        // VETTING PROCESS: Check if this is actually the caption region
        const label = await candidate.getAttribute('aria-label') || '';
        const text = await candidate.textContent() || '';

        // Reject notification areas and controls
        if (label.toLowerCase().includes('notification') ||
          label.toLowerCase().includes('control') ||
          text.includes('Press Down Arrow') ||
          text.includes('You have joined')) {
          console.log(`⚠️ Rejecting candidate selector "${selector}" - looks like UI/Notification: "${label}"`);
          continue;
        }

        // Accept if it looks promising
        captionRegion = candidate;
        console.log(`✅ Found valid caption region with selector: ${selector} (Label: "${label}")`);
        break;
      }

      if (captionRegion) break;
    } catch (e) {
      // Ignore timeout and try next
    }
  }

  if (!captionRegion) {
    console.log("No caption region found with any selector, proceeding anyway...");
  }

  // Debug: Check what caption regions exist
  const captionRegions = await page.evaluate(() => {
    const regions = document.querySelectorAll('[role="region"], [aria-live], .captions, .caption');
    return Array.from(regions).map(r => ({
      tagName: r.tagName,
      ariaLabel: r.getAttribute('aria-label'),
      ariaLive: r.getAttribute('aria-live'),
      textContent: r.textContent?.trim(),
      className: r.className,
      id: r.id
    }));
  });
  console.log("Found caption regions:", captionRegions);

  // Wait for captions to actually appear (with shorter timeout)
  try {
    await page.waitForFunction(() => {
      const selectors = [
        '[role="region"][aria-label*="Captions"]',
        '[role="region"][aria-label*="captions"]',
        '[aria-live="polite"]',
        '[aria-live="assertive"]'
      ];

      for (const sel of selectors) {
        const region = document.querySelector(sel);
        if (region && region.textContent && region.textContent.trim().length > 0) {
          return true;
        }
      }
      return false;
    }, { timeout: 10000 });
    console.log("Captions content detected - setting up observer...");
  } catch (e) {
    console.log("No caption content detected, but proceeding with observer setup...");
  }

  // inject observer into page to listen to DOM changes & send caption updates
  await page.evaluate(() => {
    const badgeSel = ".NWpY1d, .xoMHSc";
    let lastSpeaker = "Unknown Speaker";
    let mutationCount = 0;
    const lastSeenText = new Map<string, string>(); // Track last seen text per speaker

    // extract speaker with better detection
    const getSpeaker = (node: HTMLElement): string => {
      // Try multiple selectors for speaker badges
      const speakerSelectors = [
        ".NWpY1d", ".xoMHSc",
        "[data-speaker-name]",
        ".speaker-name",
        "[aria-label*='speaking']",
        ".caption-speaker"
      ];

      for (const selector of speakerSelectors) {
        const badge = node.querySelector<HTMLElement>(selector);
        const speaker = badge?.textContent?.trim();
        if (speaker && speaker.length > 0 && speaker !== lastSpeaker) {
          console.log(`[DEBUG] New speaker detected: "${speaker}" (was: "${lastSpeaker}")`);
          return speaker;
        }
      }

      // If no new speaker found, check if the node itself contains speaker info
      const nodeText = node.textContent?.trim() || "";
      const speakerMatch = nodeText.match(/^([^:]+):/);
      if (speakerMatch) {
        const speaker = speakerMatch[1].trim();
        if (speaker && speaker !== lastSpeaker) {
          console.log(`[DEBUG] Speaker from text pattern: "${speaker}"`);
          return speaker;
        }
      }

      return lastSpeaker;
    };

    // extract caption
    const getText = (node: HTMLElement): string => {
      const clone = node.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll<HTMLElement>(badgeSel)
        .forEach((el) => el.remove());
      return clone.textContent?.trim() ?? "";
    };

    // Clean text - remove UI elements and system messages
    const cleanText = (text: string): string => {
      // Remove "arrow_downwardJump to bottom" and similar UI elements
      return text
        .replace(/arrow_downwardJump to bottom/gi, '')
        .replace(/arrow_upwardJump to top/gi, '')
        .replace(/Jump to (bottom|top)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Extract only NEW text by comparing with last seen text
    const extractNewText = (fullText: string, speaker: string): string | null => {
      const lastText = lastSeenText.get(speaker) || "";

      // If this is the same text, skip it
      if (fullText === lastText) {
        return null;
      }

      // If the new text starts with the last text, extract only the new part
      if (fullText.startsWith(lastText)) {
        const newPart = fullText.substring(lastText.length).trim();
        // Only return if there's substantial new content (more than just punctuation/spaces)
        if (newPart.length > 2) {
          return newPart;
        }
        return null;
      }

      // If the text is completely different (new sentence/thought), return it
      // But check if it's not just a shorter version of what we've seen
      if (lastText.length > 0 && !lastText.includes(fullText.substring(0, Math.min(20, fullText.length)))) {
        return fullText; // Completely new text
      }

      // If last text is empty or this is longer, it's new
      if (lastText.length === 0 || fullText.length > lastText.length) {
        return fullText;
      }

      return null;
    };

    // send caption to exposed onCaption()
    const send = (node: HTMLElement): void => {
      let txt = getText(node);
      const spk = getSpeaker(node);

      // Clean the text
      txt = cleanText(txt);

      // Skip if empty or just speaker name
      if (!txt || txt.length === 0 || txt.toLowerCase() === spk.toLowerCase()) {
        return;
      }

      // Extract only NEW text
      const newText = extractNewText(txt, spk);

      if (!newText) {
        // No new content, skip
        return;
      }

      // Update last seen text
      lastSeenText.set(spk, txt);

      console.log(`[DEBUG] Processing node: speaker="${spk}", fullText="${txt.substring(0, 100)}${txt.length > 100 ? '...' : ''}", newText="${newText}"`);

      // Check if this looks like a new speaker change
      if (spk !== lastSpeaker) {
        console.log(`[DEBUG] Speaker changed from "${lastSpeaker}" to "${spk}"`);
        lastSpeaker = spk;
      }

      console.log(`[DEBUG] Sending NEW caption: ${spk}: ${newText}`);
      // @ts-expect-error
      window.onCaption?.(spk, newText);
    };

    // More aggressive caption detection - check all possible caption containers
    // But only process individual caption nodes, not the entire region
    const checkForCaptions = () => {
      // Find individual caption nodes (not the container)
      const captionNodes = document.querySelectorAll('[role="region"][aria-label*="Captions"] > *, [role="region"][aria-label*="captions"] > *');

      captionNodes.forEach((node) => {
        if (node instanceof HTMLElement && node.textContent?.trim()) {
          const text = node.textContent.trim();
          // Only process if this looks like a caption node (has speaker info or is a recent addition)
          if (text.length > 5 && !text.includes('arrow_downward') && !text.includes('Jump to')) {
            send(node);
          }
        }
      });

      // Also check aria-live regions for new announcements
      const liveRegions = document.querySelectorAll('[aria-live="polite"], [aria-live="assertive"]');
      liveRegions.forEach((region) => {
        if (region instanceof HTMLElement && region.textContent?.trim()) {
          const text = region.textContent.trim();
          // Only process if it's not a system message
          if (text.length > 5 &&
            !text.includes('joined') &&
            !text.includes('raised a hand') &&
            !text.includes('Reactions are not') &&
            !text.includes('You have joined') &&
            !text.includes('Your camera') &&
            !text.includes('Your microphone')) {
            send(region);
          }
        }
      });
    };

    // Initial check
    checkForCaptions();

    // watch DOM for caption updates and run send()
    new MutationObserver((mutations) => {
      mutationCount++;
      console.log(`[DEBUG] Mutation #${mutationCount}, ${mutations.length} changes`);

      for (const m of mutations) {
        // new caption elements - only process if they look like actual captions
        Array.from(m.addedNodes).forEach((n) => {
          if (n instanceof HTMLElement) {
            const text = n.textContent?.trim() || "";
            // Only process if it's substantial text and not a system message
            if (text.length > 5 &&
              !text.includes('arrow_downward') &&
              !text.includes('Jump to') &&
              !text.match(/^(joined|has raised|reactions|press|keep_outline|pin|mic_none|more_vert|combat)/i)) {
              console.log(`[DEBUG] Added node: ${n.tagName}, text="${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
              send(n);
            }
          }
        });
        // live text edits inside an existing element - only if parent looks like a caption
        if (
          m.type === "characterData" &&
          m.target?.parentElement instanceof HTMLElement
        ) {
          const parent = m.target.parentElement;
          const text = parent.textContent?.trim() || "";
          // Only process if parent is in caption region and has meaningful text
          if (text.length > 5 &&
            parent.closest('[role="region"][aria-label*="Captions"], [role="region"][aria-label*="captions"]')) {
            console.log(`[DEBUG] Character data change: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
            send(parent);
          }
        }
      }

      // Check for new captions after mutations (but less frequently)
      if (mutationCount % 3 === 0) {
        checkForCaptions();
      }
    }).observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    console.log("Caption observer setup complete - watching for DOM changes");
  });

  // Note: No periodic flush timer needed - Redis buffer is flushed by worker based on size/time thresholds
  // All finalized segments are pushed immediately to Redis via pushFinalCaption()

  // leave call and finalize remaining segment
  const leaveCall = async () => {
    // Finalize any remaining active segment before leaving (pushes to Redis buffer)
    console.log("🚪 Leaving call - finalizing remaining segment");
    await finalizeCurrentSegment();

    const hangUpSel =
      'button[aria-label*="Leave call"], button[aria-label*="Leave meeting"]';
    if (await page.$(hangUpSel)) {
      await clickIfVisible(page, hangUpSel);
    } else {
      await page.keyboard.press("Ctrl+Alt+Q");
    }
    await page
      .waitForSelector(LEAVE_BANNER_SEL, { timeout: 10_000 })
      .catch(() => undefined);

    console.log(`✅ Leave call completed - all segments pushed to Redis buffer`);
  };

  // Removed automatic summary generation - summaries only generated when meeting ends

  // Removed inactivity-based summary generation - summaries only generated when meeting actually ends

  // Activity timer removed - summaries only generated when meeting ends

  // exit conditions (exit phrase, leave banner, hard timeout)
  try {
    await Promise.race([
      (async () => {
        while (!exitRequested) await new Promise((r) => setTimeout(r, 500));
        await leaveCall();
      })(),
      page.waitForSelector(LEAVE_BANNER_SEL, { timeout: 0 }),
      new Promise((_, rej) =>
        setTimeout(
          () => rej(new Error("Hard timeout (100 min) exceeded")),
          100 * 60 * 1000,
        ),
      ),
    ]);
  } catch (error) {
    console.warn("⚠️ Meeting ended unexpectedly:", error instanceof Error ? error.message : String(error));
    console.log("🔄 Attempting emergency finalization of any remaining segment...");
    // Emergency finalization in case of unexpected termination (pushes to Redis buffer)
    await finalizeCurrentSegment();
    console.log(`✅ Emergency finalization completed - segment pushed to Redis buffer`);
  } finally {
    // Clean up silence watchdog timer
    if (silenceInterval) {
      clearInterval(silenceInterval);
      silenceInterval = null;
    }
  }

  // CRITICAL: Generate summary immediately when meeting ends (regardless of how it ended)
  // Note: Summarizer should read from MongoDB (populated by flush worker) or Redis buffer
  console.log(`🎯 MEETING ENDED - Generating summary immediately for meeting ${meetingId}`);
  await generateSummaryImmediately(meetingId, finalizedSegmentCount);

  // Final cleanup: ensure any remaining segment is finalized
  await finalizeCurrentSegment();
  console.log(`✅ All segments finalized and pushed to Redis buffer for meeting ${meetingId}`);
  console.log(`📊 Total segments captured: ${finalizedSegmentCount}`);

  // Optional: Notify backend about completion (for job tracking, but summary is already generated)
  try {
    const jobId = process.env.JOB_ID || `auto-job-${meetingId}`;
    console.log(`📤 Notifying backend about job completion for tracking purposes...`);

    const res = await fetch("http://backend:3001/bot-done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, meetingId }),
    });

    if (res.ok) {
      console.log(`✅ [bot-done] Backend notification successful (${res.status})`);
    } else {
      console.log(`ℹ️ [bot-done] Backend notification failed (${res.status}) - but summary already generated`);
    }
  } catch (err) {
    console.log(`ℹ️ [bot-done] Backend notification failed - but summary already generated:`, err);
  }
  console.log(`🎉 Meeting ${meetingId}: ${finalizedSegmentCount} segments captured and pushed to Redis buffer`);
  return meetingId;
}

// if session is invalid, perform a credentialed login and persist storage state
async function loginIfNeeded(page: Page, context: BrowserContext) {
  const url = page.url();
  const looksLikeLogin = /accounts\.google\.com/.test(url);

  const email = process.env.GOOGLE_ACCOUNT_USER;
  const password = process.env.GOOGLE_ACCOUNT_PASSWORD;

  if (!looksLikeLogin) {
    // heuristic: if the Meet page shows a sign-in prompt
    if (await page.locator('input[type="email"]').first().isVisible().catch(() => false)) {
      // fall through to login
    } else {
      return;
    }
  }

  if (!email || !password) {
    console.warn("Missing GOOGLE_ACCOUNT_USER/PASSWORD; cannot auto-login.");
    return;
  }

  // Navigate to the Google sign-in flow if not already there
  if (!looksLikeLogin) {
    await page.goto("https://accounts.google.com/", { waitUntil: "domcontentloaded" });
  }

  // fill email
  console.log("📧 Filling email for loginIfNeeded...");
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 60000 });
  await emailInput.fill(email);

  // Click next and wait for password page
  const nextButton = page.locator('#identifierNext, button:has-text("Next")').first();
  await nextButton.waitFor({ state: 'visible', timeout: 10000 });
  await nextButton.click();

  // Wait for password page - try multiple strategies
  await page.waitForTimeout(2000); // Give page time to transition

  // Try waiting for URL change
  try {
    await page.waitForURL(/accounts\.google\.com\/.*(challenge|signin|password)/, { timeout: 15000 });
  } catch (e) {
    // URL might not change, continue
  }

  // fill password (handle multiple password forms)
  console.log("🔑 Waiting for password input...");
  let passwordInput = page.locator('input[type="password"]:not([aria-hidden="true"])').first();
  let passwordFound = false;

  try {
    await passwordInput.waitFor({ state: 'visible', timeout: 20000 });
    passwordFound = true;
  } catch (e) {
    // Try alternative selectors
    const alternativeSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[aria-label*="password" i]',
    ];

    for (const selector of alternativeSelectors) {
      try {
        passwordInput = page.locator(selector).first();
        await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
        passwordFound = true;
        break;
      } catch (err) {
        // Try next selector
      }
    }
  }

  if (!passwordFound) {
    throw new Error("Password input not found");
  }

  await passwordInput.fill(password);

  // Click password next
  const passwordNextButton = page.locator('#passwordNext, button:has-text("Next")').first();
  await passwordNextButton.waitFor({ state: 'visible', timeout: 10000 });
  await passwordNextButton.click();

  // Wait for redirect away from login
  try {
    await page.waitForURL((url) => !url.hostname.includes('accounts.google.com'), { timeout: 30000 });
  } catch (e) {
    // Still wait a bit
    await page.waitForTimeout(3000);
  }

  // give Google time to finalize session and redirect
  await page.waitForTimeout(3000);

  // persist storage for subsequent runs
  try {
    await context.storageState({ path: 'auth.json' });
    console.log('Refreshed auth.json after login');
  } catch { }
}

// PROACTIVE session validation and refresh - runs before every meeting join
async function validateAndRefreshSession(page: Page, context: BrowserContext) {
  const email = process.env.GOOGLE_ACCOUNT_USER;
  const password = process.env.GOOGLE_ACCOUNT_PASSWORD;

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:942', message: 'validateAndRefreshSession entry', data: { hasEmail: !!email, hasPassword: !!password }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
  // #endregion

  console.log("Testing session validity by accessing Google Meet home...");

  try {
    // Test session by going to Meet home page
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:950', message: 'before goto meet.google.com', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
    // #endregion
    await page.goto("https://meet.google.com/", { waitUntil: "domcontentloaded", timeout: 30000 });

    // Check if we're redirected to login or see login prompts
    const currentUrl = page.url();
    const isRedirectedToLogin = /accounts\.google\.com/.test(currentUrl);
    const hasLoginPrompt = await page.locator('input[type="email"]').first().isVisible().catch(() => false);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:957', message: 'session check result', data: { currentUrl, isRedirectedToLogin, hasLoginPrompt }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
    // #endregion

    if (isRedirectedToLogin || hasLoginPrompt) {
      console.log("⚠️ Session appears expired or invalid");

      // Only attempt automated login if credentials are available
      if (!email || !password) {
        console.warn("❌ Missing GOOGLE_ACCOUNT_USER/PASSWORD - cannot perform automated login.");
        console.warn("💡 Please run 'npm run gen:auth' to manually create a valid auth.json file.");
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:965', message: 'missing credentials error', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
        // #endregion
        throw new Error("Session expired and automated login credentials not available. Run 'npm run gen:auth' to create auth.json.");
      }

      console.log("🔄 Attempting automated login...");
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:970', message: 'before performFreshLogin', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
      // #endregion
      await performFreshLogin(page, context);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:973', message: 'after performFreshLogin', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
      // #endregion
    } else {
      console.log("✅ Session is valid - proceeding to meeting");
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:976', message: 'session valid', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
      // #endregion
    }

    // Always refresh storage state after validation
    try {
      await context.storageState({ path: 'auth.json' });
      console.log('✅ Updated auth.json with current session');
    } catch { }

  } catch (error: any) {
    // If it's a rejection error, don't retry
    if (error.message?.includes('rejected') || error.message?.includes('manual login')) {
      console.error("❌ Automated login was rejected by Google.");
      console.error("💡 SOLUTION: Run 'npm run gen:auth' to manually log in and create auth.json");
      throw error;
    }

    console.warn("⚠️ Session validation failed:", error.message);

    // Only retry if we have credentials
    if (email && password) {
      console.log("🔄 Retrying with fresh login...");
      try {
        await performFreshLogin(page, context);
      } catch (retryError: any) {
        if (retryError.message?.includes('rejected') || retryError.message?.includes('manual login')) {
          throw retryError; // Don't wrap rejection errors
        }
        throw new Error(`Session validation and login retry both failed: ${retryError.message}`);
      }
    } else {
      throw new Error("Session validation failed and no credentials available for automated login. Run 'npm run gen:auth' to create auth.json.");
    }
  }
}

// Perform a complete fresh login from scratch
async function performFreshLogin(page: Page, context: BrowserContext) {
  const email = process.env.GOOGLE_ACCOUNT_USER;
  const password = process.env.GOOGLE_ACCOUNT_PASSWORD;

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1007', message: 'performFreshLogin entry', data: { hasEmail: !!email, hasPassword: !!password }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
  // #endregion

  if (!email || !password) {
    throw new Error("Missing GOOGLE_ACCOUNT_USER/PASSWORD for fresh login");
  }

  console.log("Performing fresh Google login...");

  try {
    // Clear any existing session
    await context.clearCookies();
    console.log("✅ Cleared cookies");

    // Go to Google sign-in
    console.log("🌐 Navigating to Google sign-in...");
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1024', message: 'before goto accounts.google.com', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
    // #endregion
    await page.goto("https://accounts.google.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000); // Give page time to fully load

    // Fill email
    console.log("📧 Waiting for email input...");
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 60000 });
    console.log("✅ Email input found");

    await emailInput.fill(email);
    console.log(`✅ Filled email: ${email}`);

    // Click next and wait for navigation or password field
    console.log("🖱️ Clicking 'Next' button...");
    const nextButton = page.locator('#identifierNext, button:has-text("Next")').first();
    await nextButton.waitFor({ state: 'visible', timeout: 10000 });
    await nextButton.click();

    // Wait for password page to load - try multiple strategies
    console.log("⏳ Waiting for password page...");
    let passwordInput;
    let passwordFound = false;

    // Wait a bit for page to load after clicking Next
    await page.waitForTimeout(3000);

    // Check current URL for rejection or challenge pages
    const urlAfterNext = page.url();
    console.log("🔍 Current URL after Next click:", urlAfterNext);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1052', message: 'after email next click', data: { urlAfterNext, hasRejected: urlAfterNext.includes('/rejected'), hasChallenge: urlAfterNext.includes('/challenge') }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
    // #endregion

    // Check if Google is showing a challenge/rejection page
    if (urlAfterNext.includes('/rejected') || urlAfterNext.includes('/challenge')) {
      console.error("❌ Google is showing a challenge/rejection page. This usually means:");
      console.error("   1. Google detected automated login attempts");
      console.error("   2. The account needs manual verification");
      console.error("   3. There's a CAPTCHA or security challenge");
      console.error("");
      console.error("💡 SOLUTION: You need to manually log in using the generate-auth.js script:");
      console.error("   Run: npm run gen:auth");
      console.error("   This will open a browser where you can manually complete the login.");
      console.error("   The session will be saved to auth.json for future use.");
      throw new Error("Google login rejected - manual login required. Run 'npm run gen:auth' to create a valid auth.json file.");
    }

    // Strategy 1: Wait for URL change to password/challenge page (but not rejected)
    try {
      await page.waitForURL(/accounts\.google\.com\/.*(challenge|signin|password)/, { timeout: 15000 });
      // Double-check it's not a rejected page
      if (page.url().includes('/rejected')) {
        throw new Error("Google login was rejected");
      }
      console.log("✅ URL changed to password page");
    } catch (e: any) {
      if (e?.message?.includes('rejected')) {
        throw e;
      }
      console.log("⚠️ URL didn't change as expected, continuing...");
    }

    // Strategy 2: Wait for password input to appear
    try {
      passwordInput = page.locator('input[type="password"]:not([aria-hidden="true"])').first();
      await passwordInput.waitFor({ state: 'visible', timeout: 20000 });
      passwordFound = true;
      console.log("✅ Password input found");
    } catch (e) {
      console.log("⚠️ Password input not found with first selector, trying alternatives...");

      // Check again if we're on a rejected page
      const urlCheck = page.url();
      if (urlCheck.includes('/rejected') || urlCheck.includes('/challenge')) {
        throw new Error("Google login was rejected - manual login required");
      }

      // Strategy 3: Try alternative selectors
      const alternativeSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[aria-label*="password" i]',
        'input#password',
      ];

      for (const selector of alternativeSelectors) {
        try {
          passwordInput = page.locator(selector).first();
          await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
          passwordFound = true;
          console.log(`✅ Password input found with selector: ${selector}`);
          break;
        } catch (err) {
          // Try next selector
        }
      }
    }

    if (!passwordFound || !passwordInput) {
      // Final check for rejected page
      const finalUrl = page.url();
      if (finalUrl.includes('/rejected') || finalUrl.includes('/challenge')) {
        console.error("❌ Google is blocking automated login. Manual login required.");
        console.error("💡 Run 'npm run gen:auth' to create a valid auth.json file.");
        throw new Error("Google login rejected - manual login required. Run 'npm run gen:auth' to create a valid auth.json file.");
      }

      // Take screenshot for debugging
      const screenshot = await page.screenshot({ path: '/tmp/login-debug.png' }).catch(() => null);
      console.error("❌ Password input not found. Current URL:", page.url());
      console.error("❌ Page title:", await page.title().catch(() => 'Unknown'));
      throw new Error("Password input field not found after email submission. Google may have changed their login flow or there's a challenge page.");
    }

    // Fill password
    console.log("🔑 Filling password...");
    await passwordInput.fill(password);
    console.log("✅ Password filled");

    // Click password next button
    console.log("🖱️ Clicking password 'Next' button...");
    const passwordNextButton = page.locator('#passwordNext, button:has-text("Next")').first();
    await passwordNextButton.waitFor({ state: 'visible', timeout: 10000 });
    await passwordNextButton.click();

    // Wait for successful login - look for redirect away from accounts.google.com
    console.log("⏳ Waiting for login to complete...");
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1219', message: 'before wait for redirect', data: { currentUrl: page.url() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
    // #endregion
    try {
      await page.waitForURL((url) => !url.hostname.includes('accounts.google.com'), { timeout: 30000 });
      console.log("✅ Redirected away from login page");
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1224', message: 'redirected away from login', data: { currentUrl: page.url() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
      // #endregion
    } catch (e) {
      console.log("⚠️ Still on accounts.google.com, waiting a bit longer...");
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1227', message: 'still on accounts.google.com', data: { currentUrl: page.url() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
      // #endregion
      await page.waitForTimeout(5000);
    }

    // Additional wait for session to be established
    await page.waitForTimeout(3000);

    // Verify we're logged in by checking Meet home
    console.log("🌐 Verifying login by accessing Meet home...");
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1239', message: 'before verify login goto meet', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
    // #endregion
    await page.goto("https://meet.google.com/", { waitUntil: "domcontentloaded", timeout: 30000 });

    // Check if we're still on login page
    const finalUrl = page.url();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1244', message: 'login verification result', data: { finalUrl, stillOnLogin: finalUrl.includes('accounts.google.com') }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
    // #endregion
    if (finalUrl.includes('accounts.google.com')) {
      throw new Error("Still on login page after password submission. Login may have failed or there's a challenge.");
    }

    console.log("✅ Successfully logged in");

    // Save fresh session
    try {
      await context.storageState({ path: 'auth.json' });
      console.log('✅ Fresh login completed - auth.json updated');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1253', message: 'auth.json saved', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
      // #endregion
    } catch (error) {
      console.error('❌ Failed to save fresh session:', error);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1257', message: 'auth.json save failed', data: { error: error instanceof Error ? error.message : String(error) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
      // #endregion
      throw error;
    }
  } catch (error: any) {
    console.error("❌ Login failed:", error.message);
    console.error("❌ Error details:", error);

    // Take screenshot for debugging
    try {
      await page.screenshot({ path: '/tmp/login-error.png' });
      console.log("📸 Screenshot saved to /tmp/login-error.png");
    } catch (e) {
      // Ignore screenshot errors
    }

    throw new Error(`Login failed: ${error.message}`);
  }
}

// click visible element by selector, true if successful
async function clickIfVisible(page: Page, selector: string, timeout = 5000) {
  try {
    const elem = page.locator(selector);
    await elem.waitFor({ state: "visible", timeout });
    await elem.click();
    return true;
  } catch {
    return false;
  }
}

// join mtg by clicking "Join" button/fallbacks
async function clickJoin(page: Page): Promise<void> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1208', message: 'clickJoin entry', data: { currentUrl: page.url() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
  // #endregion
  const allButtons = await page.locator("button").allTextContents();
  console.log("Visible buttons on screen:", allButtons);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1211', message: 'visible buttons', data: { buttonCount: allButtons.length, buttons: allButtons.slice(0, 10) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
  // #endregion

  const continueBtn = page.locator(
    'button:has-text("Continue without microphone and camera")',
  );
  try {
    await continueBtn.waitFor({ state: "visible", timeout: 3000 });
    await continueBtn.click();
    console.log('Clicked: "Continue without microphone and camera"');
    await page.waitForTimeout(1000);
  } catch {
    console.log('ℹ "Continue without microphone and camera" not shown');
  }

  // try related possibilites for joining
  const possibleTexts = [
    "Join now",
    "Ask to join",
    "Join meeting",
    "Join call",
    "Join",
    "Done",
    "Continue",
    "Continue to join",
    "Start meeting",
  ];

  for (const text of possibleTexts) {
    // try text-based and role-based locators
    const btnText = page.locator(`button:has-text("${text}")`).first();
    const btnRole = page.getByRole("button", { name: new RegExp(text, "i") }).first();
    try {
      await Promise.race([
        btnText.waitFor({ state: "visible", timeout: 5000 }),
        btnRole.waitFor({ state: "visible", timeout: 5000 }),
      ]);
      const clickable = (await btnText.isVisible().catch(() => false)) ? btnText : btnRole;

      // if disabled (guest/preview), try filling name/email and wait until enabled
      const enabled = await clickable.isEnabled().catch(() => true);
      if (!enabled) {
        const nameInput = page.locator('input[type="text"], input[aria-label*="name" i]');
        const emailInput = page.locator('input[type="email"]');
        if (await nameInput.first().isVisible().catch(() => false)) {
          await nameInput.first().fill("Meeting Bot").catch(() => { });
        }
        if (await emailInput.first().isVisible().catch(() => false)) {
          if (process.env.GOOGLE_ACCOUNT_USER) {
            await emailInput.first().fill(process.env.GOOGLE_ACCOUNT_USER).catch(() => { });
          }
        }
        // wait for the button to become enabled up to 10s
        const handle = await clickable.elementHandle().catch(() => null);
        if (handle) {
          await page
            .waitForFunction(
              (el) => (el as unknown as HTMLButtonElement).disabled === false,
              handle,
              { timeout: 10000 }
            )
            .catch(() => { });
        }
      }

      await clickable.scrollIntoViewIfNeeded().catch(() => { });
      await clickable.click({ timeout: 2000 }).catch(async () => {
        await clickable.click({ force: true });
      });
      console.log(`Clicked join button: "${text}"`);
      return;
    } catch (err) {
      console.log(
        `Skipped "${text}" – ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // fallback to any button with "join" in it
  const fallbackButtons = page.locator("button");
  const count = await fallbackButtons.count();
  for (let i = 0; i < count; i++) {
    const btn = fallbackButtons.nth(i);
    const label = (await btn.textContent())?.trim();
    if (label && /join/i.test(label)) {
      try {
        await btn.click();
        console.log(`Fallback: clicked button with text "${label}"`);
        return;
      } catch { }
    }
  }
  // last effort = press Enter
  console.warn("No join button found — pressing Enter as fallback");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}

// waits until bot is in the call/added to the call
async function waitUntilJoined(page: Page, timeoutMs = 60_000) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1418', message: 'waitUntilJoined entry', data: { timeoutMs, currentUrl: page.url() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'F' }) }).catch(() => { });
  // #endregion
  const inCall = await Promise.race([
    page.waitForSelector('button[aria-label*="Leave call"]', {
      timeout: timeoutMs,
    }),
    page.waitForSelector("text=You've been admitted", { timeout: timeoutMs }),
    page.waitForSelector("text=You’re the only one here", {
      timeout: timeoutMs,
    }),
  ]).catch(() => false);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'runBot.ts:1429', message: 'waitUntilJoined result', data: { inCall: !!inCall, currentUrl: page.url() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'F' }) }).catch(() => { });
  // #endregion

  if (!inCall) throw new Error("Not admitted within time limit");
}

// sometimes there is a preview, handle preview here
async function collapsePreviewIfNeeded(page: Page) {
  const previewJoin = page.getByRole("button", { name: /join now/i }).nth(1);
  if (await previewJoin.isVisible({ timeout: 3000 })) {
    await previewJoin.click();
    console.log("clicked 2‑step Join");
  }
}

// dismiss modals like "Continue" using click/escape
async function dismissOverlays(page: Page) {
  const selectors = [
    'button:has-text("Got it")',
    'button:has-text("Dismiss")',
    'button:has-text("Continue")',
  ];
  for (const sel of selectors) {
    await clickIfVisible(page, sel, 1_000);
  }

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
}

// returns true if captions region is present and visible
async function captionsRegionVisible(page: Page, t = 4000): Promise<boolean> {
  const region = page.locator('[role="region"][aria-label*="Captions"]');
  try {
    await region.waitFor({ timeout: t });

    if (await region.isVisible().catch(() => false)) return true;

    console.warn("Captions region found but not visibly rendered yet");
    return true;
  } catch {
    return false;
  }
}

// make sure captions are enabled
// make sure captions are enabled
async function ensureCaptionsOn(page: Page, timeoutMs = 60_000) {
  console.log(" Waiting for UI to stabilize after join...");
  await page.waitForTimeout(5000);

  // close overlays if blocking interaction
  const overlay = page.locator('div[data-disable-esc-to-close="true"]');
  for (let i = 0; i < 8; i++) {
    if (!(await overlay.isVisible().catch(() => false))) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // Strategy 1: Check if captions are already on
  if (await captionsAlreadyEnabled(page)) {
    console.log("✅ Captions are already enabled");
    return;
  }

  // Strategy 2: Try keyboard shortcut (Shift+C) with limited attempts
  console.log(" Trying Shift+C shortcut...");
  for (let i = 0; i < 5; i++) {
    console.log(`Attempt ${i + 1}: Pressing Shift+C`);
    await page.keyboard.down("Shift");
    await page.keyboard.press("c");
    await page.keyboard.up("Shift");

    if (await captionsAlreadyEnabled(page, 1500)) {
      console.log("✅ Captions enabled via Shift+C");
      return;
    }
    await page.waitForTimeout(500);
  }

  // Strategy 3: Try direct CC button click
  console.log(' Trying direct CC button click...');
  await page.mouse.move(500, 700); // Move mouse to trigger control bar
  await page.waitForTimeout(500);

  const ccButtonSelectors = [
    'button[aria-label*="Turn on captions"]',
    'button[aria-label*="captions"]',
    'button[data-tooltip*="captions"]',
    '[data-tooltip*="captions"]',
    'button:has-text("Turn on captions")',
    '[aria-label*="CC"]',
  ];

  for (const selector of ccButtonSelectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`Found CC button with selector: ${selector}`);
      await btn.click();
      await page.waitForTimeout(1000);
      if (await captionsAlreadyEnabled(page)) {
        console.log("✅ Captions enabled via CC button");
        return;
      }
    }
  }

  // Strategy 4: Try via "More options" menu (three dots)
  console.log(' Trying "More options" menu...');
  const moreOptionsSelectors = [
    'button[aria-label*="More options"]',
    'button[aria-label*="more_vert"]',
    'button[data-tooltip*="More options"]',
  ];

  for (const selector of moreOptionsSelectors) {
    const moreBtn = page.locator(selector).first();
    if (await moreBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`Found "More options" button with selector: ${selector}`);
      await moreBtn.click();
      await page.waitForTimeout(800);

      // Look for captions option in menu
      const captionMenuItems = [
        'li:has-text("captions")',
        '[role="menuitem"]:has-text("captions")',
        'span:has-text("Turn on captions")',
        '[data-value="caption"]',
      ];

      for (const itemSel of captionMenuItems) {
        const menuItem = page.locator(itemSel).first();
        if (await menuItem.isVisible({ timeout: 500 }).catch(() => false)) {
          console.log(`Found captions menu item: ${itemSel}`);
          await menuItem.click();
          await page.waitForTimeout(1000);
          if (await captionsAlreadyEnabled(page)) {
            console.log("✅ Captions enabled via More options menu");
            return;
          }
        }
      }

      // Close menu if nothing found
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  }

  // Strategy 5: Try the bottom bar CC toggle (newer UI)
  console.log(' Trying bottom bar CC toggle...');
  const bottomBarCC = page.locator('[data-is-muted="true"][aria-label*="caption"], [data-is-muted="false"][aria-label*="caption"]').first();
  if (await bottomBarCC.isVisible({ timeout: 1000 }).catch(() => false)) {
    await bottomBarCC.click();
    await page.waitForTimeout(1000);
    if (await captionsAlreadyEnabled(page)) {
      console.log("✅ Captions enabled via bottom bar toggle");
      return;
    }
  }

  // Final check - maybe captions are now on
  if (await captionsAlreadyEnabled(page, 3000)) {
    console.log("✅ Captions are now enabled (delayed detection)");
    return;
  }

  // debug info if captions aren't on
  console.warn("⚠️ Could not enable captions - dumping debug info:");
  const visibleRegions = await page.locator('[role="region"]').allTextContents();
  console.log("visible regions:", visibleRegions);

  const buttons = await page.locator('button').allInnerTexts();
  console.log("visible buttons:", buttons.slice(0, 20));

  const regions = await page.locator('[role="region"]').elementHandles();
  for (const r of regions) {
    const label = await r.getAttribute("aria-label");
    console.log("Region aria-label:", label);
  }

  // screenshot for debug
  const timestamp = Date.now();
  const path = `/tmp/captions-failure-${timestamp}.png`;
  await page.screenshot({ path });
  console.error(`captions could not be enabled – see ${path}`);

  // DON'T throw error - try to continue anyway, maybe captions will work
  console.warn("⚠️ Proceeding without confirmed caption UI - captions may still work");
}

// Check if captions are already enabled using multiple methods
async function captionsAlreadyEnabled(page: Page, timeout = 2000): Promise<boolean> {
  // Method 1: Check for captions region
  const captionRegionSelectors = [
    '[role="region"][aria-label*="Captions"]',
    '[aria-live="polite"]',
    '.iOzk7[aria-label*="Captions"]', // Google Meet specific class
    '[data-self-name="closed_caption_widget"]',
  ];

  for (const sel of captionRegionSelectors) {
    const region = page.locator(sel).first();
    if (await region.isVisible({ timeout: Math.min(timeout, 500) }).catch(() => false)) {
      return true;
    }
  }

  // Method 2: Check if "Turn off captions" button is visible (means captions are ON)
  const turnOffBtn = page.locator('button[aria-label*="Turn off captions"]').first();
  if (await turnOffBtn.isVisible({ timeout: Math.min(timeout, 500) }).catch(() => false)) {
    return true;
  }

  // Method 3: Check for caption text container
  const captionContainer = page.locator('.a4cQT, [data-message-text]').first();
  if (await captionContainer.isVisible({ timeout: Math.min(timeout, 500) }).catch(() => false)) {
    return true;
  }

  return false;
}
