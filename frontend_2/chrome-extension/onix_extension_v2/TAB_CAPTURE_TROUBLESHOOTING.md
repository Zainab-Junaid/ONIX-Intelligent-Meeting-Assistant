# Tab Capture Troubleshooting Guide

## ✅ Tab Capture IS Implemented

Tab capture functionality is **fully implemented** in:
- `background.js` - `captureTabAudio()` function
- `content.js` - `startTabCapture()` and `processTabAudioStream()` functions
- `manifest.json` - `"tabCapture"` permission declared
- `sidepanel.js` - Triggers capture from user button click

## 🔍 How to Verify Tab Capture is Working

### Success Indicators:
1. ✅ Console shows: `✅ TAB CAPTURE SUCCESS!`
2. ✅ Console shows: `Stream ID: [some-id]`
3. ✅ Console shows: `✅ Tab audio stream obtained - this is MEETING AUDIO`
4. ✅ Transcription captures **ALL participants** (not just your voice)

### Failure Indicators:
1. ❌ Console shows: `⚠️ Tab capture failed`
2. ❌ Console shows: `⚠️ Falling back to microphone`
3. ❌ Only YOUR voice is transcribed (not other participants)

## 🐛 Common Failure Reasons & Fixes

### 1. "Extension has not been invoked" Error

**Error Message:**
```
Extension has not been invoked for the current page (see activeTab permission)
```

**Cause:**
- Tab capture requires a **user gesture** (button click)
- Extension must be invoked by user action

**Fix:**
1. ✅ Click the extension icon to open sidepanel
2. ✅ Click "Start Capture" button in sidepanel
3. ❌ Don't trigger from content script automatically

**Why:** Chrome requires user interaction for security (prevents malicious extensions from secretly capturing tabs)

---

### 2. "getMediaStreamId is not a function" Error

**Error Message:**
```
chrome.tabCapture.getMediaStreamId is not a function
```

**Cause:**
- Extension was reloaded, but `tabCapture` permission wasn't re-activated
- Chrome requires extension to be **removed and re-added** (not just reloaded)

**Fix:**
1. Go to `chrome://extensions/`
2. Find "Onix Meeting Assistant"
3. Click **"Remove"** (not just reload)
4. Click **"Load unpacked"**
5. Select: `frontend/chrome-extension/onix_extension_v2`
6. **Grant permissions** when prompted
7. Try again

**Why:** Chrome only activates certain permissions when extension is first installed, not on reload

---

### 3. Tab Not Active

**Error Message:**
```
Tab capture failed: Tab must be active
```

**Cause:**
- Tab capture requires the target tab to be active/visible
- Tab might be in background or minimized

**Fix:**
- The code automatically activates the tab (line 51 in background.js)
- Make sure the meeting tab is visible and not minimized
- Try clicking on the meeting tab before starting capture

---

### 4. Not a Meeting Page

**Error Message:**
```
Please navigate to a Google Meet or Zoom meeting page first
```

**Cause:**
- Current URL doesn't match meeting patterns:
  - `https://meet.google.com/*`
  - `https://*.zoom.us/*`

**Fix:**
- Make sure you're on an actual Google Meet or Zoom meeting page
- Check the URL in address bar
- Join the meeting first, then start capture

---

### 5. Chrome Internal Pages

**Error Message:**
```
Chrome pages cannot be captured
```

**Cause:**
- Trying to capture `chrome://`, `chrome-extension://`, or Chrome Web Store pages
- These are restricted for security

**Fix:**
- Only works on regular web pages
- Make sure you're on `meet.google.com` or `zoom.us`, not a Chrome internal page

---

### 6. Tab Already Being Captured

**Error Message:**
```
Tab capture failed: Tab is already being captured
```

**Cause:**
- Another extension or app is capturing the same tab
- Only one capture per tab at a time

**Fix:**
- Close other extensions that might be capturing audio/video
- Close other apps using screen/tab capture
- Try capturing a different tab

---

### 7. Extension Context Invalidated

**Error Message:**
```
Extension context invalidated
```

**Cause:**
- Extension was reloaded while capture was active
- Extension files were modified

**Fix:**
- Reload the extension: `chrome://extensions/` → Click reload
- Restart capture
- If persists, remove and re-add extension

---

### 8. Browser/OS Restrictions

**Error Message:**
```
Tab capture not available
```

**Cause:**
- Tab capture is Chrome-specific (doesn't work in Firefox, Safari, etc.)
- Some operating systems have restrictions
- Corporate/enterprise policies may block tab capture

**Fix:**
- Use **Chrome browser** (not Chromium, Edge, etc.)
- Check OS permissions for screen/tab capture
- Check corporate policies if on work computer

---

## 🔧 Step-by-Step Debugging

### Step 1: Check Console Logs

Open DevTools (F12) → Console tab, look for:

```
🎤 TAB CAPTURE REQUEST
📋 Tab ID: [number]
🌐 Tab URL: [url]
✅ Valid meeting page detected
🔌 Calling getMediaStreamId for tab: [number]
```

### Step 2: Check for Errors

Look for these error patterns:
- `❌ Tab capture error:`
- `⚠️ Tab capture failed`
- `Extension has not been invoked`

### Step 3: Verify Permissions

1. Go to `chrome://extensions/`
2. Click "Details" on your extension
3. Check "Permissions" section
4. Should see: `Tab capture` listed

### Step 4: Test User Gesture

1. Open sidepanel (click extension icon)
2. Click "Start Capture" button
3. Check console for tab capture success

### Step 5: Verify Tab Capture Success

If successful, you should see:
```
✅ TAB CAPTURE SUCCESS!
Stream ID: [id]
✅ Tab audio stream obtained - this is MEETING AUDIO
```

---

## 🎯 Quick Fix Checklist

- [ ] Extension removed and re-added (not just reloaded)
- [ ] "Start Capture" clicked from sidepanel (user gesture)
- [ ] On a Google Meet or Zoom meeting page
- [ ] Meeting tab is active/visible
- [ ] No other extensions capturing the tab
- [ ] Using Chrome browser (not Edge/Firefox)
- [ ] `tabCapture` permission visible in extension details

---

## 📝 Code Locations

- **Background Script:** `background.js` → `captureTabAudio()` (line 6)
- **Content Script:** `content.js` → `startTabCapture()` (line 1211)
- **Permission:** `manifest.json` → `"tabCapture"` (line 13)
- **Trigger:** `sidepanel.js` → Button click handler (line 361)

---

## 💡 Why Tab Capture vs Microphone?

| Feature | Tab Capture | Microphone |
|---------|-------------|------------|
| **Captures** | Meeting audio (all participants) | Only YOUR voice |
| **Privacy** | Captures what's playing in tab | Captures your mic input |
| **Requires** | User gesture + active tab | Just microphone permission |
| **Use Case** | Transcribe entire meeting | Transcribe only your speech |

**Tab capture is preferred** because it captures all participants, not just you!

