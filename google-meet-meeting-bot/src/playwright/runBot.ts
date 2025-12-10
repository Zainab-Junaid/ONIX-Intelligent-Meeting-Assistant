import { BrowserContext, Page, chromium } from "playwright";
import { saveTranscriptBatch, testDatabaseConnection } from "../storage";
import { v4 as uuidv4 } from "uuid";
import { Segment } from "../models";

// bot will leave the meeting immediately if it hears any of the following phrases
const EXIT_PHRASES = [
  "notetaker, please leave",
  "note taker, please leave",
  "no taker please leave",
  "notetaker please leave",
].map((p) => p.toLowerCase());

// flush interval to save captions
const FLUSH_EVERY_MS = 1_000;

// selector used to detect the meeting has ended or bot was removed
const LEAVE_BANNER_SEL =
  'body > div[role="heading"]:has-text("You left the meeting"),' +
  'body > div[role="heading"]:has-text("You’ve left the call"),' +
  'body:has(div:has-text("You were removed")),' +
  'body:has(div:has-text("You’ve been removed")),' +
  'body:has(div:has-text("removed from the meeting"))';

// launches broswer, joins Google Meet, records captions
export async function runBot(url: string): Promise<string> {
  const meetingId = uuidv4();
  const createdAt = new Date();

  // Test database connection first
  console.log("🔍 Testing database connection...");
  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    throw new Error("Database connection failed - cannot proceed");
  }

  // Get userId and meetingTitle from environment (passed from backend)
  const userId = process.env.USER_ID;
  const meetingTitle = process.env.MEETING_TITLE;
  
  // ensures meeting always exists
  console.log(`🚀 Creating initial meeting transcript for ${meetingId}`);
  await saveTranscriptBatch(meetingId, createdAt, [], true, userId, meetingTitle);
  console.log(`✅ Initial meeting transcript created for ${meetingId}`);

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

  const context: BrowserContext = await browser.newContext({
    storageState: "auth.json",
  });
  const page = await context.newPage();

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
    } catch {}
  });

  try {
    await context.tracing.start({ screenshots: true, snapshots: true });

    // ALWAYS validate and refresh session before attempting to join meeting
    console.log("Validating session before joining meeting...");
    await validateAndRefreshSession(page, context);

    await page.goto(url, { waitUntil: "domcontentloaded" });

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
    await clickJoin(page);
    await collapsePreviewIfNeeded(page);
    await dismissOverlays(page);
    await waitUntilJoined(page);
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
    } catch {}

    await context.tracing.stop({ path: "run.zip" });
    return mid;
  } catch (err) {
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
  // exitRequested = exit condition, segments = finalized segments, activeSegments = ongoing segment for speaker
  let flushedCount = 0;
  let exitRequested = false;
  const segments: Segment[] = []; // Finalized segments ready to save
  const activeSegments = new Map<string, Segment>(); // Currently active segments per speaker
  let lastActiveSpeaker: string | null = null; // Track speaker changes
  const meetingStartTime = createdAt.getTime(); // Real meeting start time
  let lastSeenText = new Map<string, string>(); // Track last seen text per speaker to extract only new content

  // filter system msgs and UI elements
  const isNotRealCaption = (text: string) => {
    const normalized = text.toLowerCase();
    return /you left the meeting|return to home screen|leave call|feedback|audio and video|learn more|arrow_downward|jump to bottom|jump to top|you have joined|your camera is off|your microphone is off|your hand is|there is one other person|there are \d+ other people|you were removed|you've been removed|joined|has raised a hand|reactions are not being announced|press shift\+r|keep_outline|pin.*to your main screen|mic_none|you can't remotely mute|more_vert|more options|combat\.|hello\. hello\. for\./i.test(normalized) ||
           /^\s*(joined|has raised|reactions|press|keep_outline|pin|mic_none|more_vert|combat)\s*$/i.test(text.trim());
  };

  // Helper: Finalize a segment (mark as complete and move to finalized array)
  const finalizeSegment = (speaker: string, finalText?: string) => {
    const activeSeg = activeSegments.get(speaker);
    if (activeSeg) {
      // activeSeg.start and activeSeg.end are already in seconds (from currentTime calculation)
      // Just use them directly, but update end time to current if needed
      const now = Date.now();
      const currentTimeSeconds = Math.floor((now - meetingStartTime) / 1000);
      
      // Update with final text if provided
      if (finalText) {
        activeSeg.text = finalText;
      }
      
      // Finalize the segment - use existing start, update end to current time
      const finalizedSeg: Segment = {
        speaker: activeSeg.speaker,
        text: activeSeg.text,
        start: activeSeg.start, // Already in seconds
        end: Math.max(activeSeg.end, currentTimeSeconds), // Use later of current end or now
      };
      
      segments.push(finalizedSeg);
      activeSegments.delete(speaker);
      console.log(`✅ Finalized segment for ${speaker}: "${finalizedSeg.text.substring(0, 50)}${finalizedSeg.text.length > 50 ? '...' : ''}" (${finalizedSeg.start}s - ${finalizedSeg.end}s)`);
      return finalizedSeg;
    }
    return null;
  };

  // Create a closure to capture userId for the callback
  const createCaptionHandler = () => {
    return async (speaker: string, text: string) => {
      const caption = text.trim();
      if (!caption) return;

      // Filter out system messages and UI elements
      if (isNotRealCaption(caption)) {
        console.log(`🚫 Filtered system message: "${caption.substring(0, 50)}${caption.length > 50 ? '...' : ''}"`);
        return;
      }

      console.log(`🗣️ ${speaker}: ${caption}`); // Real-time logging

      // Activity tracking removed - summaries only generated when meeting ends

      const normalized = caption.toLowerCase();
      const isExit = EXIT_PHRASES.some((p) => normalized.includes(p));
      if (isExit) {
        console.log("Exit phrase heard — hanging up");
        exitRequested = true;
      }

      const now = Date.now();
      const currentTime = Math.floor((now - meetingStartTime) / 1000); // Time in seconds since meeting start

      // Check if speaker changed
      if (lastActiveSpeaker !== null && speaker !== lastActiveSpeaker) {
        // Finalize previous speaker's segment
        console.log(`🔄 Speaker changed from "${lastActiveSpeaker}" to "${speaker}" - finalizing previous segment`);
        finalizeSegment(lastActiveSpeaker);
      }

      const existing = activeSegments.get(speaker);

      if (!existing) {
        // First segment for this speaker (or new segment after speaker change)
        const seg: Segment = {
          speaker,
          text: caption, // caption is already the new text only
          start: currentTime,
          end: currentTime + 1, // Will be updated as caption grows
        };
        activeSegments.set(speaker, seg);
        console.log(`📝 New caption segment created for ${speaker} at ${currentTime}s: "${caption.substring(0, 50)}${caption.length > 50 ? '...' : ''}"`);
      } else {
        // Since we're now receiving only NEW text, we append it to the existing segment
        // But if the new text looks like a complete new sentence (starts with capital, has punctuation before), create new segment
        const looksLikeNewSentence = /^[A-Z]/.test(caption.trim()) && 
                                     (existing.text.endsWith('.') || existing.text.endsWith('!') || existing.text.endsWith('?'));
        
        if (looksLikeNewSentence && caption.length > 10) {
          // Finalize the existing segment and create a new one
          console.log(`📝 New sentence detected for ${speaker} - finalizing previous segment`);
          finalizeSegment(speaker);
          
          const newSeg: Segment = {
            speaker,
            text: caption,
            start: currentTime,
            end: currentTime + 1,
          };
          activeSegments.set(speaker, newSeg);
          console.log(`📝 New caption segment created for ${speaker} at ${currentTime}s: "${caption.substring(0, 50)}${caption.length > 50 ? '...' : ''}"`);
        } else {
          // Append new text to existing segment (same sentence continuing)
          existing.text = existing.text + (existing.text.endsWith(' ') ? '' : ' ') + caption;
          existing.end = currentTime;
          console.log(`📝 Caption updated for ${speaker}: "${existing.text.substring(0, 50)}${existing.text.length > 50 ? '...' : ''}"`);
        }
      }

      lastActiveSpeaker = speaker;

      // if exit = triggered, finalize all active segments and flush
      if (isExit) {
        console.log("🚪 Exit triggered - finalizing all active segments");
        // Finalize all remaining active segments
        const speakersToFinalize = Array.from(activeSegments.keys());
        for (const spk of speakersToFinalize) {
          finalizeSegment(spk);
        }
        await saveTranscriptBatch(meetingId, createdAt, segments, true, userId, meetingTitle);
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
      // First finalize all active segments
      const speakersToFinalize = Array.from(activeSegments.keys());
      for (const spk of speakersToFinalize) {
        finalizeSegment(spk);
      }
      
      // Then ensure all finalized segments are saved
      const remainingSegments = segments.slice(flushedCount);
      if (remainingSegments.length > 0) {
        console.log(`💾 Final flush: saving ${remainingSegments.length} remaining segments...`);
        await saveTranscriptBatch(meetingId, createdAt, remainingSegments, true, userId, meetingTitle);
        flushedCount = segments.length;
        console.log(`✅ Final segments saved to database`);
      }

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
      console.warn(`⚠️ Page/browser termination detected (${reason}) – emergency flush`);
      // Finalize all active segments first
      const speakersToFinalize = Array.from(activeSegments.keys());
      for (const spk of speakersToFinalize) {
        finalizeSegment(spk);
      }
      
      // Flush all finalized segments
      const remainingSegments = segments.slice(flushedCount);
      if (remainingSegments.length) {
        await saveTranscriptBatch(meetingId, createdAt, remainingSegments, true, userId, meetingTitle);
        flushedCount = segments.length;
        console.log(`🚨 Emergency flush completed: ${remainingSegments.length} segments saved`);
      }
    } catch (e) {
      console.error("❌ Emergency flush failed:", e);
    } finally {
      // Use the more detailed summary generation function
      await generateSummaryImmediately(meetingId, segments.length);
    }
  };

  // Attach shutdown handlers once
  page.once("close", () => { void emergencyFlushAndSummarize("page.close"); });
  page.once("crash", () => { void emergencyFlushAndSummarize("page.crash"); });
  page.context().once("close", () => { void emergencyFlushAndSummarize("context.close"); });
  page.context().browser()?.once("disconnected", () => { void emergencyFlushAndSummarize("browser.disconnected"); });

  // Wait for captions region to be available (after ensureCaptionsOn)
  console.log("Waiting for captions region to be available...");
  
  // Try multiple selectors for caption regions
  const captionSelectors = [
    '[role="region"][aria-label*="Captions"]',
    '[role="region"][aria-label*="captions"]', 
    '[aria-live="polite"]',
    '[aria-live="assertive"]',
    '.captions',
    '.caption'
  ];
  
  let captionRegion = null;
  for (const selector of captionSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      captionRegion = await page.$(selector);
      if (captionRegion) {
        console.log(`Found caption region with selector: ${selector}`);
        break;
      }
    } catch (e) {
      console.log(`Selector ${selector} not found, trying next...`);
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

  // flush finalized segments to backend periodically
  const flushTimer = setInterval(async () => {
    // Only flush finalized segments (not active ones that might still be updated)
    const segmentsToFlush = segments.slice(flushedCount);
    if (segmentsToFlush.length > 0) {
      console.log(`⏰ Timer flush: sending ${segmentsToFlush.length} finalized segments to database...`);
      await saveTranscriptBatch(meetingId, createdAt, segmentsToFlush, false, userId, meetingTitle);
      flushedCount = segments.length;
    }
  }, FLUSH_EVERY_MS);

  // removed inactivity watchdog per product requirement

  // leave call and final flush
  const leaveCall = async () => {
    // Finalize all remaining active segments before leaving
    console.log("🚪 Leaving call - finalizing all active segments");
    const speakersToFinalize = Array.from(activeSegments.keys());
    for (const spk of speakersToFinalize) {
      finalizeSegment(spk);
    }
    
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
    
    // Flush all remaining finalized segments
    const remainingSegments = segments.slice(flushedCount);
    if (remainingSegments.length > 0) {
      await saveTranscriptBatch(
        meetingId,
        createdAt,
        remainingSegments,
        true,
        userId,
        meetingTitle
      )
        .then(() => {
          flushedCount = segments.length;
          console.log(`✅ Final flush completed: ${remainingSegments.length} segments saved`);
        })
        .catch((err) => console.error("[FLUSH-after-leave] failed", err));
    }
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
    console.log("🔄 Attempting emergency flush of any remaining captions...");
    // Emergency flush in case of unexpected termination
    const emergencySegments = Array.from(activeSegments.values());
    if (emergencySegments.length > 0) {
      await saveTranscriptBatch(meetingId, createdAt, emergencySegments, true, userId, meetingTitle);
      console.log(`🚨 Emergency flush completed: ${emergencySegments.length} segments saved`);
    }
  } finally {
  // Clean up timers (removed unused variables)
  }

  // CRITICAL: Generate summary immediately when meeting ends (regardless of how it ended)
  console.log(`🎯 MEETING ENDED - Generating summary immediately for meeting ${meetingId}`);
  await generateSummaryImmediately(meetingId, segments.length);

  // final flush and cleanup
  clearInterval(flushTimer);
  // no inactivity timer to clear
  // Finalize all remaining active segments before final flush
  const speakersToFinalize = Array.from(activeSegments.keys());
  for (const spk of speakersToFinalize) {
    finalizeSegment(spk);
  }
  
  // Get all finalized segments that haven't been flushed yet
  const remainingSegments = segments.slice(flushedCount);
  const finalSegments = remainingSegments.filter(
    (seg) => !isNotRealCaption(seg.text),
  );

  console.log(`🏁 Final flush: sending ${finalSegments.length} final segments to database...`);
  console.log(`📊 Total segments captured: ${segments.length}, Active segments: ${activeSegments.size}`);
  await saveTranscriptBatch(meetingId, createdAt, finalSegments, true, userId, meetingTitle);
  console.log(`✅ Final flush completed for meeting ${meetingId}`);

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
  console.log(`🎉 Meeting ${meetingId}: ${segments.length} segments captured and stored`);
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
  } catch {}
}

// PROACTIVE session validation and refresh - runs before every meeting join
async function validateAndRefreshSession(page: Page, context: BrowserContext) {
  const email = process.env.GOOGLE_ACCOUNT_USER;
  const password = process.env.GOOGLE_ACCOUNT_PASSWORD;

  console.log("Testing session validity by accessing Google Meet home...");
  
  try {
    // Test session by going to Meet home page
    await page.goto("https://meet.google.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Check if we're redirected to login or see login prompts
    const currentUrl = page.url();
    const isRedirectedToLogin = /accounts\.google\.com/.test(currentUrl);
    const hasLoginPrompt = await page.locator('input[type="email"]').first().isVisible().catch(() => false);
    
    if (isRedirectedToLogin || hasLoginPrompt) {
      console.log("⚠️ Session appears expired or invalid");
      
      // Only attempt automated login if credentials are available
      if (!email || !password) {
        console.warn("❌ Missing GOOGLE_ACCOUNT_USER/PASSWORD - cannot perform automated login.");
        console.warn("💡 Please run 'npm run gen:auth' to manually create a valid auth.json file.");
        throw new Error("Session expired and automated login credentials not available. Run 'npm run gen:auth' to create auth.json.");
      }
      
      console.log("🔄 Attempting automated login...");
      await performFreshLogin(page, context);
    } else {
      console.log("✅ Session is valid - proceeding to meeting");
    }
    
    // Always refresh storage state after validation
    try {
      await context.storageState({ path: 'auth.json' });
      console.log('✅ Updated auth.json with current session');
    } catch {}
    
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
    try {
      await page.waitForURL((url) => !url.hostname.includes('accounts.google.com'), { timeout: 30000 });
      console.log("✅ Redirected away from login page");
    } catch (e) {
      console.log("⚠️ Still on accounts.google.com, waiting a bit longer...");
      await page.waitForTimeout(5000);
    }
    
    // Additional wait for session to be established
    await page.waitForTimeout(3000);
    
    // Verify we're logged in by checking Meet home
    console.log("🌐 Verifying login by accessing Meet home...");
    await page.goto("https://meet.google.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Check if we're still on login page
    const finalUrl = page.url();
    if (finalUrl.includes('accounts.google.com')) {
      throw new Error("Still on login page after password submission. Login may have failed or there's a challenge.");
    }
    
    console.log("✅ Successfully logged in");
    
    // Save fresh session
    try {
      await context.storageState({ path: 'auth.json' });
      console.log('✅ Fresh login completed - auth.json updated');
    } catch (error) {
      console.error('❌ Failed to save fresh session:', error);
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
  const allButtons = await page.locator("button").allTextContents();
  console.log("Visible buttons on screen:", allButtons);

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
          await nameInput.first().fill("Meeting Bot").catch(() => {});
        }
        if (await emailInput.first().isVisible().catch(() => false)) {
          if (process.env.GOOGLE_ACCOUNT_USER) {
            await emailInput.first().fill(process.env.GOOGLE_ACCOUNT_USER).catch(() => {});
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
            .catch(() => {});
        }
      }

      await clickable.scrollIntoViewIfNeeded().catch(() => {});
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
      } catch {}
    }
  }
  // last effort = press Enter
  console.warn("No join button found — pressing Enter as fallback");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}

// waits until bot is in the call/added to the call
async function waitUntilJoined(page: Page, timeoutMs = 60_000) {
  const inCall = await Promise.race([
    page.waitForSelector('button[aria-label*="Leave call"]', {
      timeout: timeoutMs,
    }),
    page.waitForSelector("text=You've been admitted", { timeout: timeoutMs }),
    page.waitForSelector("text=You’re the only one here", {
      timeout: timeoutMs,
    }),
  ]).catch(() => false);

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

  // keyboard shortcut with limited attempts
  for (let i = 0; i < 10; i++) {
    console.log(`Attempt ${i + 1}: Pressing Shift+C`);
    await page.keyboard.down("Shift");
    await page.keyboard.press("c");
    await page.keyboard.up("Shift");

    if (await captionsRegionVisible(page, 800)) {
      console.log("Captions enabled via Shift+C");
      return;
    }

    // are captions already on
    const ccOffBtn = page.locator('button[aria-label*="Turn off captions"]');
    if (await ccOffBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log("Captions are already ON (confirmed by CC button state)");
      return;
    }

    await page.waitForTimeout(600);
  }

  // fallback, click "Turn on captions" button
  console.log(' Falling back to clicking "Turn on captions" button...');
  await page.mouse.move(500, 700);
  await page.waitForTimeout(300);

  const ccButton = page.locator('button[aria-label*="Turn on captions"]');
  try {
    await ccButton.waitFor({ state: "visible", timeout: 4000 });
    await ccButton.click();
    if (await captionsRegionVisible(page, 5000)) {
      console.log("captions enabled via CC button fallback");
      return;
    }
  } catch {
    console.warn("CC button fallback failed");
  }

  // debug info if captions aren't on
  const visibleRegions = await page
    .locator('[role="region"]')
    .allTextContents();
  console.log("visible regions:", visibleRegions);

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
  throw new Error("could not enable captions using Shift+C or button");
}
