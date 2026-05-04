// ─────────────────────────────────────────────────────────────────────
// captionScraper.ts — Clean Rewrite (Incremental Diff Architecture)
//
// Google Meet updates captions IN-PLACE like a growing buffer.
// We track per-speaker text and only emit the NEW portion (delta).
//
// Browser-side: incremental diff + sentence accumulation
// Node-side:    finalization (silence / punctuation) + Redis push
// ─────────────────────────────────────────────────────────────────────

import { Page } from "playwright";
import { v4 as uuidv4 } from "uuid";
import { pushFinalCaption, pushRawCaption } from "../../application/transcription/captionService";
import { Segment } from "../../domain/transcription/models";
import { LEAVE_BANNER_SEL, performLeaveCall } from "./meetingActions";

// Exit phrases — bot leaves immediately if any are heard
const EXIT_PHRASES = [
    "notetaker, please leave",
    "note taker, please leave",
    "no taker please leave",
    "notetaker please leave",
].map((p) => p.toLowerCase());

// Unicode punctuation that signals end-of-sentence (language-agnostic)
const SENTENCE_END_RE = /[.!?۔؟؛。！？]\s*$/;

// Silence threshold before auto-finalizing a segment
const SILENCE_MS = 1500;

export async function scrapeCaptions(
    page: Page,
    meetingId: string,
    createdAt: Date,
): Promise<string> {
    const userId = process.env.USER_ID;
    const meetingTitle = process.env.MEETING_TITLE;
    const meetingStartTime = createdAt.getTime();

    // ── Node-side state ──────────────────────────────────────────────
    let exitRequested = false;
    let finalizedSegmentCount = 0;

    // Current segment being accumulated (one at a time)
    type ActiveSegment = {
        segmentId: string;
        speaker: string;
        text: string;        // Accumulated full sentence
        startMs: number;
        lastUpdateMs: number;
    };
    let activeSegment: ActiveSegment | null = null;
    let silenceTimer: NodeJS.Timeout | null = null;

    // ── Finalize: push accumulated sentence to Redis ─────────────────
    const finalizeSegment = async () => {
        if (!activeSegment || !activeSegment.text.trim()) return;

        const startSec = Math.max(0, (activeSegment.startMs - meetingStartTime) / 1000);
        let endSec = Math.max(startSec, (activeSegment.lastUpdateMs - meetingStartTime) / 1000);
        if (endSec - startSec < 0.1) endSec = startSec + 0.1;

        const segment: Segment = {
            segmentId: activeSegment.segmentId,
            speaker: activeSegment.speaker,
            text: activeSegment.text.trim(),
            start: Number(startSec.toFixed(3)),
            end: Number(endSec.toFixed(3)),
        };

        try {
            await pushFinalCaption(meetingId, segment, userId || undefined, meetingTitle || undefined);
            finalizedSegmentCount++;
            console.log(
                `✅ Finalized [${segment.segmentId}] ${segment.speaker}: ` +
                `"${segment.text.substring(0, 80)}${segment.text.length > 80 ? "..." : ""}" ` +
                `(${segment.start}s–${segment.end}s)`
            );
        } catch (err) {
            console.error("❌ Failed to push final caption:", err);
        } finally {
            activeSegment = null;
        }
    };

    // ── Silence watchdog ─────────────────────────────────────────────
    const resetSilenceTimer = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
            if (activeSegment) {
                console.log(`🤫 Silence > ${SILENCE_MS}ms — finalizing segment.`);
                void finalizeSegment();
            }
        }, SILENCE_MS);
    };

    // ── Handler called by browser-side for each delta ─────────────
    const handleDelta = async (speaker: string, delta: string, fullSentence: string) => {
        if (!delta.trim()) return;

        const now = Date.now();

        // Push raw delta for live streaming / debugging
        try {
            await pushRawCaption(meetingId, {
                meetingId,
                text: delta,
                speaker,
                timestamp: now,
            });
        } catch (err) {
            console.error("❌ Failed to push raw caption:", err);
        }

        // Exit phrase detection
        const normalizedFull = fullSentence.toLowerCase();
        if (EXIT_PHRASES.some((p) => normalizedFull.includes(p))) {
            console.log("🚪 Exit phrase heard — hanging up.");
            exitRequested = true;
        }

        // Speaker change → finalize previous segment
        if (activeSegment && activeSegment.speaker !== speaker) {
            console.log(`🔄 Speaker changed: "${activeSegment.speaker}" → "${speaker}" — finalizing.`);
            await finalizeSegment();
        }

        // Start new segment or update existing
        if (!activeSegment) {
            activeSegment = {
                segmentId: uuidv4(),
                speaker,
                text: fullSentence,
                startMs: now,
                lastUpdateMs: now,
            };
            console.log(`📝 New segment [${activeSegment.segmentId}] ${speaker}: "${fullSentence.substring(0, 80)}"`);
        } else {
            // Use the full sentence from browser (already accumulated correctly)
            activeSegment.text = fullSentence;
            activeSegment.lastUpdateMs = now;
        }

        // Check for sentence-ending punctuation → finalize
        if (SENTENCE_END_RE.test(fullSentence) && fullSentence.trim().length > 10) {
            console.log("✒️ Sentence-ending punctuation — finalizing.");
            await finalizeSegment();
        }

        resetSilenceTimer();

        // Handle exit
        if (exitRequested) {
            await finalizeSegment();
        }
    };

    // ── Expose handler to browser context ────────────────────────────
    await page.exposeFunction("onCaptionDelta", handleDelta);

    // ── Emergency flush on page/browser termination ──────────────────
    const emergencyFlush = async (reason: string) => {
        try {
            console.warn(`⚠️ Termination detected (${reason}) — emergency finalization.`);
            await finalizeSegment();
        } catch (e) {
            console.error("❌ Emergency finalization failed:", e);
        } finally {
            try {
                const jobId = process.env.JOB_ID || `auto-job-${meetingId}`;
                await fetch("http://backend:3001/bot-done", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId, meetingId }),
                });
                console.log(`✅ [bot-done] Emergency notification sent for ${meetingId}`);
            } catch (err) {
                console.error("❌ [bot-done] Emergency notification failed:", err);
            }
        }
    };

    page.once("close", () => void emergencyFlush("page.close"));
    page.once("crash", () => void emergencyFlush("page.crash"));
    page.context().once("close", () => void emergencyFlush("context.close"));
    page.context().browser()?.once("disconnected", () => void emergencyFlush("browser.disconnected"));

    // ── Wait for caption region to appear ─────────────────────────────
    console.log("⏳ Waiting for caption region...");
    try {
        await page.waitForSelector(
            '[role="region"][aria-label*="Captions"], [role="region"][aria-label*="captions"]',
            { timeout: 15000, state: "attached" }
        );
        console.log("✅ Caption region found.");
    } catch {
        console.log("⚠️ No caption region found within 15s — proceeding anyway.");
    }

    // ── Inject browser-side observer ──────────────────────────────────
    await page.evaluate(() => {
        // ── Browser-side state (single source of truth) ──────────────
        const lastTextBySpeaker = new Map<string, string>();
        const sentenceBufferBySpeaker = new Map<string, string>();
        let lastSpeaker = "Unknown Speaker";

        // ── Structural filtering: only scrape nodes with a speaker badge ──
        const getSpeaker = (node: HTMLElement): string | null => {
            // Try stable selectors first, then class-based fallback
            const badge =
                node.querySelector<HTMLElement>("[data-speaker-name]") ||
                node.querySelector<HTMLElement>('[role="heading"]') ||
                node.querySelector<HTMLElement>(".NWpY1d, .xoMHSc, .speaker-name");

            const name = badge?.textContent?.trim();
            if (name && name.length > 0) {
                lastSpeaker = name;
                return name;
            }

            // If same bubble continues without badge, use last known speaker
            // But ONLY if this node is inside a caption region
            if (node.closest('[role="region"][aria-label*="Captions"], [role="region"][aria-label*="captions"]')) {
                return lastSpeaker;
            }

            return null; // Not a caption node → skip
        };

        // ── Extract text without speaker badge ──
        const getText = (node: HTMLElement): string => {
            const clone = node.cloneNode(true) as HTMLElement;
            // Remove speaker badge elements from clone
            clone.querySelectorAll<HTMLElement>(
                ".NWpY1d, .xoMHSc, [data-speaker-name], .speaker-name"
            ).forEach((el) => el.remove());
            return clone.textContent?.trim() ?? "";
        };

        // ── Core: incremental diff logic ──
        const handleCaption = (speaker: string, fullText: string) => {
            if (!fullText || !speaker) return;

            const prev = lastTextBySpeaker.get(speaker) || "";

            // Guard: no change
            if (fullText === prev) return;

            let delta: string;

            if (prev && fullText.startsWith(prev)) {
                // Caption growth — extract only the new portion
                delta = fullText.slice(prev.length);
                if (!delta.trim()) return; // Whitespace-only addition
            } else {
                // Correction or new sentence — send full text, reset buffer
                delta = fullText;
                sentenceBufferBySpeaker.set(speaker, "");
            }

            // Update tracking
            lastTextBySpeaker.set(speaker, fullText);

            // Accumulate into sentence buffer
            const currentBuffer = sentenceBufferBySpeaker.get(speaker) || "";
            const newBuffer = (currentBuffer + " " + delta).trim();
            sentenceBufferBySpeaker.set(speaker, newBuffer);

            // Send to Node-side handler: (speaker, delta, fullSentence)
            // @ts-expect-error — exposed function
            window.onCaptionDelta?.(speaker, delta, newBuffer);
        };

        // ── Process a DOM node ──
        const processNode = (node: HTMLElement) => {
            const speaker = getSpeaker(node);
            if (!speaker) return; // Structural filter: no speaker = not a caption

            const text = getText(node);
            if (!text || text.length < 2) return;

            handleCaption(speaker, text);
        };

        // ── Set up MutationObserver ──
        const captionRegion = document.querySelector(
            '[role="region"][aria-label*="Captions"], [role="region"][aria-label*="captions"]'
        );

        const observeTarget = captionRegion || document.body;

        new MutationObserver((mutations) => {
            for (const m of mutations) {
                // New nodes added
                for (const n of Array.from(m.addedNodes)) {
                    if (n instanceof HTMLElement) {
                        processNode(n);
                    }
                }

                // Text content changes in existing elements
                if (
                    m.type === "characterData" &&
                    m.target?.parentElement instanceof HTMLElement
                ) {
                    const parent = m.target.parentElement;
                    // Only process if inside the caption region
                    if (parent.closest('[role="region"][aria-label*="Captions"], [role="region"][aria-label*="captions"]')) {
                        processNode(parent);
                    }
                }
            }
        }).observe(observeTarget, {
            childList: true,
            characterData: true,
            subtree: true,
        });

        console.log("✅ Caption observer (incremental diff) set up.");
    });

    // ── Leave call helper ────────────────────────────────────────────
    const leaveCall = async () => {
        console.log("🚪 Leaving call — finalizing remaining segment.");
        await finalizeSegment();
        await performLeaveCall(page);
        console.log("✅ Left call. All segments pushed to Redis.");
    };

    // ── Exit conditions: exit phrase, leave banner, hard timeout ─────
    try {
        await Promise.race([
            // Exit phrase detected
            (async () => {
                while (!exitRequested) await new Promise((r) => setTimeout(r, 500));
                await leaveCall();
            })(),
            // Leave banner appeared (everyone left / removed)
            page.waitForSelector(LEAVE_BANNER_SEL, { timeout: 0 }),
            // Hard timeout: 100 minutes
            new Promise((_, rej) =>
                setTimeout(() => rej(new Error("Hard timeout (100 min)")), 100 * 60 * 1000)
            ),
        ]);
    } catch (error) {
        console.warn("⚠️ Meeting ended:", error instanceof Error ? error.message : String(error));
        await finalizeSegment();
    } finally {
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
    }

    // ── Final cleanup ────────────────────────────────────────────────
    await finalizeSegment();
    console.log(`✅ All segments finalized. Total: ${finalizedSegmentCount}`);

    // Notify backend → triggers post-meeting pipeline
    try {
        const jobId = process.env.JOB_ID || `auto-job-${meetingId}`;
        console.log("📤 Notifying backend...");
        const res = await fetch("http://backend:3001/bot-done", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId, meetingId }),
        });
        console.log(res.ok
            ? `✅ [bot-done] Backend notified (${res.status})`
            : `❌ [bot-done] Notification failed (${res.status})`
        );
    } catch (err) {
        console.error("❌ [bot-done] Notification failed:", err);
    }

    console.log(`🎉 Meeting ${meetingId}: ${finalizedSegmentCount} segments captured.`);
    return meetingId;
}


