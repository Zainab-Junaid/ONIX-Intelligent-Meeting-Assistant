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
  const transcriptEl = document.getElementById('transcript')
  const statusEl = document.getElementById('status')
  const titleEl = document.getElementById('title')

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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (!tabId) return
      chrome.tabs.sendMessage(tabId, { type: 'ONIX_START_CAPTURE' })
    })
    isCapturing = true
    startBtn.disabled = true
    stopBtn.disabled = false
    saveBtn.disabled = true
    statusEl.textContent = 'Capturing…'
    startAutosave(() => transcriptEl.value, () => titleEl.value)
  })

  stopBtn.addEventListener('click', () => {
    if (!isCapturing) return
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (!tabId) return
      chrome.tabs.sendMessage(tabId, { type: 'ONIX_STOP_CAPTURE' })
    })
    stopAutosave()
  })

  saveBtn.addEventListener('click', async () => {
    await saveTranscript(transcriptEl.value, titleEl.value)
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
      transcriptEl.value += (msg.text + ' ')
    }
    if (msg?.type === 'ONIX_TRANSCRIPT_STATUS') {
      if (msg.error) statusEl.textContent = 'Transcription error: ' + msg.error
      if (msg.stopped) {
        isCapturing = false
        startBtn.disabled = false
        stopBtn.disabled = true
        saveBtn.disabled = false
      }
    }
  })
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


