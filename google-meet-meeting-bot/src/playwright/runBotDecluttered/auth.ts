// Handles all Google authentication logic including login flows and session validation.
// Ensures the bot is authenticated before joining any meeting.

import { BrowserContext, Page } from "playwright";

// if session is invalid, perform a credentialed login and persist storage state
export async function loginIfNeeded(page: Page, context: BrowserContext) {
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
export async function validateAndRefreshSession(page: Page, context: BrowserContext) {
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
export async function performFreshLogin(page: Page, context: BrowserContext) {
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
