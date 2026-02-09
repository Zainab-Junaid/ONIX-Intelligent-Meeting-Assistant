// Core logic for monitoring the DOM, extracting captions, and detecting speakers.
// Handles realtime text processing and buffering for the transcription service.

import { Page } from "playwright";
import { v4 as uuidv4 } from "uuid";
import { pushFinalCaption, pushRawCaption } from "../../application/transcription/captionService";
import { Segment } from "../../domain/transcription/models";
import { LEAVE_BANNER_SEL, performLeaveCall } from "./meetingActions";

// bot will leave the meeting immediately if it hears any of the following phrases
const EXIT_PHRASES = [
    "notetaker, please leave",
    "note taker, please leave",
    "no taker please leave",
    "notetaker please leave",
].map((p) => p.toLowerCase());

export async function scrapeCaptions(
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
        if (!currentSegment) return; // Fixed: was using !currentSegment
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

    // (Bot no longer generates summary itself — the meetingProcessingWorker handles
    //  analytics, summary, and action-item generation reliably via the BullMQ pipeline.)

    // Ensure we emergency‑flush and notify backend if page/browser is closed (e.g., bot removed)
    const emergencyFlushAndNotify = async (reason: string) => {
        try {
            console.warn(`⚠️ Page/browser termination detected (${reason}) – finalizing remaining segment`);
            // Finalize any remaining active segment (pushes to Redis buffer)
            await finalizeCurrentSegment();
            console.log(`✅ Emergency finalization completed - segment pushed to Redis buffer`);
        } catch (e) {
            console.error("❌ Emergency finalization failed:", e);
        } finally {
            // Notify backend so the pipeline (flush → finalize → worker) runs
            try {
                const jobId = process.env.JOB_ID || `auto-job-${meetingId}`;
                await fetch("http://backend:3001/bot-done", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId, meetingId }),
                });
                console.log(`✅ [bot-done] Emergency notification sent for ${meetingId}`);
            } catch (notifyErr) {
                console.error(`❌ [bot-done] Emergency notification failed:`, notifyErr);
            }
        }
    };

    // Attach shutdown handlers once
    page.once("close", () => { void emergencyFlushAndNotify("page.close"); });
    page.once("crash", () => { void emergencyFlushAndNotify("page.crash"); });
    page.context().once("close", () => { void emergencyFlushAndNotify("context.close"); });
    page.context().browser()?.once("disconnected", () => { void emergencyFlushAndNotify("browser.disconnected"); });

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
                // '[aria-live="polite"]', // Too broad
                // '[aria-live="assertive"]'
            ];

            for (const sel of selectors) {
                const region = document.querySelector(sel);
                if (region && region.textContent && region.textContent.trim().length > 0) {
                    return true;
                }
            }

            // Checking generic live regions but excluding known notifications
            const liveRegions = document.querySelectorAll('[aria-live]');
            for (const region of Array.from(liveRegions)) {
                if (region.textContent && region.textContent.trim().length > 0) {
                    const text = region.textContent.trim();
                    if (!text.includes('You have joined') &&
                        !text.includes('raised a hand') &&
                        !text.includes('Press Down Arrow')) {
                        return true;
                    }
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

        // Use extracted UI interaction logic
        await performLeaveCall(page);

        console.log(`✅ Leave call completed - all segments pushed to Redis buffer`);
    };

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

    // Final cleanup: ensure any remaining segment is finalized and pushed to Redis
    await finalizeCurrentSegment();
    console.log(`✅ All segments finalized and pushed to Redis buffer for meeting ${meetingId}`);
    console.log(`📊 Total segments captured: ${finalizedSegmentCount}`);

    // CRITICAL: Notify backend FIRST — this marks the meeting COMPLETED and
    // triggers the queue-based post-meeting processing pipeline (analytics + summary + action items).
    // The worker reads from MongoDB (correct source of truth) and handles everything.
    try {
        const jobId = process.env.JOB_ID || `auto-job-${meetingId}`;
        console.log(`📤 Notifying backend about job completion...`);

        const res = await fetch("http://backend:3001/bot-done", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId, meetingId }),
        });

        if (res.ok) {
            console.log(`✅ [bot-done] Backend notification successful (${res.status})`);
        } else {
            console.error(`❌ [bot-done] Backend notification failed (${res.status})`);
        }
    } catch (err) {
        console.error(`❌ [bot-done] Backend notification failed:`, err);
    }

    console.log(`🎉 Meeting ${meetingId}: ${finalizedSegmentCount} segments captured and pushed to Redis buffer`);
    return meetingId;
}
