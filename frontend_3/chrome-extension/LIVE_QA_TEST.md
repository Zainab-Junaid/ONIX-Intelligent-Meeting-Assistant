# Testing Live Q&A in the Extension

## Prerequisites

1. **Dashboard running** – The extension calls `http://localhost:3000` for Live Q&A. Start the Onix dashboard:
   ```bash
   cd frontend_2/onix_dashboard
   npm run dev
   ```
   Leave it running (default: http://localhost:3000).

2. **Extension loaded** – In Chrome, go to `chrome://extensions/`, enable "Developer mode", click "Load unpacked", and select the folder:
   ```
   frontend_2/chrome-extension/onix_extension_v2
   ```

## Quick test (no real meeting)

1. Open the extension side panel (click the extension icon → open side panel, or pin it).
2. Sign in or use **Continue as Guest**.
3. Enter a meeting title (e.g. "Test meeting").
4. Click **Start Capture**.
5. Wait for some transcript to appear. If you're not in a real Google Meet:
   - The extension may use **Web Speech API** or **captions** from the current tab. Open a tab with speech (e.g. a YouTube video with captions) or speak into the mic so transcript lines appear.
   - Alternatively, in the side panel you can sometimes see "Using Web Speech API" or caption-based lines once the content script is active on a Meet tab.
6. When you see at least a few lines in the **transcript** area, the section **"Ask about this meeting"** should appear below it.
7. Type a question, e.g.:
   - **What's being discussed?**
   - **Who is participating?**
   - **What did [speaker name] say about [topic]?**
8. Click **Ask**. The answer should appear in the blue box below. If you see "Network error", ensure the dashboard is running at http://localhost:3000.

## Test in a real Google Meet

1. Join a Google Meet (or start one).
2. Open the extension side panel and click **Start Capture**.
3. Let the meeting run for 1–2 minutes so transcript/captions appear.
4. When transcript is visible, use **"Ask about this meeting"** with questions like:
   - What's being discussed?
   - What did the manager say about documentation?
   - Who is participating?

## Troubleshooting

| Issue | What to do |
|-------|------------|
| "Ask about this meeting" section never appears | Capture must be **on** and there must be **at least one transcript line**. Start capture and wait for speech/captions. |
| "Network error" or request fails | Start the dashboard: `cd frontend_2/onix_dashboard && npm run dev` and keep it at http://localhost:3000. |
| Empty or "No transcript available yet" answer | The transcript sent to the API was empty. Ensure the transcript area shows text before asking. |
| CORS error in console | The live-ask API allows all origins; if you still see CORS errors, hard-refresh the extension (chrome://extensions → refresh the Onix extension). |

## Dashboard URL

The extension uses **http://localhost:3000** by default. If your dashboard runs on a different port or host, you’ll need to change the `dashboardUrl` in `sidepanel.js` (search for `dashboardUrl = 'http://localhost:3000'` and update the one used for the live-ask fetch, around line 394).
