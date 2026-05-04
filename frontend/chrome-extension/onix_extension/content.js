// Detect meeting participation heuristically and offer side panel
function detectMeeting() {
  const url = location.href
  const isMeet = url.startsWith('https://meet.google.com/')
  const isZoom = url.includes('.zoom.us/')
  return isMeet || isZoom
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
    zIndex: '999999',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #999',
    background: 'white',
    cursor: 'pointer'
  })
  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'ONIX_OPEN_SIDE_PANEL' })
  })
  document.body.appendChild(btn)
}

if (detectMeeting()) {
  addFloatingButton()
}

window.addEventListener('message', (ev) => {
  if (ev.data?.type === 'ONIX_START_MEETING') {
    chrome.runtime.sendMessage({ type: 'ONIX_OPEN_SIDE_PANEL' })
  }
})

// Speech recognition in the page context to avoid mic issues on extension pages
let pageRecognition
let pageIsCapturing = false
let lastResultIndex = 0

function startPageRecognition() {
  if (pageIsCapturing) return
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', error: 'Web Speech not supported' })
    return
  }
  pageRecognition = new SpeechRecognition()
  pageRecognition.continuous = true
  pageRecognition.interimResults = true
  pageRecognition.lang = 'en-US'
  pageRecognition.onresult = (event) => {
    let text = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i]
      if (res.isFinal) {
        text += res[0].transcript
      }

    }
    if (text && text.trim()) {
      chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_CHUNK', text: text.trim() })
    }
  }
  pageRecognition.onerror = (e) => {
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', error: e.error })
  }
  pageRecognition.onend = () => {
    pageIsCapturing = false
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', stopped: true })
  }
  // Permission prompt is shown on the page origin
  navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
    pageRecognition.start()
    pageIsCapturing = true
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', started: true })
  }).catch((e) => {
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', error: 'not-allowed' })
  })
}

function stopPageRecognition() {
  if (!pageIsCapturing) return
  pageRecognition?.stop()
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'ONIX_START_CAPTURE') startPageRecognition()
  if (msg?.type === 'ONIX_STOP_CAPTURE') stopPageRecognition()
})



