// Firebase + Web Speech transcription + Firestore autosave

let app, auth, db
let recognition
let isCapturing = false
let autosaveTimer
let currentUser = null

const firebaseConfig = {
    apiKey: "AIzaSyABz2qFHAmA3I0FzQ6F72ChjuiMjJmBo1c",
    authDomain: "onix-22.firebaseapp.com",
    projectId: "onix-22",
    storageBucket: "onix-22.firebasestorage.app",
    messagingSenderId: "878476800517",
    appId: "1:878476800517:web:067e87661ef8c70a19e26c"
  }

async function ensureFirebase() {
  if (app) return
  // firebase compat is preloaded via script tags in sidepanel.html
  const firebaseGlobal = window.firebase
  if (!firebaseGlobal || !firebaseGlobal.initializeApp) {
    console.error('Firebase not loaded. Ensure vendor firebase scripts are present and referenced in sidepanel.html')
    return
  }
  app = firebaseGlobal.initializeApp(firebaseConfig)
  auth = firebaseGlobal.auth()
  db = firebaseGlobal.firestore()
}

function initUI() {
  const authEl = document.getElementById('auth')
  const signInBtn = document.getElementById('signInBtn')
  const signOutBtn = document.getElementById('signOutBtn')
  const startBtn = document.getElementById('startBtn')
  const stopBtn = document.getElementById('stopBtn')
  const saveBtn = document.getElementById('saveBtn')
  const downloadBtn = document.getElementById('downloadBtn')
  const transcriptEl = document.getElementById('transcript')
  const statusEl = document.getElementById('status')
  const titleEl = document.getElementById('title')
  const connectionStatusEl = document.getElementById('connectionStatus')
  const speakerSelectEl = document.getElementById('speakerSelect')
  const refreshParticipantsBtn = document.getElementById('refreshParticipantsBtn')

  function updateAuthUI() {
    if (currentUser) {
      authEl.textContent = `Signed in as ${currentUser.displayName || currentUser.email}`
      signInBtn.style.display = 'none'
      signOutBtn.style.display = ''
    } else {
      authEl.textContent = 'Not signed in'
      signInBtn.style.display = ''
      signOutBtn.style.display = 'none'
    }
  }

  signInBtn.addEventListener('click', async () => {
    await ensureFirebase()
    // Use chrome.identity to fetch OAuth token and sign in to Firebase
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Sign-in failed: ' + chrome.runtime.lastError.message
        return
      }
      try {
        const cred = window.firebase.auth.GoogleAuthProvider.credential(null, token)
        await auth.signInWithCredential(cred)
      } catch (e) {
        statusEl.textContent = 'Firebase sign-in failed'
        console.error(e)
      }
    })
  })
  signOutBtn.addEventListener('click', async () => {
    await auth.signOut()
  })

  startBtn.addEventListener('click', async () => {
    if (isCapturing) return
    
    console.log('Start button clicked')
    
    // Update UI immediately with proper visual feedback
    isCapturing = true
    startBtn.disabled = true
    startBtn.style.opacity = '0.5'
    startBtn.style.cursor = 'not-allowed'
    stopBtn.disabled = false
    stopBtn.style.opacity = '1'
    stopBtn.style.cursor = 'pointer'
    saveBtn.disabled = true
    downloadBtn.disabled = true
    statusEl.textContent = 'Starting capture...'
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (!tabId) {
        statusEl.textContent = 'No active tab found'
        isCapturing = false
        startBtn.disabled = false
        startBtn.style.opacity = '1'
        startBtn.style.cursor = 'pointer'
        stopBtn.disabled = true
        stopBtn.style.opacity = '0.5'
        stopBtn.style.cursor = 'not-allowed'
        return
      }
      
      chrome.tabs.sendMessage(tabId, { type: 'ONIX_START_CAPTURE' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError)
          statusEl.textContent = 'Error starting capture'
          isCapturing = false
          startBtn.disabled = false
          startBtn.style.opacity = '1'
          startBtn.style.cursor = 'pointer'
          stopBtn.disabled = true
          stopBtn.style.opacity = '0.5'
          stopBtn.style.cursor = 'not-allowed'
        }
      })
    })
    
    startAutosave(() => getTranscriptText(), () => titleEl.value)
  })

  stopBtn.addEventListener('click', () => {
    if (!isCapturing) return
    
    console.log('Stop button clicked')
    
    // Update UI immediately with proper visual feedback
    isCapturing = false
    startBtn.disabled = false
    startBtn.style.opacity = '1'
    startBtn.style.cursor = 'pointer'
    stopBtn.disabled = true
    stopBtn.style.opacity = '0.5'
    stopBtn.style.cursor = 'not-allowed'
    saveBtn.disabled = false
    downloadBtn.disabled = false
    statusEl.textContent = 'Stopping capture...'
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (!tabId) {
        statusEl.textContent = 'No active tab found'
        return
      }
      
      chrome.tabs.sendMessage(tabId, { type: 'ONIX_STOP_CAPTURE' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending stop message:', chrome.runtime.lastError)
          statusEl.textContent = 'Error stopping capture'
        } else {
          statusEl.textContent = 'Capture stopped'
        }
      })
    })
    
    stopAutosave()
    // No automatic download - user must click Download button manually
  })

  saveBtn.addEventListener('click', async () => {
    const transcriptText = getTranscriptText()
    const title = titleEl.value || 'Meeting Transcript'
    
    if (!transcriptText.trim()) {
      statusEl.textContent = 'No transcript to save'
      return
    }
    
    try {
      // Save to Firebase if signed in
      if (currentUser) {
        await saveTranscript(transcriptText, title)
        statusEl.textContent = 'Transcript saved to Firebase'
      }
      
      // Always download as backup
      downloadTranscript(transcriptText, title)
      
    } catch (error) {
      console.error('Save failed:', error)
      statusEl.textContent = 'Save failed, downloading instead'
      downloadTranscript(transcriptText, title)
    }
  })

  downloadBtn.addEventListener('click', () => {
    console.log('Download button clicked')
    const transcriptText = getTranscriptText()
    const title = titleEl.value || 'Meeting Transcript'
    
    console.log('Transcript text length:', transcriptText.length)
    
    if (!transcriptText.trim()) {
      statusEl.textContent = 'No transcript to download'
      return
    }
    
    downloadTranscript(transcriptText, title)
  })

  refreshParticipantsBtn.addEventListener('click', () => {
    console.log('Refresh participants button clicked')
    statusEl.textContent = 'Refreshing participants...'
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (!tabId) {
        statusEl.textContent = 'No active tab found'
        return
      }
      
      chrome.tabs.sendMessage(tabId, { type: 'ONIX_REFRESH_PARTICIPANTS' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error refreshing participants:', chrome.runtime.lastError)
          statusEl.textContent = 'Error refreshing participants'
        } else {
          statusEl.textContent = 'Participants refreshed'
          setTimeout(() => {
            statusEl.textContent = ''
          }, 2000)
        }
      })
    })
  })

  // auth state
  ensureFirebase().then(() => {
    auth.onAuthStateChanged((u) => {
      currentUser = u
      updateAuthUI()
    })
  })

  // receive transcript chunks from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'ONIX_TRANSCRIPT_CHUNK' && typeof msg.text === 'string') {
      addTranscriptEntry(msg.text, msg.speaker, msg.timestamp, msg.confidence)
    }
    if (msg?.type === 'ONIX_TRANSCRIPT_INTERIM' && typeof msg.text === 'string') {
      addInterimTranscriptEntry(msg.text, msg.speaker, msg.timestamp)
    }
    if (msg?.type === 'ONIX_PARTICIPANTS_FOUND') {
      updateSpeakerDropdown(msg.participants)
    }
    if (msg?.type === 'ONIX_TRANSCRIPT_STATUS') {
      if (msg.error) {
        statusEl.textContent = 'Transcription error: ' + msg.error
        updateConnectionStatus('error', 'Error: ' + msg.error)
      }
      if (msg.connected) {
        updateConnectionStatus('connected', 'Connected to server')
      }
      if (msg.disconnected) {
        updateConnectionStatus('disconnected', 'Disconnected from server')
      }
      if (msg.fallback) {
        updateConnectionStatus('processing', 'Using Web Speech API')
        statusEl.textContent = msg.message || 'Using Web Speech API for transcription'
      }
      if (msg.started) {
        updateConnectionStatus('processing', 'Processing audio with Web Speech API...')
        statusEl.textContent = 'Capturing and transcribing...'
        // Ensure UI state is correct when started
        isCapturing = true
        startBtn.disabled = true
        startBtn.style.opacity = '0.5'
        startBtn.style.cursor = 'not-allowed'
        stopBtn.disabled = false
        stopBtn.style.opacity = '1'
        stopBtn.style.cursor = 'pointer'
        saveBtn.disabled = true
        downloadBtn.disabled = true
      }
      if (msg.stopped) {
        isCapturing = false
        startBtn.disabled = false
        startBtn.style.opacity = '1'
        startBtn.style.cursor = 'pointer'
        stopBtn.disabled = true
        stopBtn.style.opacity = '0.5'
        stopBtn.style.cursor = 'not-allowed'
        saveBtn.disabled = false
        downloadBtn.disabled = false
        updateConnectionStatus('disconnected', 'Stopped')
        statusEl.textContent = 'Capture stopped'
        
        // No automatic download - user must click Download button manually
      }
    }
  })
}

// Add transcript entry with speaker identification
function addTranscriptEntry(text, speaker, timestamp, confidence) {
  const transcriptEl = document.getElementById('transcript')
  
  // Clear placeholder text if it exists
  if (transcriptEl.children.length === 1 && transcriptEl.children[0].classList.contains('muted')) {
    transcriptEl.innerHTML = ''
  }
  
  // Clear all interim entries when final text is added
  clearInterimEntries()
  
  // Create transcript entry
  const entry = document.createElement('div')
  entry.className = 'transcript-entry'
  
  const time = new Date(timestamp).toLocaleTimeString()
  const confidenceText = confidence ? ` (${Math.round(confidence * 100)}%)` : ''
  
  entry.innerHTML = `
    <span class="speaker-name">${speaker || 'Unknown'}:</span>
    <span class="transcript-text">${text}</span>
    <span class="timestamp">${time}${confidenceText}</span>
  `
  
  transcriptEl.appendChild(entry)
  
  // Auto-scroll to bottom
  transcriptEl.scrollTop = transcriptEl.scrollHeight
  
  // Enable download button when transcript content is available
  const downloadBtn = document.getElementById('downloadBtn')
  if (downloadBtn && !isCapturing) {
    downloadBtn.disabled = false
  }
}

// Add interim transcript entry for real-time updates
function addInterimTranscriptEntry(text, speaker, timestamp) {
  const transcriptEl = document.getElementById('transcript')
  
  // Clear placeholder text if it exists
  if (transcriptEl.children.length === 1 && transcriptEl.children[0].classList.contains('muted')) {
    transcriptEl.innerHTML = ''
  }
  
  // Check if there's already an interim entry for this speaker
  let interimEntry = transcriptEl.querySelector('.transcript-entry.interim')
  
  if (!interimEntry) {
    // Create new interim entry
    interimEntry = document.createElement('div')
    interimEntry.className = 'transcript-entry interim'
    transcriptEl.appendChild(interimEntry)
  }
  
  const time = new Date(timestamp).toLocaleTimeString()
  
  interimEntry.innerHTML = `
    <span class="speaker-name">${speaker || 'Unknown'}:</span>
    <span class="transcript-text" style="font-style: italic; opacity: 0.7;">${text}</span>
    <span class="timestamp">${time} (typing...)</span>
  `
  
  // Auto-scroll to bottom
  transcriptEl.scrollTop = transcriptEl.scrollHeight
}

// Update existing interim entry instead of creating new ones
function updateInterimTranscriptEntry(text, speaker, timestamp) {
  const transcriptEl = document.getElementById('transcript')
  
  // Clear placeholder text if it exists
  if (transcriptEl.children.length === 1 && transcriptEl.children[0].classList.contains('muted')) {
    transcriptEl.innerHTML = ''
  }
  
  // Find existing interim entry for this speaker
  let interimEntry = transcriptEl.querySelector('.transcript-entry.interim')
  
  if (!interimEntry) {
    // Create new interim entry
    interimEntry = document.createElement('div')
    interimEntry.className = 'transcript-entry interim'
    transcriptEl.appendChild(interimEntry)
  }
  
  const time = new Date(timestamp).toLocaleTimeString()
  
  interimEntry.innerHTML = `
    <span class="speaker-name">${speaker || 'Unknown'}:</span>
    <span class="transcript-text" style="font-style: italic; opacity: 0.7;">${text}</span>
    <span class="timestamp">${time} (typing...)</span>
  `
  
  // Auto-scroll to bottom
  transcriptEl.scrollTop = transcriptEl.scrollHeight
}

// Clear all interim entries (called when final text is added)
function clearInterimEntries() {
  const transcriptEl = document.getElementById('transcript')
  const interimEntries = transcriptEl.querySelectorAll('.transcript-entry.interim')
  interimEntries.forEach(entry => entry.remove())
}

// Update connection status
function updateConnectionStatus(status, message) {
  const connectionStatusEl = document.getElementById('connectionStatus')
  connectionStatusEl.className = `connection-status status-${status}`
  connectionStatusEl.textContent = message
}

// Update speaker dropdown with found participants
function updateSpeakerDropdown(participants) {
  const speakerSelectEl = document.getElementById('speakerSelect')
  if (!speakerSelectEl) return
  
  // Clear existing options except the first one
  speakerSelectEl.innerHTML = '<option value="">Auto-detect speakers</option>'
  
  // Filter out invalid participant names
  const validParticipants = participants.filter(participant => {
    // Basic validation for participant names
    return participant && 
           participant.length >= 2 && 
           participant.length <= 30 &&
           /[a-zA-Z]/.test(participant) &&
           !['more', 'options', 'vert', 'mic', 'check', 'tech', 'hello', 'click', 'button', 'menu', 'for'].some(word => 
             participant.toLowerCase().includes(word)
           )
  })
  
  // Add valid participant options
  if (validParticipants.length > 0) {
    validParticipants.forEach(participant => {
      const option = document.createElement('option')
      option.value = participant
      option.textContent = participant
      speakerSelectEl.appendChild(option)
    })
    console.log('Updated speaker dropdown with valid participants:', validParticipants)
  } else {
    // Add generic speaker options if no valid participants found
    for (let i = 1; i <= 5; i++) {
      const option = document.createElement('option')
      option.value = `Speaker ${i}`
      option.textContent = `Speaker ${i}`
      speakerSelectEl.appendChild(option)
    }
    console.log('No valid participants found, added generic speaker options')
  }
}

// Get transcript text for saving
function getTranscriptText() {
  const transcriptEl = document.getElementById('transcript')
  const entries = transcriptEl.querySelectorAll('.transcript-entry')
  let text = ''
  
  entries.forEach(entry => {
    const speaker = entry.querySelector('.speaker-name').textContent
    const transcriptText = entry.querySelector('.transcript-text').textContent
    text += `${speaker} ${transcriptText}\n`
  })
  
  return text.trim()
}

// Auto-save transcript when call ends
async function autoSaveTranscript() {
  const transcriptText = getTranscriptText()
  const title = document.getElementById('title').value || 'Meeting Transcript'
  
  if (!transcriptText.trim()) {
    console.log('No transcript to save')
    return
  }
  
  try {
    // Try to save to Firebase if user is signed in
    if (currentUser) {
      await saveTranscript(transcriptText, title)
      console.log('Transcript auto-saved to Firebase')
    }
    
    // Always download transcript as backup
    downloadTranscript(transcriptText, title)
    console.log('Transcript downloaded')
    
  } catch (error) {
    console.error('Auto-save failed:', error)
    // Still download even if Firebase save fails
    downloadTranscript(transcriptText, title)
  }
}

// Download transcript as text file
function downloadTranscript(text, title) {
  console.log('Downloading transcript:', { textLength: text.length, title })
  
  if (!text.trim()) {
    console.log('No text to download')
    return
  }
  
  // Create filename with timestamp
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.txt`
  
  console.log('Creating file:', filename)
  
  // Create and download file
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  console.log('File downloaded successfully')
  
  // Show success message
  const statusEl = document.getElementById('status')
  statusEl.textContent = `Transcript downloaded: ${filename}`
  setTimeout(() => {
    statusEl.textContent = ''
  }, 3000)
}

function startAutosave(getText, getTitle) {
  stopAutosave()
  autosaveTimer = setInterval(async () => {
    if (!currentUser) return
    const text = getText()
    if (!text) return
    await saveTranscript(text, getTitle(), true)
  }, 30000)
}

function stopAutosave() {
  if (autosaveTimer) clearInterval(autosaveTimer)
  autosaveTimer = undefined
}

async function saveTranscript(text, title, isAutosave = false) {
  if (!currentUser) return
  const url = location.href
  const docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc()
  await docRef.set({
    title: title || 'Untitled meeting',
    transcript: text || '',
    createdAt: window.firebase.firestore.Timestamp.now(),
    duration: '',
    meetingURL: url,
    autosave: !!isAutosave,
  }, { merge: true })
}

document.addEventListener('DOMContentLoaded', () => {
  initUI()
})


