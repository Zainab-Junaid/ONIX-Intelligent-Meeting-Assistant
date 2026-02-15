// Caption-driven transcription for Google Meet/Zoom.
// Scrapes on-page captions and streams transcript chunks to the V2 sidepanel.

let transcript = []
const prior = new Map()
const lastSeen = new Map()
const speakers = new Set()
let isCapturing = false
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
  if (!isCapturing) return
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
  if (!isCapturing) return
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

  // Helper to auto-enable captions
  function ensureCaptionsEnabled() {
    // Google Meet: Look for button with aria-label "Turn on captions" (or similar)
    // If captions are already on, the button says "Turn off captions"
    const turnOnBtn = document.querySelector('button[aria-label*="Turn on captions"]')
    if (turnOnBtn) {
      console.log('[onix] Auto-enabling captions...')
      turnOnBtn.click()
    } else {
      // Check if we can find the "Turn off captions" button to confirm they are on
      const turnOffBtn = document.querySelector('button[aria-label*="Turn off captions"]')
      if (turnOffBtn) {
        console.log('[onix] Captions are already enabled')
      } else {
        console.log('[onix] Could not find caption button')
      }
    }
  }

  // Helper to auto-disable captions
  function ensureCaptionsDisabled() {
    const turnOffBtn = document.querySelector('button[aria-label*="Turn off captions"]')
    if (turnOffBtn) {
      console.log('[onix] Auto-disabling captions...')
      turnOffBtn.click()
    }
  }

  if (msg?.type === 'ONIX_START_CAPTURE') {
    isCapturing = true
    ensureCaptionsEnabled()
    resetTranscript()
    emitStatusStarted()
    sendResponse({ success: true })
    return true
  }

  if (msg?.type === 'ONIX_START_CAPTURE_WITH_STREAM') {
    isCapturing = true
    ensureCaptionsEnabled()
    resetTranscript()
    emitStatusStarted()
    sendResponse({ success: true })
    return true
  }

  if (msg?.type === 'ONIX_STOP_CAPTURE') {
    ;[...prior.keys()].forEach(commit)
    isCapturing = false
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

function addFloatingButton() {
  if (document.getElementById('onix-open-panel')) return
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
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
  })
  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'ONIX_OPEN_SIDE_PANEL' }).catch(() => { })
  })
  document.body.appendChild(btn)
}

if (detectMeeting()) addFloatingButton()

// Listen for side panel connection to hide the button
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'onix-sidepanel-connection') {
    const btn = document.getElementById('onix-open-panel')
    if (btn) btn.style.display = 'none'

    port.onDisconnect.addListener(() => {
      const btn = document.getElementById('onix-open-panel')
      if (btn) btn.style.display = 'block'
    })
  }
})

// Periodic check for meeting end
let meetingEndCheckInterval = null

function checkMeetingEnd() {
  if (!detectMeeting()) return

  const leaveBtn = document.querySelector('button[aria-label="Leave call"]')
  const returnToHome = document.body.innerText.includes('Return to home screen') ||
    document.body.innerText.includes('You left the meeting')

  if (!leaveBtn && returnToHome) {
    console.log('Meeting end detected')
    chrome.runtime.sendMessage({ type: 'ONIX_MEETING_ENDED' }).catch(() => { })
    if (meetingEndCheckInterval) clearInterval(meetingEndCheckInterval)
  }
}

// Start checking after a delay to allow UI to load
setTimeout(() => {
  meetingEndCheckInterval = setInterval(checkMeetingEnd, 2000)
}, 5000)


