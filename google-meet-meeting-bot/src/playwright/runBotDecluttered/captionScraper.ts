// ─────────────────────────────────────────────────────────────────────
// captionScraper.ts — DOM-block segmentation (matches Google Meet exactly)
//
// One segment == one Google Meet caption DOM block.
// We only commit when the DOM block changes (new node). No time-based or
// silence-based rules. No delta slicing, no max duration, no dedupe.
// ─────────────────────────────────────────────────────────────────────

import { Page } from "playwright";
import { v4 as uuidv4 } from "uuid";
import { pushFinalCaption, pushRawCaption } from "../../application/transcription/captionService";
import { Segment } from "../../domain/transcription/models";
import { LEAVE_BANNER_SEL, performLeaveCall } from "./meetingActions";

const STARTUP_STABILIZATION_MS = 1000;

// Exit phrases — bot leaves immediately if any are heard
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
    const meetingStartTime = createdAt.getTime();
    let exitRequested = false;
    let finalizedSegmentCount = 0;

    // ── Node: transport only. No timers, no dedupe, no text mutation. ──
    const handleRawCaption = async (speaker: string, text: string) => {
        const now = Date.now();
        if (EXIT_PHRASES.some((p) => text.toLowerCase().includes(p))) {
            console.log("🚪 Exit phrase heard — hanging up.");
            exitRequested = true;
        }
        try {
            await pushRawCaption(meetingId, {
                meetingId,
                text,
                speaker,
                timestamp: now,
            });
        } catch (err) {
            console.error("❌ Failed to push raw caption:", err);
        }
    };

    const handleFinalCaption = async (
        speaker: string,
        text: string,
        startTimeMs: number,
        endTimeMs: number,
    ) => {
        if (!text.trim()) return;
        const startSec = Math.max(0, (startTimeMs - meetingStartTime) / 1000);
        let endSec = Math.max(startSec, (endTimeMs - meetingStartTime) / 1000);
        if (endSec - startSec < 0.1) endSec = startSec + 0.1;
        const segment: Segment = {
            segmentId: uuidv4(),
            speaker,
            text: text.trim(),
            start: Number(startSec.toFixed(3)),
            end: Number(endSec.toFixed(3)),
        };
        try {
            await pushFinalCaption(meetingId, segment, userId || undefined, meetingTitle || undefined);
            finalizedSegmentCount++;
            console.log(
                `✅ Finalized [${segment.segmentId}] ${segment.speaker}: ` +
                `"${segment.text.substring(0, 80)}${segment.text.length > 80 ? "..." : ""}" ` +
                `(${segment.start}s–${segment.end}s)`,
            );
        } catch (err) {
            console.error("❌ Failed to push final caption:", err);
        }
    };

    await page.exposeFunction("onRawCaption", handleRawCaption);
    await page.exposeFunction("onFinalCaption", handleFinalCaption);

    // ── Emergency notification on termination ──
    const emergencyNotify = async (reason: string) => {
        try {
            console.warn(`⚠️ Termination detected (${reason}) — notifying backend.`);
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
    };

    page.once("close", () => void emergencyNotify("page.close"));
    page.once("crash", () => void emergencyNotify("page.crash"));
    page.context().once("close", () => void emergencyNotify("context.close"));
    page.context().browser()?.once("disconnected", () => void emergencyNotify("browser.disconnected"));

    // ── Wait for caption region (case-insensitive) ────────────────────
    console.log("⏳ Waiting for caption region...");
    try {
        await page.waitForFunction(
            () => !!document.querySelector('div[role="region"]') &&
                Array.from(document.querySelectorAll('div[role="region"]'))
                    .some(el => (el.getAttribute("aria-label") || "").toLowerCase().includes("caption")),
            { timeout: 15000 },
        );
        console.log("✅ Caption region found.");
    } catch {
        console.log("⚠️ No caption region found within 15s — proceeding anyway.");
    }

    // ── Startup stabilization ─────────────────────────────────────────
    await page.waitForTimeout(STARTUP_STABILIZATION_MS);

    // ── Inject browser-side observer (DOM-block segmentation) ──────────
    await page.evaluate(() => {
        // ── State: one active caption block only ──
        let activeNode: HTMLElement | null = null;
        let activeSpeakerKey: string | null = null;
        let activeSpeakerName: string = "";
        let activeText: string = "";
        let activeStartTime: number = 0;

        const lastRawPush = new Map<string, number>();
        const RAW_THROTTLE_MS = 1000;
        const observedBlocks = new WeakSet<HTMLElement>();

        const commit = (speakerName: string, text: string, startTime: number) => {
            if (!text.trim()) return;
            const endTime = Date.now();
            console.log(`[onix] COMMIT ${speakerName}: "${text.substring(0, 60)}${text.length > 60 ? "…" : ""}"`);
            (window as unknown as { onFinalCaption?: (a: string, b: string, c: number, d: number) => void }).onFinalCaption?.(
                speakerName,
                text,
                startTime,
                endTime,
            );
        };

        const handleCaption = (speakerKey: string, speakerName: string, rawText: string, node: HTMLElement) => {
            const text = rawText.trim();
            if (!text) return;

            if (activeNode === null) {
                console.log(`[onix-debug] New active node started: ${speakerName}`);
                activeNode = node;
                activeSpeakerKey = speakerKey;
                activeSpeakerName = speakerName || "Speaker";
                activeText = text;
                activeStartTime = Date.now();
                const now = Date.now();
                const lastPush = lastRawPush.get(speakerKey) || 0;
                if (now - lastPush >= RAW_THROTTLE_MS) {
                    lastRawPush.set(speakerKey, now);
                    (window as unknown as { onRawCaption?: (a: string, b: string) => void }).onRawCaption?.(activeSpeakerName, activeText);
                }
                return;
            }

            if (node === activeNode) {
                activeText = text;
                const now = Date.now();
                const lastPush = lastRawPush.get(speakerKey) || 0;
                if (now - lastPush >= RAW_THROTTLE_MS) {
                    lastRawPush.set(speakerKey, now);
                    (window as unknown as { onRawCaption?: (a: string, b: string) => void }).onRawCaption?.(activeSpeakerName, activeText);
                }
                return;
            }

            // New DOM caption block
            console.log(`[onix-debug] Node mismatch - committing previous. Old: ${activeSpeakerName}, New: ${speakerName}`);
            commit(activeSpeakerName, activeText, activeStartTime);
            activeNode = node;
            activeSpeakerKey = speakerKey;
            activeSpeakerName = speakerName || "Speaker";
            activeText = text;
            activeStartTime = Date.now();
            const now = Date.now();
            const lastPush = lastRawPush.get(speakerKey) || 0;
            if (now - lastPush >= RAW_THROTTLE_MS) {
                lastRawPush.set(speakerKey, now);
                (window as unknown as { onRawCaption?: (a: string, b: string) => void }).onRawCaption?.(activeSpeakerName, activeText);
            }
        };

        // ── DOM selectors (primary + fallbacks; Google Meet changes class names often) ──
        const captionParentSels = [".nMcdL", "[data-self-name='caption_block']", "[data-message-id]", "div[jsname='dsSSge']", ".TBMuR", ".BjBvRC"];
        const captionTextSels = [".ygicle", "[data-message-text]", ".cn", ".VbkSUe"];
        const speakerSels = [".NWpY1d", ".xoMHSc", "[data-participant-name]", ".zs7s8d", ".jT5e9"];

        const findInBlock = (block: HTMLElement, sels: string[]): Element | null => {
            for (const sel of sels) {
                const el = block.querySelector(sel);
                if (el) return el;
            }
            return null;
        };

        // ── Block scanning (pass DOM block reference for node-identity segmentation) ──
        const scanBlock = (block: HTMLElement) => {
            if (observedBlocks.has(block)) return;
            observedBlocks.add(block);

            // Debug: log what we are scanning
            console.log(`[onix-debug] Scanning block: ${block.tagName}.${block.className} | Content: ${block.textContent?.substring(0, 30)}...`);

            const txtNode = findInBlock(block, captionTextSels);
            if (!txtNode) {
                const allText = block.innerText;
                console.log(`[onix-debug] No text node found with selectors. InnerText: ${allText}`);
                return;
            }

            const speakerEl = findInBlock(block, speakerSels);
            const rawName = speakerEl?.textContent?.trim() ?? "Speaker";
            const speakerName = rawName
                .replace(/\s*\(You\)\s*/gi, "")
                .replace(/\s+/g, " ")
                .replace(/:$/, "") // Remove trailing colon if present
                .trim() || "Speaker";
            const key = block.getAttribute("data-participant-id") || speakerName;

            console.log(`[onix-debug] Found text node. Speaker: ${speakerName}. Key: ${key}`);

            const push = () => {
                const raw = (txtNode as HTMLElement).textContent?.trim() ?? "";
                if (raw) handleCaption(key, speakerName, raw, block);
            };

            new MutationObserver(push).observe(txtNode, {
                childList: true,
                subtree: true,
                characterData: true,
            });
            push();
        };

        // ── Find caption region (case-insensitive) ──
        const allRegions = document.querySelectorAll('div[role="region"]');
        let region: Element | null = null;
        for (const r of Array.from(allRegions)) {
            const label = (r.getAttribute("aria-label") || "").toLowerCase();
            if (label.includes("caption")) {
                region = r;
                break;
            }
        }

        // Dump the entire region structure for debugging
        if (region) {
            console.log(`[onix-debug] Region matched: ${region.tagName}.${region.className}`);
            const children = Array.from(region.children).slice(0, 3);
            children.forEach((child, i) => {
                console.log(`[onix-debug] Region child[${i}]: ${child.tagName}.${child.className} | ${(child as HTMLElement).innerText?.substring(0, 50)}`);
            });
        }

        if (!region) {
            console.warn("[onix] Caption region not found in DOM.");
            region = document.querySelector('.a4cQT');
            if (region) console.log("[onix-debug] Found fallback region .a4cQT");
            if (!region) return;
        }

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of Array.from(m.addedNodes)) {
                    if (node instanceof HTMLElement) {
                        try {
                            // Log every added node in region for debugging
                            console.log(`[onix-debug] Mutation add: ${node.tagName}.${node.className}`);

                            // If it matches a selector, scan it
                            if (captionParentSels.some(sel => node.matches(sel)) || node.querySelector(captionTextSels.join(','))) {
                                scanBlock(node);
                            } else {
                                // Recursively check children
                                const potentialBlocks = node.querySelectorAll(captionParentSels.join(','));
                                potentialBlocks.forEach(b => scanBlock(b as HTMLElement));
                            }
                        } catch (e) {
                            console.error("[onix-debug] Error in mutation handler:", e);
                        }
                    }
                }
            }
        });

        observer.observe(region, { childList: true, subtree: true });

        // Initial scan
        let initialBlockCount = 0;
        region.querySelectorAll(captionParentSels.join(',')).forEach(b => { scanBlock(b as HTMLElement); initialBlockCount++; });

        if (initialBlockCount === 0) {
            console.log("[onix-debug] No initial blocks found with primary selectors. Trying broad scan...");
            region.querySelectorAll<HTMLElement>("div").forEach(div => {
                if (div.innerText && div.innerText.length > 5 && !observedBlocks.has(div)) {
                    if (div.querySelector(captionTextSels.join(','))) {
                        scanBlock(div);
                        initialBlockCount++;
                    }
                }
            });
        }
        console.log("[onix] Initial caption blocks found:", initialBlockCount);

        // ── Flush all: commit active segment if any ──
        const flushAll = () => {
            const entries: Array<{ speaker: string; text: string; startTime: number; endTime: number }> = [];
            if (activeText.trim()) {
                entries.push({
                    speaker: activeSpeakerName,
                    text: activeText,
                    startTime: activeStartTime,
                    endTime: Date.now(),
                });
            }
            activeNode = null;
            activeSpeakerKey = null;
            activeSpeakerName = "";
            activeText = "";
            activeStartTime = 0;
            return entries;
        };

        window.addEventListener("beforeunload", () => {
            if (activeText.trim()) {
                (window as unknown as { onFinalCaption?: (a: string, b: string, c: number, d: number) => void }).onFinalCaption?.(
                    activeSpeakerName, activeText, activeStartTime, Date.now(),
                );
            }
            activeNode = null;
            activeSpeakerKey = null;
            activeSpeakerName = "";
            activeText = "";
        });
        window.addEventListener("pagehide", () => {
            if (activeText.trim()) {
                (window as unknown as { onFinalCaption?: (a: string, b: string, c: number, d: number) => void }).onFinalCaption?.(
                    activeSpeakerName, activeText, activeStartTime, Date.now(),
                );
            }
            activeNode = null;
            activeSpeakerKey = null;
            activeSpeakerName = "";
            activeText = "";
        });

        (window as unknown as { __onixFlushAll?: () => Array<{ speaker: string; text: string; startTime: number; endTime: number }> }).
            __onixFlushAll = flushAll;

        console.log("[onix] Caption observer attached (DOM-block segmentation).");
    });

    // ── Awaitable flush: pull pending entries from browser and push them from Node ──
    const flushPendingSegments = async () => {
        try {
            const entries = await page.evaluate(() => {
                const flush = (window as unknown as { __onixFlushAll?: () => Array<{ speaker: string; text: string; startTime: number; endTime: number }> }).__onixFlushAll;
                return flush ? flush() : [];
            });
            for (const entry of entries) {
                await handleFinalCaption(entry.speaker, entry.text, entry.startTime, entry.endTime);
            }
            if (entries.length > 0) {
                console.log(`✅ Flushed ${entries.length} pending segment(s) from browser.`);
            }
        } catch {
            console.warn("⚠️ Could not flush pending segments (page may be closed).");
        }
    };

    // ── Leave call helper ────────────────────────────────────────────
    const leaveCall = async () => {
        // Flush pending segments with proper await BEFORE leaving
        await flushPendingSegments();
        console.log("🚪 Leaving call.");
        await performLeaveCall(page);
        console.log("✅ Left call.");
    };

    // ── Exit conditions ──────────────────────────────────────────────
    try {
        await Promise.race([
            (async () => {
                while (!exitRequested) await new Promise((r) => setTimeout(r, 500));
                await leaveCall();
            })(),
            page.waitForSelector(LEAVE_BANNER_SEL, { timeout: 0 }),
            new Promise((_, rej) =>
                setTimeout(() => rej(new Error("Hard timeout (100 min)")), 100 * 60 * 1000),
            ),
        ]);
    } catch (error) {
        console.warn("⚠️ Meeting ended:", error instanceof Error ? error.message : String(error));
    }

    // ── Force-flush any remaining segments from browser (awaitable) ────
    await flushPendingSegments();

    // ── Notify backend ───────────────────────────────────────────────
    try {
        const jobId = process.env.JOB_ID || `auto-job-${meetingId}`;
        console.log("📤 Notifying backend...");
        const res = await fetch("http://backend:3001/bot-done", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId, meetingId }),
        });
        console.log(
            res.ok ? `✅ [bot-done] Backend notified (${res.status})` : `❌ [bot-done] Notification failed (${res.status})`,
        );
    } catch (err) {
        console.error("❌ [bot-done] Notification failed:", err);
    }

    console.log(`🎉 Meeting ${meetingId}: ${finalizedSegmentCount} segments captured.`);
    return meetingId;
}
