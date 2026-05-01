/**
 * @file runBot.ts
 * @description
 * This file acts as the main orchestrator for the Google Meet bot. It ties together
 * the modular components (Auth, Meeting Actions, Caption Scraper) to perform the full
 * meeting recording workflow:
 * 1. Launches a headless Chromium browser.
 * 2. Authenticates with Google (using cached session or fresh login).
 * 3. Joins the specified Google Meet URL.
 * 4. Enables captions and starts scraping them in real-time.
 * 5. Manages the bot's lifecycle until the meeting ends.
 *
 * @problems
 * 1. DOM Dependency: This bot relies heavily on specific DOM selectors (class names, aria-labels)
 *    which Google can change at any time, breaking functionality.
 * 2. Authentication Fragility: Automated Google login is difficult and can be blocked by security checks
 *    (CAPTCHAs, phone verification). We rely on a cached `auth.json` to mitigate this.
 * 3. Detection Risk: Google Meet may detect and block automated browsers. We use undetected-chromedriver
 *    techniques (though here via standard Playwright) to try and avoid this.
 * 4. Heavy Resource Usage: Running a full headless browser for every meeting is resource-intensive.
 */

import { BrowserContext, chromium } from "playwright";
import fs from "fs";
import path from "path";
import { validateAndRefreshSession, loginIfNeeded } from "./runBotDecluttered/auth";
import {
  clickIfVisible,
  clickJoin,
  collapsePreviewIfNeeded,
  dismissOverlays,
  waitUntilJoined,
  ensureCaptionsOn,
  selectCaptionLanguage,
} from "./runBotDecluttered/meetingActions";
import { scrapeCaptions } from "./runBotDecluttered/captionScraper";
import { getVideoLaunchArgs } from "../config/videoConfig";

// selector used to detect the meeting has ended or bot was removed
const LEAVE_BANNER_SEL =
  'body > div[role="heading"]:has-text("You left the meeting"),' +
  'body > div[role="heading"]:has-text("You’ve left the call"),' +
  'body > div[role="heading"]:has-text("You’ve left the meeting"),' +
  'body:has(div:has-text("You were removed")),' +
  'body:has(div:has-text("You’ve been removed")),' +
  'body:has(div:has-text("removed from the meeting")),' +
  'body:has(div:has-text("The host ended this call for everyone")),' +
  'body:has(div:has-text("The meeting has ended")),' +
  'body:has(div:has-text("This call has ended")),' +
  'body:has(div:has-text("Host has ended the meeting"))';

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



  // ... (inside runBot function)

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
      ...getVideoLaunchArgs(), // Inject custom video or default fake device source
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

    // mute mic, turn off camera (removed), clear popup
    await clickIfVisible(page, 'button[aria-label*="Turn off microphone"]');
    // await clickIfVisible(page, 'button[aria-label*="Turn off camera"]'); // KEEP CAMERA ON for Orb Video
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

    // select user-chosen caption language (reads CAPTIONS_LANGUAGE env)
    await selectCaptionLanguage(page);
    console.log("caption language configured");

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
