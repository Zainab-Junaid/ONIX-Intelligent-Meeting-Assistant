/**
 * extract-caption-languages.ts
 *
 * Temporary script: Joins a Google Meet, opens the caption language dropdown,
 * extracts every language option from the DOM, and logs the array.
 *
 * Usage:
 *   MEETING_URL=https://meet.google.com/xxx-yyyy-zzz npx tsx scripts/extract-caption-languages.ts
 *
 * Requires: auth.json in project root (run `npm run gen:auth` first)
 */

import { chromium, BrowserContext } from "playwright";
import path from "path";
import fs from "fs";
import {
    clickIfVisible,
    clickJoin,
    collapsePreviewIfNeeded,
    dismissOverlays,
    waitUntilJoined,
    ensureCaptionsOn,
} from "../src/playwright/runBotDecluttered/meetingActions";
import { validateAndRefreshSession, loginIfNeeded } from "../src/playwright/runBotDecluttered/auth";

(async () => {
    const url = process.env.MEETING_URL;
    if (!url) {
        console.error("❌ Missing MEETING_URL env var");
        console.error("Usage: MEETING_URL=https://meet.google.com/xxx-yyyy-zzz npx tsx scripts/extract-caption-languages.ts");
        process.exit(1);
    }

    const authJsonPath = path.resolve(process.cwd(), "auth.json");
    if (!fs.existsSync(authJsonPath)) {
        console.error("❌ auth.json not found. Run `npm run gen:auth` first.");
        process.exit(1);
    }

    console.log("🚀 Launching browser...");
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

    const context: BrowserContext = await browser.newContext({ storageState: "auth.json" });
    const page = await context.newPage();

    // Log page console for debugging
    page.on("console", (msg) => console.log(`[page:${msg.type()}]`, msg.text()));

    // Track auth failures to auto-heal expired sessions
    let authErrorCount = 0;
    page.on("response", (res) => {
        try {
            if (res.status() === 401 && /google\.com|gstatic\.com/.test(res.url())) {
                authErrorCount++;
            }
        } catch { }
    });

    try {
        // ── Step 0: Validate & refresh session (CRITICAL - prevents 401 flood) ──
        console.log("🔐 Validating Google session...");
        await validateAndRefreshSession(page, context);
        console.log("✅ Session validated");

        // ── Step 1: Navigate to meeting ──
        console.log(`📍 Navigating to ${url}`);
        await page.goto(url, { waitUntil: "domcontentloaded" });

        // If we saw repeated 401s, refresh session and reload
        if (authErrorCount >= 2) {
            console.warn(`⚠️ Detected ${authErrorCount} auth errors — attempting re-login`);
            await loginIfNeeded(page, context);
            authErrorCount = 0;
            await page.goto(url, { waitUntil: "domcontentloaded" });
        }

        // ── Step 2: Mute mic/camera, join ──
        await clickIfVisible(page, 'button[aria-label*="Turn off microphone"]');
        await clickIfVisible(page, 'button[aria-label*="Turn off camera"]');
        await clickIfVisible(page, 'button:has-text("Got it")');

        console.log("🔗 Joining meeting...");
        await clickJoin(page);
        await collapsePreviewIfNeeded(page);
        await dismissOverlays(page);
        await waitUntilJoined(page);
        console.log("✅ Joined meeting");

        // ── Step 3: Enable captions ──
        await ensureCaptionsOn(page);
        console.log("✅ Captions enabled");

        // ── Step 4: Open caption language dropdown ──
        // Wait a moment for caption bar to fully render
        await page.waitForTimeout(2000);

        // Google Meet has a language selector button in the caption bar area.
        // It typically shows the current language (e.g., "English") with a globe icon.
        // We need to find and click it to open the language list.

        let dropdownOpened = false;

        // Strategy 1: Look for the language selector button in caption bar
        // It's typically a button near the bottom that shows the current language
        const langButtonSelectors = [
            'button[aria-label*="language"]',
            'button[aria-label*="Language"]',
            'button[aria-haspopup="listbox"]',
            'button[aria-haspopup="true"][aria-expanded]',
            // The caption bar language button often has a globe icon + language name
            '[data-panel-id] button:has-text("English")',
            'div[role="region"][aria-label*="Captions"] button',
            // Look for the settings/gear near captions area
            'button[aria-label*="caption settings"]',
            'button[aria-label*="Caption settings"]',
        ];

        for (const sel of langButtonSelectors) {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
                console.log(`🔍 Found language button with selector: ${sel}`);
                // Caption text overlay (div.iOzk7) intercepts pointer events,
                // so use force:true to click through it
                try {
                    await btn.click({ force: true, timeout: 5000 });
                } catch {
                    // Fallback: JS click bypasses all overlay issues
                    console.log("  ↳ Force click failed, trying JS click...");
                    await btn.evaluate((el: HTMLElement) => el.click());
                }
                await page.waitForTimeout(1500);
                dropdownOpened = true;
                break;
            }
        }

        // Strategy 2: If no button found, try the "More options" area near captions
        if (!dropdownOpened) {
            console.log("🔍 Trying to find language selector via bottom caption bar...");

            // Take screenshot to help debug
            await page.screenshot({ path: "/tmp/caption-bar-before-click.png" });
            console.log("📸 Screenshot saved: /tmp/caption-bar-before-click.png");

            // Google Meet sometimes shows language as a small dropdown at bottom left under captions
            // Try clicking any element that looks like a language selector
            const moreSelectors = [
                '[role="listbox"]',
                '[role="combobox"]',
                'select',
                // The globe icon button
                'button:has(span[data-icon="language"])',
                'button:has(i:has-text("language"))',
                // Material icon based
                'button:has-text("translate")',
                '.material-icons:has-text("language")',
            ];

            for (const sel of moreSelectors) {
                const el = page.locator(sel).first();
                if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
                    console.log(`🔍 Found language element with selector: ${sel}`);
                    await el.click();
                    await page.waitForTimeout(1000);
                    dropdownOpened = true;
                    break;
                }
            }
        }

        // Strategy 3: If still not opened, try keyboard navigation or all visible buttons
        if (!dropdownOpened) {
            console.log("🔍 Enumerating all buttons to find language selector...");
            const allButtons = page.locator("button");
            const count = await allButtons.count();
            console.log(`Found ${count} buttons total. Checking each...`);

            for (let i = 0; i < count; i++) {
                const btn = allButtons.nth(i);
                const ariaLabel = await btn.getAttribute("aria-label").catch(() => "");
                const text = await btn.textContent().catch(() => "");
                const isVisible = await btn.isVisible().catch(() => false);

                if (isVisible) {
                    console.log(`  Button[${i}]: aria-label="${ariaLabel}", text="${text?.trim().substring(0, 50)}"`);
                }
            }

            // Take debug screenshot
            await page.screenshot({ path: "/tmp/caption-all-buttons.png" });
            console.log("📸 Screenshot saved: /tmp/caption-all-buttons.png");
        }

        // ── Step 5: Extract language options ──
        await page.waitForTimeout(1000);

        // Screenshot after opening settings to see what we're working with
        await page.screenshot({ path: "/tmp/caption-settings-opened.png" });
        console.log("📸 Screenshot after settings click: /tmp/caption-settings-opened.png");

        // Try multiple methods to extract language options
        let languages: string[] = [];

        // Method 1: Look for listbox options (standard dropdown pattern)
        const listboxOptions = page.locator('[role="option"], [role="listbox"] [role="option"]');
        if (await listboxOptions.count() > 0) {
            languages = await listboxOptions.allTextContents();
            console.log(`\n✅ Found ${languages.length} languages via [role="option"]`);
        }

        // Method 2: Look for menu items
        if (languages.length === 0) {
            const menuItems = page.locator('[role="menuitem"], [role="menuitemradio"]');
            if (await menuItems.count() > 0) {
                languages = await menuItems.allTextContents();
                console.log(`\n✅ Found ${languages.length} languages via [role="menuitem"]`);
            }
        }

        // Method 3: Look for li items in any open dropdown/panel
        if (languages.length === 0) {
            const liItems = page.locator('[role="presentation"] li, [role="listbox"] li, ul[role="list"] li');
            if (await liItems.count() > 0) {
                languages = await liItems.allTextContents();
                console.log(`\n✅ Found ${languages.length} languages via li items`);
            }
        }

        // Method 4: Generic - any text items in a visible popup/panel
        if (languages.length === 0) {
            console.log("\n⚠️ Could not find language dropdown options via standard selectors.");
            console.log("Dumping all visible text in popup/panel areas...");

            const popups = page.locator('[role="dialog"], [role="menu"], [role="listbox"], [data-panel-id]');
            const popupCount = await popups.count();
            for (let i = 0; i < popupCount; i++) {
                const popup = popups.nth(i);
                if (await popup.isVisible().catch(() => false)) {
                    const text = await popup.textContent().catch(() => "");
                    console.log(`  Popup[${i}]: "${text?.substring(0, 500)}"`);
                }
            }

            // Method 5: Dump full page visible text and HTML for manual inspection
            console.log("\n🔎 Dumping caption settings panel HTML for manual inspection...");
            const panelHTML = await page.evaluate(() => {
                // Find any recently-opened panel/modal near bottom of page
                const panels = document.querySelectorAll('[data-panel-id], [role="dialog"], [role="menu"], [role="complementary"]');
                const results: string[] = [];
                panels.forEach(p => {
                    const el = p as HTMLElement;
                    if (el.offsetHeight > 0 && el.offsetWidth > 0) {
                        results.push(`--- Panel (${el.tagName}.${el.className.substring(0, 50)}) ---\n${el.innerHTML.substring(0, 2000)}`);
                    }
                });
                return results.join("\n\n");
            });
            console.log(panelHTML || "(no visible panels found)");
        }

        // ── Step 6: Output results ──
        // Clean up language strings (trim whitespace, remove "BETA" badges, etc.)
        const cleanedLanguages = languages
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .map(l => l.replace(/\s*BETA\s*$/i, "").trim()) // Remove trailing BETA if present
            .filter(l => l.length > 0);

        if (cleanedLanguages.length > 0) {
            console.log("\n" + "=".repeat(60));
            console.log("📋 GOOGLE MEET CAPTION LANGUAGES (extracted from DOM):");
            console.log("=".repeat(60));
            console.log(JSON.stringify(cleanedLanguages, null, 2));
            console.log("=".repeat(60));
            console.log(`Total: ${cleanedLanguages.length} languages`);
            console.log("=".repeat(60));

            // Also output as a TypeScript array for easy copy-paste
            console.log("\n// TypeScript constant (copy-paste ready):");
            console.log("export const GOOGLE_MEET_CAPTION_LANGUAGES = [");
            for (const lang of cleanedLanguages) {
                console.log(`  "${lang}",`);
            }
            console.log("] as const;");
        } else {
            console.log("\n❌ No languages extracted. Check the screenshots for debugging.");
            console.log("The Google Meet caption language UI may have changed.");
            console.log("Check /tmp/caption-*.png for screenshots.");
        }

        // Final screenshot for verification
        await page.screenshot({ path: "/tmp/caption-languages-final.png" });
        console.log("\n📸 Final screenshot saved: /tmp/caption-languages-final.png");

    } catch (err) {
        console.error("❌ Error:", err);
        await page.screenshot({ path: "/tmp/caption-languages-error.png" }).catch(() => { });
    } finally {
        // Save refreshed auth session for next runs
        try {
            await context.storageState({ path: "auth.json" });
            console.log("💾 Saved refreshed auth session to auth.json");
        } catch { }

        // Leave the meeting gracefully
        try {
            const hangUpSel = 'button[aria-label*="Leave call"], button[aria-label*="Leave meeting"]';
            if (await page.$(hangUpSel)) {
                await clickIfVisible(page, hangUpSel);
            }
        } catch { }

        await browser.close();
        console.log("\n🔚 Browser closed. Done.");
        process.exit(0);
    }
})();
