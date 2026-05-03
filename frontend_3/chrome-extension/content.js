// Caption-driven transcription for Google Meet/Zoom.
// Scrapes on-page captions and streams transcript chunks to the V2 sidepanel.

let transcript = []
const prior = new Map()
const lastSeen = new Map()
const speakers = new Set()
let startedNotified = false

const CHUNK_GRACE_MS = 2000
const captionSelector = '.ygicle'
const speakerSelector = '.NWpY1d'
const captionParent = '.nMcdL'

const normalize = (pre) => pre.toLowerCase().replace(/[.,?!'"\u2019]/g, '').replace(/\s+/g, ' ').trim()

function emitStatusStarted() {
  if (startedNotified) return
  startedNotified = true
  chrome.runtime
    .sendMessage({
      type: 'ONIX_TRANSCRIPT_STATUS',
      started: true,
      captions: true,
      message: 'Captions active (on-page, no audio capture)'
    })
    .catch(() => { })
}

function emitChunk(entry) {
  speakers.add(entry.speaker || 'Speaker')
  emitStatusStarted()
  chrome.runtime
    .sendMessage({
      type: 'ONIX_TRANSCRIPT_CHUNK',
      text: entry.text,
      speaker: entry.speaker || 'Speaker',
      timestamp: entry.endTime,
      confidence: 1
    })
    .catch(() => { })
}

function commit(key) {
  const entry = prior.get(key)
  if (!entry) return
  const startTS = new Date(entry.startTime).toISOString()
  const endTS = new Date(entry.endTime).toISOString()
  transcript.push(`[${startTS}] [${endTS}] ${entry.speaker} : ${entry.text}`.trim())
  emitChunk(entry)
  clearTimeout(entry.timer)
  prior.delete(key)
}

function handleCaption(speakerKey, speakerName, rawText) {
  const text = rawText.trim()
  if (!text) return

  const norm = normalize(text)
  const prev = lastSeen.get(speakerKey)
  if (prev === norm) return
  lastSeen.set(speakerKey, norm)

  const now = Date.now()
  const existing = prior.get(speakerKey)

  if (!existing) {
    const timer = window.setTimeout(() => commit(speakerKey), CHUNK_GRACE_MS)
    prior.set(speakerKey, {
      startTime: now,
      endTime: now,
      speaker: speakerName || 'Speaker',
      text,
      timer
    })
    return
  }

  existing.endTime = now
  existing.text = text
  existing.speaker = speakerName || existing.speaker

  clearTimeout(existing.timer)
  existing.timer = window.setTimeout(() => commit(speakerKey), CHUNK_GRACE_MS)
}

let captionObserver = null
const observedElements = new WeakSet()
let currentRegion = null

function scanClasses(cl) {
  if (observedElements.has(cl)) return
  observedElements.add(cl)

  const txtNode = cl.querySelector(captionSelector)
  if (!txtNode) return

  const speakerName = cl.querySelector(speakerSelector)?.textContent?.trim() ?? 'Speaker'
  const key = cl.getAttribute('data-participant-id') || speakerName

  const push = () => {
    const trimmed = txtNode.textContent?.trim() ?? ''
    if (trimmed) handleCaption(key, speakerName, trimmed)
  }

  new MutationObserver(push).observe(txtNode, { childList: true, subtree: true, characterData: true })
}

function launchAttachObserver(region) {
  if (currentRegion === region && captionObserver) return
  captionObserver?.disconnect()
  currentRegion = region

  captionObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement && node.matches(captionParent)) {
          scanClasses(node)
        }
      })
    })
  })

  captionObserver.observe(region, { childList: true, subtree: true })
  console.log('[onix] Caption observer attached')
  region.querySelectorAll(captionParent).forEach(scanClasses)
}

// Attach when the captions region appears.
new MutationObserver(() => {
  const region = document.querySelector('div[role="region"][aria-label="Captions"]')
  if (region) launchAttachObserver(region)
}).observe(document.body, { childList: true, subtree: true })

function getTranscriptText() {
  ;[...prior.keys()].forEach(commit)
  return transcript.join('\n')
}

function resetTranscript() {
  prior.clear()
  transcript.length = 0
  lastSeen.clear()
  speakers.clear()
  startedNotified = false
}

async function handleScreenshot(sendResponse) {
  try {
    if (!window.html2canvas) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
        script.onload = resolve
        script.onerror = () => reject(new Error('Failed to load html2canvas'))
        document.documentElement.appendChild(script)
      })
    }
    const dataUrl = await window
      .html2canvas(document.body, { scale: 0.6, useCORS: true })
      .then((c) => c.toDataURL('image/png'))
    chrome.runtime.sendMessage({ type: 'ONIX_SCREENSHOT_RESPONSE', dataUrl, success: true }).catch(() => { })
  } catch (error) {
    chrome.runtime
      .sendMessage({
        type: 'ONIX_SCREENSHOT_RESPONSE',
        error: `Screenshot capture failed: ${error.message}. Try using the "Paste Image" button instead.`
      })
      .catch(() => { })
  }
  sendResponse?.({ success: true })
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'GET_TRANSCRIPT') {
    sendResponse({ transcript: getTranscriptText() })
    return true
  }

  if (msg?.type === 'RESET_TRANSCRIPT') {
    resetTranscript()
    sendResponse({ ok: true })
    return true
  }

  if (msg?.type === 'ONIX_START_CAPTURE') {
    resetTranscript()
    ensureCaptionsEnabled()
    emitStatusStarted()
    sendResponse({ success: true })
    return true
  }

  if (msg?.type === 'ONIX_START_CAPTURE_WITH_STREAM') {
    resetTranscript()
    emitStatusStarted()
    sendResponse({ success: true })
    return true
  }

  if (msg?.type === 'ONIX_STOP_CAPTURE') {
    ;[...prior.keys()].forEach(commit)
    ensureCaptionsDisabled()
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', stopped: true }).catch(() => { })
    sendResponse({ success: true })
    return true
  }

  if (msg?.type === 'ONIX_REFRESH_PARTICIPANTS') {
    const list = Array.from(speakers)
    chrome.runtime.sendMessage({ type: 'ONIX_PARTICIPANTS_FOUND', participants: list }).catch(() => { })
    sendResponse({ success: true, participants: list })
    return true
  }

  if (msg?.type === 'ONIX_CAPTURE_SCREENSHOT') {
    handleScreenshot(sendResponse)
    return true
  }
})

// Debug helpers
window.getTranscript = getTranscriptText
window.resetTranscript = resetTranscript

console.log('Transcript collector ready (caption scraper)')

// Minimal floater to open the sidepanel when on a meeting page.
function detectMeeting() {
  const url = location.href
  return url.startsWith('https://meet.google.com/') || url.includes('.zoom.us/')
}

// Floating Button Logic
let floatBtn = null
let isPanelOpen = false

function addFloatingButton() {
  if (document.getElementById('onix-open-panel')) {
    floatBtn = document.getElementById('onix-open-panel')
    return
  }

  const btn = document.createElement('button')
  btn.id = 'onix-open-panel'
  btn.textContent = 'Open Onix'
  Object.assign(btn.style, {
    position: 'fixed',
    right: '12px',
    top: '12px',
    zIndex: '2147483647',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #999',
    background: 'white',
    color: 'black',
    cursor: 'move', // Indicate draggable
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    fontFamily: 'sans-serif',
    fontWeight: 'normal',
    display: isPanelOpen ? 'none' : 'block',
    userSelect: 'none'
  })

  // --- Dragging Logic ---
  let isDragging = false
  let startX, startY, initialLeft, initialTop

  btn.addEventListener('mousedown', (e) => {
    isDragging = false
    startX = e.clientX
    startY = e.clientY

    const rect = btn.getBoundingClientRect()
    initialLeft = rect.left
    initialTop = rect.top

    // Remove right positioning to switch to left-based positioning for dragging matches
    btn.style.right = 'auto'
    btn.style.left = `${initialLeft}px`
    btn.style.top = `${initialTop}px`

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY

      // if moved more than 3 pixels, consider it a drag
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging = true

      // Calculate new position
      let newLeft = initialLeft + dx
      let newTop = initialTop + dy

      // Constrain within window bounds
      const maxLeft = window.innerWidth - btn.offsetWidth
      const maxTop = window.innerHeight - btn.offsetHeight

      // Clamp values (keep between 0 and max)
      newLeft = Math.max(0, Math.min(newLeft, maxLeft))
      newTop = Math.max(0, Math.min(newTop, maxTop))

      btn.style.left = `${newLeft}px`
      btn.style.top = `${newTop}px`
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  // Click Handler (only if not dragging)
  btn.addEventListener('click', (e) => {
    if (isDragging) return
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({ type: 'ONIX_OPEN_SIDE_PANEL' }).catch(() => {})
      }
    } catch (err) {
      // Extension context invalidated (e.g. extension was reloaded) - fail silently
      if (!err.message || !err.message.includes('Extension context invalidated')) console.warn('[onix]', err)
    }
    btn.style.display = 'none'
  })

  document.body.appendChild(btn)
  floatBtn = btn
}

// Listen for connection from sidepanel to know when it opens/closes
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'ONIX_SIDEPANEL_ALIVE') {
    isPanelOpen = true
    if (floatBtn) floatBtn.style.display = 'none'

    port.onDisconnect.addListener(() => {
      isPanelOpen = false
      if (floatBtn) {
        floatBtn.style.display = 'flex'
        // Ensure it's visible if it was hidden
        floatBtn.style.opacity = '1'
      }
    })
  }
})

if (detectMeeting()) addFloatingButton()

// Auto-stop detection
function scanForMeetingEnd() {
  const bodyText = document.body.innerText
  // Google Meet standard end screen text
  if (bodyText.includes('You left the meeting') ||
    bodyText.includes('Return to home screen') ||
    bodyText.includes('Rejoin')) {

    // Double check specific elements to be sure
    const h1s = Array.from(document.querySelectorAll('h1'))
    const leftMeetingHeader = h1s.find(h => h.innerText.includes('You left the meeting'))

    if (leftMeetingHeader) {
      console.log('[ONIX] Meeting end detected. Stopping capture...')
      chrome.runtime.sendMessage({ type: 'ONIX_MEETING_ENDED' }).catch(() => { })
    }
  }
}

// Run the scan periodically
setInterval(scanForMeetingEnd, 2000)

// Helper for keyboard events (needed for fallback)
function simulateKeyPress(key) {
  const eventObj = {
    key: key,
    code: 'Key' + key.toUpperCase(),
    bubbles: true,
    cancelable: true,
    view: window,
    keyCode: key.charCodeAt(0),
    which: key.charCodeAt(0)
  }

  document.body.dispatchEvent(new KeyboardEvent('keydown', eventObj))
  document.body.dispatchEvent(new KeyboardEvent('keypress', eventObj))
  document.body.dispatchEvent(new KeyboardEvent('keyup', eventObj))
}

// --- New Auto-Caption Logic (User Provided + Retry Fix) ---

async function ensureCaptionsEnabled() {
  console.log('[onix] Triggering caption enable...');

  // Retry finding the button for up to 5 seconds (500ms * 10)
  // This solves the issue where captions don't turn on immediately on join/start
  for (let i = 0; i < 10; i++) {
    // Check if already on (Turn off button visible)
    const turnOffBtn = document.querySelector('button[aria-label*="Turn off captions"]');
    if (turnOffBtn) {
      console.log('[onix] Captions already active.');
      break; // Already on, exit loop
    }

    // Look for Turn On button
    const turnOnBtn = document.querySelector('button[aria-label*="Turn on captions"]');
    if (turnOnBtn) {
      console.log('[onix] Found Turn On button, clicking...');
      turnOnBtn.click();
      // Small wait to allow UI to toggle state
      await new Promise(r => setTimeout(r, 1000));
      break; // Clicked, exit loop
    }

    console.log(`[onix] Caption button not found (attempt ${i + 1}/10), waiting...`);
    await new Promise(r => setTimeout(r, 500));
  }

  // Fallback check: If still not on, try 'c' hotkey as last resort
  const finalCheckOff = document.querySelector('button[aria-label*="Turn off captions"]');
  if (!finalCheckOff) {
    console.log('[onix] Button toggle failed or hidden. Trying "c" hotkey fallback...');
    simulateKeyPress('c');
    // Wait for the hotkey to take effect
    await new Promise(r => setTimeout(r, 1000));
  }

  // Try to set Urdu if possible (placeholder)
  if (typeof ensureUrduLanguage === 'function') {
    await ensureUrduLanguage();
  }
}

function ensureCaptionsDisabled() {
  // Google Meet logic
  const turnOffBtn = document.querySelector('button[aria-label*="Turn off captions"]');

  if (turnOffBtn) {
    turnOffBtn.click();
  }
}

// Placeholder for Urdu language selection
async function ensureUrduLanguage() {
  console.log('[onix] Setting language to Urdu (if implemented)...');
}

// Auto-enable captions when joining a meeting
// Wait for the page to fully load and meeting UI to be ready
setTimeout(async () => {
  if (detectMeeting()) {
    console.log('[onix] Auto-enabling captions on meeting join...');
    await ensureCaptionsEnabled();
  }
}, 3000); // Wait 3 seconds for meeting UI to load
