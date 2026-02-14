// Manages all direct interactions with the Google Meet UI (buttons, menus, etc.).
// Handles joining, leaving, and toggling settings like captions.

import { Page } from "playwright";

// selector used to detect the meeting has ended or bot was removed
export const LEAVE_BANNER_SEL =
    'body > div[role="heading"]:has-text("You left the meeting"),' +
    'body > div[role="heading"]:has-text("You’ve left the call"),' +
    'body:has(div:has-text("You were removed")),' +
    'body:has(div:has-text("You’ve been removed")),' +
    'body:has(div:has-text("removed from the meeting"))';

// click visible element by selector, true if successful
export async function clickIfVisible(page: Page, selector: string, timeout = 5000) {
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
export async function clickJoin(page: Page): Promise<void> {
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
export async function waitUntilJoined(page: Page, timeoutMs = 60_000) {
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
export async function collapsePreviewIfNeeded(page: Page) {
    const previewJoin = page.getByRole("button", { name: /join now/i }).nth(1);
    if (await previewJoin.isVisible({ timeout: 3000 })) {
        await previewJoin.click();
        console.log("clicked 2‑step Join");
    }
}

// dismiss modals like "Continue" using click/escape
export async function dismissOverlays(page: Page) {
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
export async function captionsRegionVisible(page: Page, t = 4000): Promise<boolean> {
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
export async function ensureCaptionsOn(page: Page, timeoutMs = 60_000) {
    console.log(" Waiting for UI to stabilize after join...");
    await page.waitForTimeout(2000);

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

    // Strategy 2: Try keyboard shortcuts with limited attempts
    // Google Meet uses 'c' OR 'Shift+C' for caption toggle
    console.log("⌨️ Trying keyboard shortcuts to enable captions...");

    // Try 'c' key first (simpler shortcut)
    for (let i = 0; i < 3; i++) {
        console.log(`Attempt ${i + 1}: Pressing 'c' key`);
        await page.keyboard.press("c");
        await page.waitForTimeout(800);

        if (await captionsAlreadyEnabled(page, 800)) {
            console.log("✅ Captions enabled via 'c' key");
            return;
        }
    }

    // Try Shift+C as fallback
    for (let i = 0; i < 3; i++) {
        console.log(`Attempt ${i + 1}: Pressing Shift+C`);
        await page.keyboard.down("Shift");
        await page.keyboard.press("c");
        await page.keyboard.up("Shift");
        await page.waitForTimeout(1500);

        if (await captionsAlreadyEnabled(page, 1500)) {
            console.log("✅ Captions enabled via Shift+C");
            return;
        }
    }

    // Strategy 3: Try direct CC button click
    console.log('🖱️ Trying direct CC button click...');
    // Move mouse to bottom of screen to trigger control bar to appear
    const viewport = page.viewportSize() || { width: 1280, height: 720 };
    await page.mouse.move(viewport.width / 2, viewport.height - 50);
    await page.waitForTimeout(800);

    // Look for buttons with these selectors (ordered by reliability)
    const ccButtonSelectors = [
        'button[aria-label*="Turn on captions"]',
        'button[aria-label*="captions" i]:not([aria-label*="Turn off"])',
        'button:has-text("closed_caption_off")',  // Material icon when captions are OFF
        'button:has-text("Turn on captions")',
        'button[data-tooltip*="captions" i]',
        '[data-tooltip*="captions" i]',
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
// CRITICAL: Avoid false positives from notification areas that look like caption regions
export async function captionsAlreadyEnabled(page: Page, timeout = 2000): Promise<boolean> {
    // MOST RELIABLE: Check if "Turn off captions" button is visible (means captions are ON)
    // This is definitive - if you can turn OFF captions, they are definitely ON
    const turnOffBtn = page.locator('button[aria-label*="Turn off captions"]').first();
    if (await turnOffBtn.isVisible({ timeout: Math.min(timeout, 500) }).catch(() => false)) {
        console.log("✅ Captions confirmed ON: 'Turn off captions' button is visible");
        return true;
    }

    // Check the CC button state in the control bar - look for the toggle state
    // When captions are ON, the button text shows "Turn off captions" not "Turn on captions"
    const ccButtonOn = page.locator('button[aria-label*="caption"]:not([aria-label*="Turn on"])').first();
    const ccButtonText = await ccButtonOn.getAttribute('aria-label').catch(() => null);
    if (ccButtonText && ccButtonText.toLowerCase().includes('turn off')) {
        console.log("✅ Captions confirmed ON: CC button aria-label indicates captions are on");
        return true;
    }

    // Check for actual caption text container with REAL caption content
    // Only consider it "on" if there's actual speaker-style content (not notifications)
    const captionRegionSelectors = [
        '[role="region"][aria-label*="Captions"]',
        '.iOzk7[aria-label*="Captions"]', // Google Meet specific class
        '[data-self-name="closed_caption_widget"]',
    ];

    for (const sel of captionRegionSelectors) {
        const region = page.locator(sel).first();
        if (await region.isVisible({ timeout: Math.min(timeout, 300) }).catch(() => false)) {
            // Verify this is actually a captions region, not a notification
            const text = await region.textContent().catch(() => '') || '';
            // Reject if it looks like system notifications
            if (text.includes('You have joined') ||
                text.includes('Your camera') ||
                text.includes('Your microphone') ||
                text.includes('Press Down Arrow') ||
                text.includes('raised a hand')) {
                console.log(`⚠️ Rejecting false positive: region "${sel}" contains notification text`);
                continue; // This is a notification, not captions
            }
            console.log(`✅ Captions confirmed ON: Found caption region with selector "${sel}"`);
            return true;
        }
    }

    // Method: Check for caption text container (Google Meet specific)
    const captionContainer = page.locator('.a4cQT, [data-message-text]').first();
    if (await captionContainer.isVisible({ timeout: Math.min(timeout, 300) }).catch(() => false)) {
        console.log("✅ Captions confirmed ON: Caption text container found");
        return true;
    }

    // If none of the above succeeded, captions are NOT confirmed on
    console.log("⚠️ Captions NOT confirmed on - will attempt to enable");
    return false;
}

// Perform the actual action of clicking the leave button
export async function performLeaveCall(page: Page) {
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
}

/**
 * Select a specific caption language in Google Meet.
 * Should be called AFTER ensureCaptionsOn() has enabled captions.
 *
 * Reads CAPTIONS_LANGUAGE from env (defaults to "English").
 * If already English (default), skips entirely.
 */
export async function selectCaptionLanguage(page: Page): Promise<void> {
    const targetLang = process.env.CAPTIONS_LANGUAGE || "English";

    // Skip if default language — captions default to English
    if (targetLang === "English") {
        console.log("🌍 Caption language is English (default) — skipping selection");
        return;
    }

    console.log(`🌍 Selecting caption language: "${targetLang}"`);

    try {
        // Step 1: Find and open caption settings
        // Try multiple strategies since the aria-label varies
        const settingsSelectors = [
            'button[aria-label*="Caption settings"]',   // Capital C
            'button[aria-label*="caption settings"]',   // lowercase
            'button[aria-label*="Captions settings"]',  // plural
            'button[aria-label*="captions settings"]',
        ];

        let settingsClicked = false;

        for (const sel of settingsSelectors) {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
                console.log(`  ✅ Found settings button: "${sel}"`);
                try {
                    await btn.click({ force: true, timeout: 3000 });
                } catch {
                    await btn.evaluate((el: HTMLElement) => el.click());
                }
                settingsClicked = true;
                break;
            }
        }

        // Fallback: DOM-based discovery
        if (!settingsClicked) {
            console.log("  🔍 Selectors failed — trying DOM-based discovery...");
            settingsClicked = await page.evaluate(() => {
                // Scan ALL buttons for anything caption/settings related
                const buttons = Array.from(document.querySelectorAll('button'));
                for (const btn of buttons) {
                    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const tooltip = (btn.getAttribute('data-tooltip') || '').toLowerCase();
                    if (
                        (label.includes('caption') && label.includes('setting')) ||
                        (tooltip.includes('caption') && tooltip.includes('setting')) ||
                        // Google Meet uses a gear icon next to captions
                        (label.includes('caption') && btn.querySelector('i, .google-material-icons, [class*="icon"]'))
                    ) {
                        console.log(`[selectLang] DOM discovery hit: label="${label}" tooltip="${tooltip}"`);
                        btn.click();
                        return true;
                    }
                }
                // Also look for any settings button inside the caption region
                const captionRegion = document.querySelector('[role="region"][aria-label*="Caption"], [role="region"][aria-label*="caption"]');
                if (captionRegion) {
                    const regionBtns = captionRegion.querySelectorAll('button');
                    for (const btn of Array.from(regionBtns)) {
                        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                        if (label.includes('setting') || label.includes('option') || label.includes('language')) {
                            console.log(`[selectLang] Caption region button: label="${label}"`);
                            btn.click();
                            return true;
                        }
                    }
                }
                console.log('[selectLang] DOM discovery failed — no caption settings button found');
                return false;
            });
        }

        if (!settingsClicked) {
            console.warn("⚠️ Caption settings button not found — cannot change language");
            // Take debug screenshot
            await page.screenshot({ path: `/tmp/lang-selection-fail-${Date.now()}.png` });
            return;
        }

        await page.waitForTimeout(1000);
        console.log("  ✅ Caption settings panel opened");

        // Step 2: Expand language dropdown if needed
        let optionsVisible = false;

        const existingOptions = page.locator('[role="option"]');
        const existingCount = await existingOptions.count().catch(() => 0);
        console.log(`  📊 Found ${existingCount} [role="option"] elements initially`);

        if (existingCount > 5) {
            optionsVisible = true;
        } else {
            console.log("  🔍 Looking for language dropdown to expand...");

            const dropdownSelectors = [
                '[role="combobox"]',
                '[role="listbox"]',
                '[aria-haspopup="listbox"]',
                'button[aria-haspopup="listbox"]',
                'button[aria-expanded="false"]',
                '[data-panel-id] button',
                'div[role="dialog"] button',
                'div[role="dialog"] [role="combobox"]',
            ];

            for (const sel of dropdownSelectors) {
                const dropdown = page.locator(sel).first();
                if (await dropdown.isVisible({ timeout: 800 }).catch(() => false)) {
                    const text = await dropdown.textContent().catch(() => "");
                    console.log(`  🔍 Found dropdown: sel="${sel}", text="${text?.trim()?.substring(0, 40)}"`);

                    try {
                        await dropdown.click({ force: true, timeout: 2000 });
                    } catch {
                        await dropdown.evaluate((el: HTMLElement) => el.click());
                    }
                    await page.waitForTimeout(800);

                    const newCount = await existingOptions.count().catch(() => 0);
                    console.log(`  📊 After clicking "${sel}": ${newCount} [role="option"] elements`);
                    if (newCount > 5) {
                        optionsVisible = true;
                        break;
                    }
                }
            }
        }

        if (!optionsVisible) {
            const allRoles = await page.evaluate(() => {
                const elems = document.querySelectorAll('[role]');
                return Array.from(elems).slice(0, 30).map(e => ({
                    role: e.getAttribute('role'),
                    text: (e as HTMLElement).innerText?.substring(0, 50),
                    visible: (e as HTMLElement).offsetHeight > 0,
                }));
            });
            console.log("  🔍 Visible role elements:", JSON.stringify(allRoles.filter(e => e.visible), null, 2));
        }

        // Step 3: Find and click the target language
        const result = await page.evaluate((targetLanguage) => {
            const allOptions = Array.from(document.querySelectorAll('[role="option"]'));

            const firstFive = allOptions.slice(0, 5).map(o => (o as HTMLElement).innerText.trim());
            const lastFive = allOptions.slice(-5).map(o => (o as HTMLElement).innerText.trim());
            console.log(`[selectLang] First 5 options: ${JSON.stringify(firstFive)}`);
            console.log(`[selectLang] Last 5 options: ${JSON.stringify(lastFive)}`);

            // Strategy A: exact match
            for (const opt of allOptions) {
                const text = (opt as HTMLElement).innerText.trim();
                if (text === targetLanguage) {
                    (opt as HTMLElement).click();
                    return { success: true, matched: text, strategy: "exact" };
                }
            }

            // Strategy B: includes match
            for (const opt of allOptions) {
                const text = (opt as HTMLElement).innerText.trim();
                if (text.includes(targetLanguage) || targetLanguage.includes(text)) {
                    (opt as HTMLElement).click();
                    return { success: true, matched: text, strategy: "includes" };
                }
            }

            // Strategy C: normalize unicode and compare
            const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
            const normalizedTarget = normalize(targetLanguage);
            for (const opt of allOptions) {
                const text = normalize((opt as HTMLElement).innerText);
                if (text === normalizedTarget) {
                    (opt as HTMLElement).click();
                    return { success: true, matched: (opt as HTMLElement).innerText.trim(), strategy: "normalized" };
                }
            }

            return { success: false, matched: null, strategy: "none", totalOptions: allOptions.length };
        }, targetLang);

        if (result.success) {
            console.log(`✅ Caption language set to: "${result.matched}" (strategy: ${result.strategy})`);
        } else {
            console.warn(`⚠️ Language "${targetLang}" not found among ${result.totalOptions} options — falling back to English`);
        }

        await page.waitForTimeout(300);

        // Step 4: Close the settings panel if still open
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);

    } catch (err) {
        console.error(`❌ Failed to set caption language to "${targetLang}":`, err);
    }
}

