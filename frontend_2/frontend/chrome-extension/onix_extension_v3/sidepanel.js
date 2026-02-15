// Firebase + Web Speech transcription + Firestore autosave

let app, auth, db, storage
let recognition
let isCapturing = false
let autosaveTimer
let autoNotesTimer // Timer for auto-generating notes
let currentUser = null
let currentMeetingDocId = null // Track the current meeting document ID to update instead of creating new ones
let lastSavedTranscript = '' // Track last saved transcript to avoid unnecessary saves
let lastSaveTime = 0 // Track when we last saved
let lastNotesGenerationTime = 0 // Track when we last generated notes
let transcriptBuffer = [] // Store transcript entries in memory as backup
let seenSentences = new Set() // Track seen sentences to prevent duplicates (normalized text)
let uniqueEntriesMap = new Map() // Map of normalized text -> entry for efficient deduplication

// Load persisted meeting document ID from storage (survives sidepanel reloads)
async function loadCurrentMeetingDocId() {
  try {
    const result = await chrome.storage.local.get(['currentMeetingDocId', 'currentMeetingURL'])
    if (result.currentMeetingDocId) {
      currentMeetingDocId = result.currentMeetingDocId
      console.log('✅ Loaded meeting document ID:', currentMeetingDocId, 'for URL:', result.currentMeetingURL)
    }
    // Always start fresh on reload - clear capturing state
    isCapturing = false
    await chrome.storage.local.set({ isCapturing: false })
  } catch (error) {
    console.error('Error loading meeting document ID:', error)
  }
}

// Save meeting document ID to storage with meeting URL
async function saveCurrentMeetingDocId(docId, meetingURL = null) {
  currentMeetingDocId = docId
  try {
    if (docId) {
      // Get meeting URL if not provided
      if (!meetingURL) {
        try {
          const tabs = await new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, resolve)
          })
          if (tabs && tabs[0] && tabs[0].url) {
            meetingURL = tabs[0].url
          }
        } catch (error) {
          console.error('Error getting meeting URL:', error)
        }
      }

      await chrome.storage.local.set({
        currentMeetingDocId: docId,
        currentMeetingURL: meetingURL || '',
        isCapturing: isCapturing
      })
      console.log('✅ Saved meeting document ID:', docId, 'for URL:', meetingURL)
    } else {
      await chrome.storage.local.remove(['currentMeetingDocId', 'currentMeetingURL'])
      await chrome.storage.local.set({ isCapturing: false })
      console.log('Removed meeting document ID from storage')
    }
  } catch (error) {
    console.error('Error saving meeting document ID:', error)
  }
}

// Save capturing state to storage
async function saveCapturingState(capturing) {
  isCapturing = capturing
  try {
    await chrome.storage.local.set({ isCapturing: capturing })
  } catch (error) {
    console.error('Error saving capturing state:', error)
  }
}

const firebaseConfig = {
  apiKey: "AIzaSyABz2qFHAmA3I0FzQ6F72ChjuiMjJmBo1c",
  authDomain: "onix-22.firebaseapp.com",
  projectId: "onix-22",
  storageBucket: "onix-22.firebasestorage.app",
  messagingSenderId: "878476800517",
  appId: "1:878476800517:web:067e87661ef8c70a19e26c"
}

async function ensureFirebase() {
  if (app && db) {
    console.log('Firebase already initialized')
    return true
  }
  // firebase compat is preloaded via script tags in sidepanel.html
  const firebaseGlobal = window.firebase
  if (!firebaseGlobal || !firebaseGlobal.initializeApp) {
    console.error('Firebase not loaded. Ensure vendor firebase scripts are present and referenced in sidepanel.html')
    const statusEl = document.getElementById('status')
    if (statusEl) {
      statusEl.textContent = 'Error: Firebase not loaded. Please refresh the extension.'
      statusEl.style.color = 'red'
    }
    return false
  }
  try {
    app = firebaseGlobal.initializeApp(firebaseConfig)
    auth = firebaseGlobal.auth()
    db = firebaseGlobal.firestore()

    // Firebase Storage is not available in extensions due to CSP restrictions
    // We'll use base64 encoding and save directly to Firestore instead
    storage = null
    console.log('✅ Firebase initialized (Storage will use Firestore fallback)')
    return true
  } catch (error) {
    console.error('❌ Error initializing Firebase:', error)
    const statusEl = document.getElementById('status')
    if (statusEl) {
      statusEl.textContent = 'Error: Failed to initialize Firebase'
      statusEl.style.color = 'red'
    }
    return false
  }
}

function initUI() {
  const authEl = document.getElementById('auth')
  const signInBtn = document.getElementById('signInBtn')
  const guestBtn = document.getElementById('guestBtn')
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
  const pasteImageBtn = document.getElementById('pasteImageBtn')
  const noteInputContainer = document.getElementById('noteInputContainer')
  const noteTextInput = document.getElementById('noteTextInput')
  const saveNoteBtn = document.getElementById('saveNoteBtn')
  const cancelNoteBtn = document.getElementById('cancelNoteBtn')
  const imagePreview = document.getElementById('imagePreview')
  const previewImage = document.getElementById('previewImage')

  // Store pending screenshot/image data URL for note input
  let pendingScreenshotDataUrl = null

  // Debug: Check if buttons exist
  if (!startBtn) {
    console.error('Start button not found!')
    return
  }
  if (!stopBtn) {
    console.error('Stop button not found!')
    return
  }
  console.log('UI initialized, buttons found:', { startBtn: !!startBtn, stopBtn: !!stopBtn })

  // Guest mode state
  let isGuest = false

  function updateAuthUI() {
    if (currentUser) {
      authEl.textContent = `Signed in as ${currentUser.displayName || currentUser.email}`
      signInBtn.style.display = 'none'
      if (guestBtn) guestBtn.style.display = 'none'
      signOutBtn.style.display = ''
      signOutBtn.textContent = 'Sign out'
      // Enable paste image button when signed in
      if (pasteImageBtn) {
        pasteImageBtn.disabled = false
        pasteImageBtn.style.opacity = '1'
        pasteImageBtn.style.cursor = 'pointer'
      }
    } else if (isGuest) {
      authEl.textContent = 'Guest Mode (Local only)'
      signInBtn.style.display = 'none'
      if (guestBtn) guestBtn.style.display = 'none'
      signOutBtn.style.display = ''
      signOutBtn.textContent = 'Exit Guest Mode'

      // Keep paste image disabled for guest as it requires cloud storage
      if (pasteImageBtn) {
        pasteImageBtn.disabled = true
        pasteImageBtn.style.opacity = '0.5'
        pasteImageBtn.style.cursor = 'not-allowed'
      }
    } else {
      authEl.textContent = 'Not signed in'
      signInBtn.style.display = ''
      if (guestBtn) guestBtn.style.display = ''
      signOutBtn.style.display = 'none'
      // Disable paste image button when not signed in
      if (pasteImageBtn) {
        pasteImageBtn.disabled = true
        pasteImageBtn.style.opacity = '0.5'
        pasteImageBtn.style.cursor = 'not-allowed'
      }
    }
  }

  // Handle auth token requests for AssemblyAI transcription
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'ONIX_GET_AUTH_TOKEN_FORWARD') {
      // Get Firebase auth token and meeting ID
      if (currentUser && currentMeetingDocId) {
        currentUser.getIdToken().then((token) => {
          sendResponse({
            token: token,
            meetingId: currentMeetingDocId
          })
        }).catch((error) => {
          console.error('Error getting auth token:', error)
          sendResponse({ error: error.message })
        })
        return true // Keep channel open for async response
      } else {
        sendResponse({ error: 'User not signed in or no active meeting' })
      }
    }
  })

  signInBtn.addEventListener('click', async () => {
    await ensureFirebase()

    // Try standard web popup first as it's more reliable for development ids
    try {
      const provider = new firebase.auth.GoogleAuthProvider()
      await auth.signInWithPopup(provider)
      return
    } catch (webError) {
      console.log('Web popup failed, trying chrome.identity...', webError)
    }

    // Fallback to chrome.identity
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError) {
        console.error('Identity error:', chrome.runtime.lastError)
        // One last try with popup if identity failed (in case the first try was blocked)
        try {
          const provider = new firebase.auth.GoogleAuthProvider()
          await auth.signInWithPopup(provider)
        } catch (e) {
          statusEl.textContent = 'Sign-in failed: ' + chrome.runtime.lastError.message
        }
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

  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      isGuest = true
      updateAuthUI()
    })
  }

  signOutBtn.addEventListener('click', async () => {
    if (isGuest) {
      isGuest = false
      updateAuthUI()
    } else {
      await auth.signOut()
    }
  })

  startBtn.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('Start button clicked')

    if (isCapturing) {
      console.log('Already capturing, ignoring start click')
      return
    }

    // Update UI immediately
    startBtn.disabled = true
    statusEl.textContent = 'Starting...'

    try {
      // Get meeting URL first
      let meetingURL = ''
      try {
        const tabs = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        })
        if (tabs && tabs[0] && tabs[0].url) {
          meetingURL = tabs[0].url
        }
      } catch (error) {
        console.error('Error getting meeting URL:', error)
      }

      // Try to create document if user is signed in (non-blocking)
      let documentCreated = false

      if (isGuest) {
        statusEl.textContent = 'Capture active (Guest Mode - Local)'
      } else if (currentUser) {
        try {
          await ensureFirebase()
          if (db) {
            const meetingTitle = titleEl.value || 'Untitled meeting'

            // Check for existing meeting
            let docRef
            let existingDocId = null
            try {
              const meetingsRef = db.collection('users').doc(currentUser.uid).collection('meetings')
              // Try with index first, fallback to getting all
              try {
                const existingMeetings = await meetingsRef
                  .where('meetingURL', '==', meetingURL)
                  .orderBy('createdAt', 'desc')
                  .limit(1)
                  .get()

                if (!existingMeetings.empty) {
                  const existingDoc = existingMeetings.docs[0]
                  const existingData = existingDoc.data()
                  const existingTime = existingData.createdAt?.toDate() || new Date(0)
                  const now = new Date()
                  if ((now - existingTime) < 10 * 60 * 1000) {
                    existingDocId = existingDoc.id
                  }
                }
              } catch (indexError) {
                // Index might not exist, get all and filter
                console.log('Index not available, fetching all meetings...')
                const allMeetings = await meetingsRef.get()
                allMeetings.forEach(doc => {
                  const data = doc.data()
                  if (data.meetingURL === meetingURL) {
                    const time = data.createdAt?.toDate() || new Date(0)
                    const now = new Date()
                    if ((now - time) < 10 * 60 * 1000) {
                      existingDocId = doc.id
                    }
                  }
                })
              }

              if (existingDocId) {
                docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc(existingDocId)
                currentMeetingDocId = existingDocId
                await saveCurrentMeetingDocId(existingDocId, meetingURL)
                console.log('✅ Reusing existing meeting document:', existingDocId)
              } else {
                docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc()
                currentMeetingDocId = docRef.id
                await saveCurrentMeetingDocId(docRef.id, meetingURL)
                console.log('✅ Creating new meeting document:', docRef.id)
              }

              // Initialize document
              const existingData = existingDocId ? (await docRef.get()).data() : null
              await docRef.set({
                title: meetingTitle,
                transcript: existingData?.transcript || '',
                createdAt: existingData?.createdAt || window.firebase.firestore.Timestamp.now(),
                duration: '',
                meetingURL: meetingURL,
                autosave: true,
                updatedAt: window.firebase.firestore.Timestamp.now(),
              }, { merge: true })

              documentCreated = true
              console.log('✅ Meeting document ready:', currentMeetingDocId)
            } catch (docError) {
              console.error('❌ Error creating document (will create on first save):', docError)
              // Don't throw - allow transcription to start anyway
            }
          }
        } catch (firebaseError) {
          console.error('❌ Firebase error (transcription will still work):', firebaseError)
          statusEl.textContent = 'Warning: Sign in to save transcripts'
        }
      } else {
        statusEl.textContent = 'Note: Sign in to save transcripts'
      }

      // Start transcription (this works independently of document creation)
      await saveCapturingState(true)
      stopBtn.disabled = false
      stopBtn.style.opacity = '1'
      stopBtn.style.cursor = 'pointer'
      saveBtn.disabled = true
      downloadBtn.disabled = true

      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tabId = tabs[0]?.id
        if (!tabId) {
          statusEl.textContent = 'No active tab found'
          await saveCapturingState(false)
          startBtn.disabled = false
          stopBtn.disabled = true
          return
        }

        // Reset transcript buffer first (best-effort)
        chrome.tabs.sendMessage(tabId, { type: 'RESET_TRANSCRIPT' }, () => { })

        // Clear all tracking structures to start fresh
        seenSentences.clear()
        uniqueEntriesMap.clear()
        transcriptBuffer = []
        const transcriptEl = document.getElementById('transcript')
        if (transcriptEl) {
          transcriptEl.innerHTML = '<div class="muted">Waiting for transcript...</div>'
        }

        chrome.tabs.sendMessage(tabId, { type: 'ONIX_START_CAPTURE' }, async (resp) => {
          if (chrome.runtime.lastError || resp?.success === false) {
            const errMsg = chrome.runtime.lastError?.message || resp?.error || 'Could not start capture'
            console.error('Error starting caption capture:', errMsg)
            statusEl.textContent = `Error: ${errMsg}`
            await saveCapturingState(false)
            startBtn.disabled = false
            stopBtn.disabled = true
            return
          }

          statusEl.textContent = documentCreated ? 'Capturing and saving...' : 'Capturing (sign in to save)'
          console.log('✅ Caption capture started for tab', tabId)
        })
      })

      // Start autosave immediately - this will save transcripts every 15 seconds
      startAutosave(() => getTranscriptText(), () => titleEl.value)

      // Start auto-note generation (every 5 minutes)
      startAutoNotesGeneration()

      // Also trigger an immediate save check after 2 seconds to catch early transcripts
      setTimeout(async () => {
        if (isCapturing && currentUser) {
          const transcriptText = getTranscriptText()
          if (transcriptText.trim().length > 10) {
            console.log('💾 Early save triggered (2 seconds after start)')
            try {
              await saveTranscript(transcriptText, titleEl.value || 'Untitled meeting', true)
              console.log('✅ Early save successful')
            } catch (err) {
              console.error('Early save error (will retry in autosave):', err)
            }
          }
        }
      }, 2000)
    } catch (error) {
      console.error('❌ Error in start button handler:', error)
      const errorMsg = error.message || 'Unknown error'
      statusEl.textContent = `Error: ${errorMsg}. Please try again.`
      statusEl.style.color = 'red'
      await saveCapturingState(false)
      startBtn.disabled = false
      startBtn.style.opacity = '1'
      startBtn.style.cursor = 'pointer'
      stopBtn.disabled = true
      stopBtn.style.opacity = '0.5'
      stopBtn.style.cursor = 'not-allowed'

      // Show error in console for debugging
      console.error('Full error details:', error)
    }
  })

  stopBtn.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('Stop button clicked - event received')

    if (!isCapturing) {
      console.log('Not capturing, ignoring stop click')
      return
    }

    console.log('Processing stop button click...')

    // Final save before stopping
    if (currentUser) {
      const transcriptText = getTranscriptText()
      const title = titleEl.value || 'Untitled meeting'
      if (transcriptText.trim()) {
        try {
          statusEl.textContent = 'Saving final transcript...'
          await saveTranscript(transcriptText, title, false)
          console.log('✅ Final transcript saved before stopping')
          statusEl.textContent = '✓ Final transcript saved'
          statusEl.style.color = 'green'

          // Auto-generate summary from any transcript (no minimum length)
          if (transcriptText.trim().length > 0) {
            console.log('📝 Auto-generating summary...')
            console.log('📝 Transcript length for summary:', transcriptText.trim().length)
            statusEl.textContent = 'Generating summary...'
            // Generate summary in background (don't block UI)
            generateSummary().catch(err => {
              console.error('❌ Summary generation failed:', err)
              // Show error to user for debugging
              if (statusEl) {
                statusEl.textContent = `Summary error: ${err.message || 'Unknown error'}`
                statusEl.style.color = 'orange'
              }
            })
          } else {
            console.log('⚠️ Summary skipped: No transcript content')
          }
        } catch (error) {
          console.error('❌ Error saving final transcript:', error)
          statusEl.textContent = `Save error: ${error.message || 'Unknown error'}`
          statusEl.style.color = 'red'
        }
      }
    }

    // Update UI immediately with proper visual feedback
    await saveCapturingState(false)
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

      try {
        chrome.tabs.sendMessage(tabId, { type: 'ONIX_STOP_CAPTURE' }, (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message
            if (errorMsg.includes('port') || errorMsg.includes('closed') || errorMsg.includes('Extension context invalidated')) {
              // Expected - capture will stop anyway
              statusEl.textContent = 'Capture stopped'
            } else {
              console.error('Error sending stop message:', errorMsg)
              statusEl.textContent = 'Error stopping capture'
            }
          } else {
            statusEl.textContent = 'Capture stopped'
          }
        })
      } catch (err) {
        if (!err.message?.includes('Extension context invalidated')) {
          console.error('Error stopping capture:', err)
        }
        statusEl.textContent = 'Capture stopped'
      }
    })

    stopAutosave()
    stopAutoNotesGeneration()

    // Get meeting URL before clearing
    let meetingURL = ''
    try {
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve)
      })
      if (tabs && tabs[0] && tabs[0].url) {
        meetingURL = tabs[0].url
      }
    } catch (error) {
      console.error('Error getting meeting URL:', error)
    }

    await saveCurrentMeetingDocId(null, meetingURL) // Clear meeting document ID mapping for this URL
    // No automatic download - user must click Download button manually
  })

  saveBtn.addEventListener('click', async () => {
    const transcriptText = getTranscriptText()
    const title = titleEl.value || 'Meeting Transcript'

    if (!transcriptText.trim()) {
      statusEl.textContent = 'No transcript to save'
      statusEl.style.color = 'orange'
      return
    }

    if (!currentUser) {
      statusEl.textContent = 'Please sign in to save'
      statusEl.style.color = 'red'
      return
    }

    statusEl.textContent = 'Saving...'
    statusEl.style.color = ''

    try {
      await saveTranscript(transcriptText, title, false)
      statusEl.textContent = '✓ Transcript saved to Firestore'
      statusEl.style.color = 'green'

      // Also download as backup
      downloadTranscript(transcriptText, title)

      setTimeout(() => {
        if (statusEl.textContent === '✓ Transcript saved to Firestore') {
          statusEl.textContent = ''
        }
      }, 3000)
    } catch (error) {
      console.error('Save failed:', error)
      statusEl.textContent = `Save failed: ${error.message || 'Unknown error'}`
      statusEl.style.color = 'red'

      // Still download as backup
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

  // Paste image button - allows users to paste screenshots they take manually
  if (pasteImageBtn) {
    pasteImageBtn.addEventListener('click', () => {
      console.log('Paste image button clicked')
      // Focus the note input and show instructions
      if (noteInputContainer) {
        noteInputContainer.style.display = 'block'
        if (noteTextInput) {
          noteTextInput.focus()
          noteTextInput.placeholder = 'Paste your screenshot here (Ctrl+V / Cmd+V) or type a note...'
        }
        const statusEl = document.getElementById('status')
        if (statusEl) {
          statusEl.textContent = 'Paste your screenshot image here (Ctrl+V / Cmd+V)'
          statusEl.style.color = '#666'
        }
      }
    })

    // Handle paste events in the note input
    if (noteTextInput) {
      noteTextInput.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault()
            const blob = items[i].getAsFile()
            const reader = new FileReader()
            reader.onload = (event) => {
              const dataUrl = event.target.result
              // Show preview
              if (previewImage) {
                previewImage.src = dataUrl
                imagePreview.style.display = 'block'
              }
              // Store for saving
              const timestamp = Date.now()
              pendingScreenshotDataUrl = {
                screenshotId: `pasted_image_${timestamp}`,
                screenshotUrl: dataUrl,
                thumbnailUrl: dataUrl
              }
              const statusEl = document.getElementById('status')
              if (statusEl) {
                statusEl.textContent = '✓ Image pasted! Add a caption and click Save.'
                statusEl.style.color = 'green'
              }
            }
            reader.readAsDataURL(blob)
            break
          }
        }
      })
    }
  }

  // Save note button (for screenshot with note or text-only note)
  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', async () => {
      const statusEl = document.getElementById('status')
      const saveStatusEl = document.getElementById('saveStatus')

      try {
        const noteText = noteTextInput ? noteTextInput.value.trim() : ''

        if (pendingScreenshotDataUrl) {
          // Save screenshot/image with note
          await saveNoteToFirestore(
            pendingScreenshotDataUrl.screenshotId,
            pendingScreenshotDataUrl.screenshotUrl,
            pendingScreenshotDataUrl.thumbnailUrl,
            noteText
          )

          statusEl.textContent = '✓ Image and note saved'
          statusEl.style.color = 'green'

          if (saveStatusEl) {
            saveStatusEl.textContent = `📷 Note added to meeting`
            saveStatusEl.style.color = '#28a745'
            setTimeout(() => {
              saveStatusEl.textContent = ''
            }, 3000)
          }

          pendingScreenshotDataUrl = null
        } else if (noteText.trim()) {
          // Text-only note (no image)
          await saveTextNoteToFirestore(noteText)

          statusEl.textContent = '✓ Note saved'
          statusEl.style.color = 'green'

          if (saveStatusEl) {
            saveStatusEl.textContent = `📝 Note added to meeting`
            saveStatusEl.style.color = '#17a2b8'
            setTimeout(() => {
              saveStatusEl.textContent = ''
            }, 3000)
          }
        } else {
          // No content to save
          statusEl.textContent = 'Please add an image or text note'
          statusEl.style.color = 'orange'
          return
        }

        // Hide note input and clear
        if (noteInputContainer) {
          noteInputContainer.style.display = 'none'
        }
        if (noteTextInput) {
          noteTextInput.value = ''
          noteTextInput.placeholder = 'Add a caption for this screenshot (optional)...'
        }
        if (imagePreview) {
          imagePreview.style.display = 'none'
        }
        if (previewImage) {
          previewImage.src = ''
        }

      } catch (error) {
        console.error('❌ Error saving note:', error)
        if (statusEl) {
          statusEl.textContent = `Error: ${error.message || 'Unknown error'}`
          statusEl.style.color = 'red'
        }
      }
    })
  }

  // Cancel note button
  if (cancelNoteBtn) {
    cancelNoteBtn.addEventListener('click', () => {
      pendingScreenshotDataUrl = null
      if (noteInputContainer) {
        noteInputContainer.style.display = 'none'
      }
      if (noteTextInput) {
        noteTextInput.value = ''
        noteTextInput.placeholder = 'Add a caption for this screenshot (optional)...'
      }
      if (imagePreview) {
        imagePreview.style.display = 'none'
      }
      if (previewImage) {
        previewImage.src = ''
      }
      const statusEl = document.getElementById('status')
      if (statusEl) {
        statusEl.textContent = ''
      }
    })
  }

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
    auth.onAuthStateChanged(async (u) => {
      currentUser = u
      updateAuthUI()

      // If user is signed in and we're capturing, load the meeting doc ID
      if (u && isCapturing) {
        console.log('User signed in, loading meeting doc ID for current meeting...')
        await loadCurrentMeetingDocId()
        if (currentMeetingDocId) {
          console.log('✅ Restored meeting document ID:', currentMeetingDocId)
        }
      }
    })
  })

  // receive transcript chunks from content script
  chrome.runtime.onMessage.addListener((msg) => {
    try {
      if (!msg || !msg.type) {
        return
      }

      if (msg.type === 'ONIX_MEETING_ENDED') {
        if (isCapturing) {
          // If we were capturing, stop it gracefully first
          stopBtn.click()
        }

        statusEl.textContent = 'Meeting Ended'
        statusEl.style.color = 'orange'

        // Disable controls
        startBtn.disabled = true
        startBtn.style.opacity = '0.5'
        startBtn.style.cursor = 'not-allowed'

        stopBtn.disabled = true
        stopBtn.style.opacity = '0.5'
        stopBtn.style.cursor = 'not-allowed'
      }

      if (msg.type === 'ONIX_TRANSCRIPT_CHUNK' && typeof msg.text === 'string' && msg.text.trim().length > 0) {
        addTranscriptEntry(msg.text, msg.speaker, msg.timestamp, msg.confidence)
      }
      if (msg.type === 'ONIX_TRANSCRIPT_INTERIM' && typeof msg.text === 'string' && msg.text.trim().length > 0) {
        addInterimTranscriptEntry(msg.text, msg.speaker, msg.timestamp)
      }
      if (msg.type === 'ONIX_PARTICIPANTS_FOUND' && Array.isArray(msg.participants)) {
        updateSpeakerDropdown(msg.participants)
      }
      if (msg.type === 'ONIX_TRANSCRIPT_STATUS') {
        if (msg.error) {
          statusEl.textContent = 'Transcription error: ' + msg.error
          updateConnectionStatus('error', 'Error: ' + msg.error)
        }
        if (msg.connected) {
          updateConnectionStatus('connected', 'Connected to AssemblyAI transcription server')
          if (msg.message) {
            statusEl.textContent = msg.message
          }
        }
        if (msg.disconnected) {
          updateConnectionStatus('disconnected', 'Disconnected from server')
        }
        if (msg.fallback) {
          updateConnectionStatus('processing', 'Using Web Speech API')
          statusEl.textContent = msg.message || 'Using Web Speech API for transcription'
        }
        if (msg.started) {
          if (msg.captions || msg.message?.toLowerCase?.().includes('captions')) {
            updateConnectionStatus('processing', 'Processing captions (no audio capture)')
            statusEl.textContent = msg.message || 'Capturing captions...'
          } else if (msg.connected || msg.message?.includes('AssemblyAI')) {
            updateConnectionStatus('processing', 'Processing audio with AssemblyAI...')
            statusEl.textContent = msg.message || 'Capturing and transcribing with AssemblyAI...'
          } else {
            updateConnectionStatus('processing', 'Processing audio with Web Speech API...')
            statusEl.textContent = msg.message || 'Capturing and transcribing...'
          }
          // Ensure UI state is correct when started
          saveCapturingState(true).catch(err => console.error('Error saving capturing state:', err))
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
          saveCapturingState(false).catch(err => console.error('Error saving capturing state:', err))
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
    } catch (error) {
      console.error('Error handling message:', error, msg)
    }
  })
}

// Normalize text for duplicate detection (same as content.js)
function normalizeText(text) {
  return text.toLowerCase().replace(/[.,?!'"\u2019]/g, '').replace(/\s+/g, ' ').trim()
}

// Add transcript entry with speaker identification
function addTranscriptEntry(text, speaker, timestamp, confidence) {
  // Normalize text to check for duplicates
  const normalizedText = normalizeText(text)

  // Check if we've already seen this exact sentence
  if (seenSentences.has(normalizedText)) {
    console.log('⏭️ Skipping duplicate sentence:', text.substring(0, 50))
    return // Don't add duplicate sentences - prevents both display and storage
  }

  // Check for updating the previous sentence (e.g. "Hello" -> "Hello world")
  // instead of creating a new bubble.
  const tsEl = document.getElementById('transcript')
  const lastEntryEl = tsEl.firstElementChild ? tsEl.lastElementChild : null

  if (lastEntryEl && !lastEntryEl.classList.contains('interim')) {
    const lastSpeaker = lastEntryEl.querySelector('.speaker-name')?.textContent.replace(':', '').trim()
    const lastText = lastEntryEl.querySelector('.transcript-text')?.textContent

    if (lastSpeaker === (speaker || 'Unknown') && lastText) {
      const lastNormalized = normalizeText(lastText)

      // Check if new text is an extension of the old text OR old is extension of new
      // (Google sometimes corrects words, so we use a loose 'includes' or Levenshtein, but 'includes' is safer for performance)
      if (normalizedText.includes(lastNormalized) || lastNormalized.includes(normalizedText)) {
        // If new text is shorter, it might be a glitch or correction, but usually we prefer the longer validation?
        // User wants "single transcript even if there is break".
        // Usually updates lengthen the text.

        if (normalizedText.length >= lastNormalized.length) {
          console.log('📝 Updating existing bubble:', text.substring(0, 50))
          // Update the DOM
          lastEntryEl.querySelector('.transcript-text').textContent = text
          // Update the map: remove old key, add new key
          uniqueEntriesMap.delete(lastNormalized)

          // Update logic for the rest of the function:
          // We treat this as "handled". We update the map with the NEW text so future updates find it.
          const transcriptEntry = {
            speaker: speaker || 'Unknown',
            text: text,
            timestamp: timestamp,
            normalizedText: normalizedText
          }
          uniqueEntriesMap.set(normalizedText, transcriptEntry)

          // Update buffer? 
          // We should probably replace the last buffer entry too if possible, but buffer is append-only usually.
          // Let's just push to buffer to be safe for saving?
          // Actually, if we update in place, we should update the buffer to avoid duplicates in the saved file.
          const bufferIdx = transcriptBuffer.findIndex(e => e.normalizedText === lastNormalized)
          if (bufferIdx !== -1) {
            transcriptBuffer[bufferIdx] = transcriptEntry
          } else {
            transcriptBuffer.push(transcriptEntry)
          }

          // Scroll to bottom
          tsEl.scrollTop = tsEl.scrollHeight
          return
        } else {
          // New text is shorter. This happens if "Hello world" becomes "Hello". 
          // Ideally we ignore shorter updates to avoid jitter, UNLESS it's a correction?
          // But "it should show 1 single transcript". 
          // If we implicitly return here, we skip adding a new bubble.
          console.log('⏭️ Skipping shorter update for same sentence')
          return
        }
      }
    }
  }

  // Check if we've already seen this exact sentence (global dedupe)
  if (seenSentences.has(normalizedText)) {
    console.log('⏭️ Skipping duplicate sentence:', text.substring(0, 50))
    return
  }

  // Mark this sentence as seen
  seenSentences.add(normalizedText)

  // Create entry object
  const transcriptEntry = {
    speaker: speaker || 'Unknown',
    text: text,
    timestamp: timestamp,
    normalizedText: normalizedText // Store normalized version for efficient lookup
  }

  // Store in unique entries map (for efficient deduplication during save)
  uniqueEntriesMap.set(normalizedText, transcriptEntry)

  // CRITICAL: Store in memory buffer as backup (only unique entries)
  transcriptBuffer.push(transcriptEntry)

  const transcriptEl = document.getElementById('transcript')

  // Clear placeholder text if it exists
  if (transcriptEl.children.length === 1 && transcriptEl.children[0].classList.contains('muted')) {
    transcriptEl.innerHTML = ''
  }

  // Clear all interim entries when final text is added
  clearInterimEntries()

  // Create DOM transcript entry element
  const domEntry = document.createElement('div')
  domEntry.className = 'transcript-entry'

  const time = new Date(timestamp).toLocaleTimeString()
  const confidenceText = confidence ? ` (${Math.round(confidence * 100)}%)` : ''

  domEntry.innerHTML = `
    <span class="speaker-name">${speaker || 'Unknown'}:</span>
    <span class="transcript-text">${text}</span>
    <span class="timestamp">${time}${confidenceText}</span>
  `

  transcriptEl.appendChild(domEntry)

  // Auto-scroll to bottom
  transcriptEl.scrollTop = transcriptEl.scrollHeight

  // Enable download button when transcript content is available
  const downloadBtn = document.getElementById('downloadBtn')
  if (downloadBtn && !isCapturing) {
    downloadBtn.disabled = false
  }

  // CRITICAL: Save transcript immediately when new entry is added
  if (isCapturing && currentUser && text.trim().length > 5) {
    // Ensure document exists
    if (!currentMeetingDocId) {
      console.log('⚠️ No document ID, creating one now...')
      ensureFirebase().then(async () => {
        if (db && currentUser) {
          try {
            const tabs = await new Promise((resolve) => {
              chrome.tabs.query({ active: true, currentWindow: true }, resolve)
            })
            const meetingURL = tabs[0]?.url || ''
            const docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc()
            currentMeetingDocId = docRef.id
            await saveCurrentMeetingDocId(docRef.id, meetingURL)

            // Initialize document
            await docRef.set({
              title: document.getElementById('title')?.value || 'Untitled meeting',
              transcript: '',
              createdAt: window.firebase.firestore.Timestamp.now(),
              duration: '',
              meetingURL: meetingURL,
              autosave: true,
              updatedAt: window.firebase.firestore.Timestamp.now(),
            }, { merge: true })

            console.log('✅ Created document on first transcript:', docRef.id)

            // Save transcript immediately after document creation
            setTimeout(async () => {
              const transcriptText = getTranscriptText()
              console.log('💾 Immediate save after document creation, transcript length:', transcriptText.length)
              if (transcriptText.trim().length > 0) {
                try {
                  await saveTranscript(transcriptText, document.getElementById('title')?.value || 'Untitled meeting', true)
                  console.log('✅ Immediate save successful')
                } catch (err) {
                  console.error('❌ Immediate save error:', err)
                }
              } else {
                console.error('❌ Cannot save - transcript text is empty!')
              }
            }, 500)
          } catch (error) {
            console.error('Error creating document:', error)
          }
        }
      })
    } else {
      // Document exists - save immediately when we have content
      const totalEntries = transcriptEl.querySelectorAll('.transcript-entry:not(.interim)').length
      if (totalEntries >= 1) { // Save after just 1 entry
        setTimeout(async () => {
          const transcriptText = getTranscriptText()
          if (transcriptText.trim().length > 0 && transcriptText !== lastSavedTranscript) {
            console.log('💾 Immediate save triggered, transcript length:', transcriptText.length)
            try {
              await saveTranscript(transcriptText, document.getElementById('title')?.value || 'Untitled meeting', true)
              lastSavedTranscript = transcriptText.trim()
              console.log('✅ Immediate save successful')
            } catch (err) {
              console.error('❌ Immediate save error:', err)
            }
          }
        }, 500) // Small delay to ensure DOM is updated
      }
    }
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

// Get transcript text for saving - CRITICAL FUNCTION with deduplication
function getTranscriptText() {
  // Use uniqueEntriesMap as the source of truth (most efficient and guaranteed unique)
  // This ensures no duplicates are saved to Firestore even if DOM or buffer has them
  let text = ''
  const seenInOutput = new Set() // Additional safety check during output generation

  if (uniqueEntriesMap.size > 0) {
    // Convert map to array and sort by timestamp to maintain chronological order
    const sortedEntries = Array.from(uniqueEntriesMap.values())
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    sortedEntries.forEach((entry) => {
      const normalized = entry.normalizedText || normalizeText(entry.text)

      // Double-check: skip if we've already added this normalized text
      if (!seenInOutput.has(normalized) && entry.text && entry.text.trim().length > 0) {
        seenInOutput.add(normalized)
        text += `${entry.speaker}: ${entry.text}\n`
      }
    })
  }

  // FALLBACK: If uniqueEntriesMap is empty, try DOM extraction with deduplication
  if (text.trim().length === 0) {
    const transcriptEl = document.getElementById('transcript')
    const seenInDOM = new Set()

    if (transcriptEl) {
      const entries = transcriptEl.querySelectorAll('.transcript-entry:not(.interim)')

      if (entries.length > 0) {
        entries.forEach((entry) => {
          const speakerEl = entry.querySelector('.speaker-name')
          const textEl = entry.querySelector('.transcript-text')

          if (speakerEl && textEl) {
            const speaker = speakerEl.textContent.trim().replace(':', '')
            const transcriptText = textEl.textContent.trim()

            if (transcriptText && transcriptText.length > 0) {
              const normalized = normalizeText(transcriptText)

              // Only add if not seen before
              if (!seenInDOM.has(normalized)) {
                seenInDOM.add(normalized)
                text += `${speaker}: ${transcriptText}\n`
              }
            }
          }
        })
      }
    }

    // LAST FALLBACK: Use memory buffer with deduplication
    if (text.trim().length === 0 && transcriptBuffer.length > 0) {
      console.warn('⚠️ DOM extraction failed, using memory buffer with deduplication')
      const seenInBuffer = new Set()

      transcriptBuffer.forEach(entry => {
        const normalized = entry.normalizedText || normalizeText(entry.text)
        if (!seenInBuffer.has(normalized) && entry.text && entry.text.trim().length > 0) {
          seenInBuffer.add(normalized)
          text += `${entry.speaker}: ${entry.text}\n`
        }
      })
    }
  }

  const result = text.trim()

  // CRITICAL: Log what we're extracting
  if (result.length > 0) {
    const uniqueCount = seenInOutput.size || uniqueEntriesMap.size
    console.log(`✅ getTranscriptText: ${result.length} chars extracted from ${uniqueCount} unique entries`)
    console.log(`📄 Preview: ${result.substring(0, 150)}...`)
  } else {
    console.error('❌❌❌ getTranscriptText: RESULT IS EMPTY!')
    const transcriptEl = document.getElementById('transcript')
    console.error('  Unique entries map:', uniqueEntriesMap.size)
    console.error('  DOM entries:', transcriptEl ? transcriptEl.querySelectorAll('.transcript-entry:not(.interim)').length : 0)
    console.error('  Buffer entries:', transcriptBuffer.length)
  }

  return result
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
  lastSavedTranscript = '' // Reset when starting new capture
  lastSaveTime = 0
  transcriptBuffer = [] // Reset buffer when starting new capture
  seenSentences.clear() // Reset duplicate tracking
  uniqueEntriesMap.clear() // Reset unique entries map
  console.log('Starting autosave timer (every 15 seconds for faster saves)')
  autosaveTimer = setInterval(async () => {
    console.log('🔄 Autosave triggered - checking conditions...')
    if (!currentUser) {
      console.log('⚠️ Autosave skipped: No current user')
      return
    }
    if (!isCapturing) {
      console.log('⚠️ Autosave skipped: Not capturing')
      return
    }

    // Ensure Firebase is initialized
    const firebaseReady = await ensureFirebase()
    if (!firebaseReady) {
      console.error('❌ Autosave skipped: Firebase not ready')
      return
    }

    // Ensure meeting doc ID is loaded - CRITICAL for saving
    if (!currentMeetingDocId) {
      console.log('⚠️ Autosave: No meeting doc ID, loading from storage...')
      await loadCurrentMeetingDocId()
      if (!currentMeetingDocId) {
        console.error('❌ Autosave skipped: No meeting document ID available - cannot save!')
        console.error('  This usually means Start Capture was not clicked or document was not created')
        return
      }
      console.log('✅ Autosave: Loaded meeting doc ID:', currentMeetingDocId)
    }

    const text = getText()
    const textLength = text ? text.length : 0
    console.log('📝 Autosave: getTranscriptText() returned length:', textLength)

    if (!text || !text.trim()) {
      console.log('⚠️ Autosave skipped: No transcript text (empty or whitespace only)')
      console.log('🔍 Debug: Checking DOM state...')
      const transcriptEl = document.getElementById('transcript')
      if (transcriptEl) {
        const allEntries = transcriptEl.querySelectorAll('.transcript-entry')
        console.log('  - Total transcript entries:', allEntries.length)
        allEntries.forEach((entry, idx) => {
          const textEl = entry.querySelector('.transcript-text')
          console.log(`  - Entry ${idx}:`, {
            isInterim: entry.classList.contains('interim'),
            hasText: !!textEl,
            textLength: textEl ? textEl.textContent.length : 0,
            preview: textEl ? textEl.textContent.substring(0, 50) : 'N/A'
          })
        })
      }
      return
    }

    // Only save if transcript has changed (efficiency optimization)
    const textTrimmed = text.trim()
    if (textTrimmed === lastSavedTranscript) {
      console.log('⚠️ Autosave skipped: Transcript unchanged since last save')
      return
    }

    // Also check if we saved very recently (within 3 seconds) to avoid rapid saves
    const now = Date.now()
    if (now - lastSaveTime < 3000) {
      console.log('⚠️ Autosave skipped: Saved too recently')
      return
    }

    console.log('💾 Autosave: Saving transcript, length:', textLength, 'docId:', currentMeetingDocId)
    console.log('📄 Transcript preview (first 300 chars):', text.substring(0, 300))
    const statusEl = document.getElementById('status')
    const oldStatus = statusEl ? statusEl.textContent : ''

    try {
      console.log('🚀 Calling saveTranscript with:', {
        textLength: text.length,
        title: getTitle(),
        isAutosave: true,
        currentMeetingDocId: currentMeetingDocId,
        currentUser: currentUser ? currentUser.uid : 'none'
      })
      await saveTranscript(text, getTitle(), true)
      lastSavedTranscript = textTrimmed
      lastSaveTime = now
      console.log('✅✅✅ Autosave: Successfully saved transcript to Firestore')

      // Show brief success message
      if (statusEl) {
        statusEl.textContent = '✓ Auto-saved to Firestore'
        statusEl.style.color = 'green'
        setTimeout(() => {
          if (statusEl.textContent === '✓ Auto-saved to Firestore') {
            statusEl.textContent = oldStatus || ''
            statusEl.style.color = ''
          }
        }, 2000)
      }
    } catch (error) {
      console.error('❌❌❌ Autosave error:', error)
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      })
      if (statusEl) {
        statusEl.textContent = `Save error: ${error.message || 'Unknown error'}`
        statusEl.style.color = 'red'
      }
      // Don't let autosave errors break the interval
    }
  }, 15000) // Save every 15 seconds instead of 30
  console.log('✅ Autosave timer started (will save every 15 seconds)')
}

function stopAutosave() {
  if (autosaveTimer) clearInterval(autosaveTimer)
  autosaveTimer = undefined
}

// Start auto-note generation (every 5 minutes)
function startAutoNotesGeneration() {
  stopAutoNotesGeneration()
  lastNotesGenerationTime = 0
  console.log('Starting auto-notes generation timer (every 2 minutes)')

  autoNotesTimer = setInterval(async () => {
    if (!isCapturing || !currentUser || !currentMeetingDocId) {
      console.log('⚠️ Auto-notes skipped: Not capturing or no user/doc')
      return
    }

    const transcriptText = getTranscriptText()
    console.log('📝 Auto-notes check - transcript length:', transcriptText ? transcriptText.length : 0)

    // No minimum length requirement - generate notes from any transcript
    if (!transcriptText || transcriptText.trim().length === 0) {
      console.log('⚠️ Auto-notes skipped: No transcript content')
      return
    }

    // No time limit - generate notes every interval if there's any content
    console.log('📝 Auto-generating notes from transcript...')
    console.log('📝 Transcript length:', transcriptText.length)
    lastNotesGenerationTime = Date.now()

    try {
      await generateAutoNotes(transcriptText)
      console.log('✅ Auto-notes generation completed')
    } catch (error) {
      console.error('❌ Error in auto-notes generation:', error)
      // Show error in status for debugging
      const statusEl = document.getElementById('status')
      if (statusEl) {
        statusEl.textContent = `Notes error: ${error.message || 'Unknown error'}`
        statusEl.style.color = 'orange'
        setTimeout(() => {
          if (statusEl.textContent.includes('Notes error')) {
            statusEl.textContent = ''
          }
        }, 5000)
      }
    }
  }, 2 * 60 * 1000) // Every 2 minutes

  console.log('✅ Auto-notes timer started (will generate every 2 minutes)')
}

function stopAutoNotesGeneration() {
  if (autoNotesTimer) clearInterval(autoNotesTimer)
  autoNotesTimer = undefined
}

// Generate automatic notes from transcript
async function generateAutoNotes(transcriptText) {
  if (!currentUser || !currentMeetingDocId) {
    return
  }

  try {
    // Get existing notes to provide context
    await ensureFirebase()
    if (!db) {
      throw new Error('Firebase not initialized')
    }

    const docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc(currentMeetingDocId)
    const docSnap = await docRef.get()

    if (!docSnap.exists) {
      return
    }

    const existingData = docSnap.data()
    const existingNotes = existingData.notes || []

    // Get recent transcript (last 2000 chars for context)
    const recentTranscript = transcriptText.length > 2000
      ? transcriptText.substring(transcriptText.length - 2000)
      : transcriptText

    // Get Firebase auth token
    const token = await currentUser.getIdToken()

    // Call API to generate notes
    const dashboardUrl = 'http://localhost:3000' // TODO: Make this configurable
    console.log('📝 Calling notes API:', `${dashboardUrl}/api/extension-meetings/generate-notes`)
    console.log('📝 Meeting ID:', currentMeetingDocId)
    console.log('📝 Transcript length:', recentTranscript.length)

    const response = await fetch(`${dashboardUrl}/api/extension-meetings/generate-notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        meetingId: currentMeetingDocId,
        transcript: recentTranscript,
        timestamp: window.firebase.firestore.Timestamp.now(),
        previousNotes: existingNotes.slice(-5) // Last 5 notes for context
      })
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` }
      }
      console.error('❌ Notes API error:', errorData)
      throw new Error(errorData.error || `Failed to generate notes: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    console.log('📝 Notes API response:', result)

    if (result.notes && result.notes.length > 0) {
      console.log(`📝 Received ${result.notes.length} notes from API:`, result.notes)

      // Add generated notes to existing notes (merge, don't replace)
      const updatedNotes = [...existingNotes, ...result.notes]

      console.log(`📝 Total notes after merge: ${updatedNotes.length} (${existingNotes.length} existing + ${result.notes.length} new)`)

      // Update document with new notes
      await docRef.update({
        notes: updatedNotes,
        updatedAt: window.firebase.firestore.Timestamp.now()
      })

      console.log(`✅ Auto-generated ${result.notes.length} notes and saved to Firestore`)
      console.log(`📊 Note types:`, result.notes.map(n => n.type || 'unknown'))

      // Show subtle notification
      const saveStatusEl = document.getElementById('saveStatus')
      if (saveStatusEl) {
        const noteTypes = result.notes.map(n => {
          if (n.type === 'concept') return '💡'
          if (n.type === 'definition') return '📖'
          if (n.type === 'point') return '⭐'
          if (n.type === 'example') return '📚'
          if (n.type === 'question') return '❓'
          return '📝'
        }).join(' ')
        saveStatusEl.textContent = `📝 Auto-generated ${result.notes.length} note(s) ${noteTypes}`
        saveStatusEl.style.color = '#17a2b8'
        setTimeout(() => {
          if (saveStatusEl.textContent.includes('Auto-generated')) {
            saveStatusEl.textContent = ''
          }
        }, 5000)
      }
    } else {
      console.warn('⚠️ No notes returned from API')
    }

  } catch (error) {
    console.error('❌ Error generating auto-notes:', error)
    console.error('❌ Full error details:', {
      message: error.message,
      stack: error.stack,
      meetingId: currentMeetingDocId,
      hasUser: !!currentUser
    })

    // Show error in status for debugging
    const statusEl = document.getElementById('status')
    if (statusEl) {
      const errorMsg = error.message || 'Unknown error'
      if (errorMsg.includes('fetch') || errorMsg.includes('Failed to fetch')) {
        statusEl.textContent = '⚠️ Notes: Dashboard not running? Check console for details'
        statusEl.style.color = 'orange'
      } else {
        statusEl.textContent = `⚠️ Notes error: ${errorMsg}`
        statusEl.style.color = 'orange'
      }
      setTimeout(() => {
        if (statusEl.textContent.includes('Notes')) {
          statusEl.textContent = ''
        }
      }, 8000)
    }
  }
}

async function saveTranscript(text, title, isAutosave = false) {
  if (!currentUser) {
    console.error('❌ saveTranscript: No current user')
    const statusEl = document.getElementById('status')
    if (statusEl) {
      statusEl.textContent = 'Error: Please sign in to save transcripts'
      statusEl.style.color = 'red'
    }
    throw new Error('No current user - please sign in')
  }

  if (!text || !text.trim()) {
    console.log('⚠️ saveTranscript: No text to save (empty or whitespace)')
    return // Don't throw error for empty text, just skip
  }

  // Ensure Firebase is initialized
  const firebaseReady = await ensureFirebase()
  if (!firebaseReady || !db) {
    const error = 'Firebase not initialized'
    console.error('❌ saveTranscript:', error)
    throw new Error(error)
  }

  // Get meeting URL first (needed for document lookup)
  let meetingURL = ''
  try {
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    })
    if (tabs && tabs[0] && tabs[0].url) {
      meetingURL = tabs[0].url
    }
  } catch (error) {
    console.error('Error getting meeting URL:', error)
  }

  // Load meeting doc ID from storage - CRITICAL
  await loadCurrentMeetingDocId()

  // Use existing document ID or find/create one
  let docRef

  if (currentMeetingDocId) {
    docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc(currentMeetingDocId)
    console.log('✅ Using existing meeting document:', currentMeetingDocId)
  } else {
    // No document ID yet - try to find or create one
    console.log('⚠️ No meeting document ID, creating/finding one...')

    if (meetingURL) {
      try {
        const meetingsRef = db.collection('users').doc(currentUser.uid).collection('meetings')
        const allMeetings = await meetingsRef.get()
        let foundDoc = null

        allMeetings.forEach(doc => {
          const data = doc.data()
          if (data.meetingURL === meetingURL) {
            const time = data.createdAt?.toDate() || new Date(0)
            const now = new Date()
            // If created in last 2 hours, use it
            if ((now - time) < 2 * 60 * 60 * 1000) {
              foundDoc = doc
            }
          }
        })

        if (foundDoc) {
          currentMeetingDocId = foundDoc.id
          docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc(foundDoc.id)
          await saveCurrentMeetingDocId(foundDoc.id, meetingURL)
          console.log('✅ Found existing meeting document for URL:', meetingURL, '->', foundDoc.id)
        }
      } catch (error) {
        console.error('Error finding existing meeting:', error)
      }
    }

    // If still no docRef, create new
    if (!docRef) {
      docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc()
      currentMeetingDocId = docRef.id
      await saveCurrentMeetingDocId(docRef.id, meetingURL)
      console.log('✅ Created new meeting document on first save:', docRef.id, 'for URL:', meetingURL)
    }
  }

  // Get existing data to preserve createdAt
  let existingData = null
  try {
    const docSnap = await docRef.get()
    if (docSnap.exists) {
      existingData = docSnap.data()
      console.log('Existing document found, preserving createdAt:', existingData.createdAt)
    }
  } catch (error) {
    console.error('Error reading document:', error)
  }

  // Save transcript with better error handling
  try {
    const trimmedText = text.trim()
    if (!trimmedText || trimmedText.length === 0) {
      console.error('❌❌❌ CRITICAL: Cannot save - transcript text is EMPTY!')
      console.error('  Input text length:', text.length)
      console.error('  Trimmed length:', trimmedText.length)
      console.error('  This should never happen if getTranscriptText() is working')
      return
    }

    // CRITICAL: Verify we have actual text content
    if (trimmedText.length < 5) {
      console.warn('⚠️ Transcript is very short, but saving anyway:', trimmedText.length, 'chars')
    }

    // Preserve existing summary, actionItems, and notes if they exist
    const saveData = {
      title: title || 'Untitled meeting',
      transcript: trimmedText, // THE ACTUAL TRANSCRIPT TEXT - THIS MUST BE SAVED
      createdAt: existingData?.createdAt || window.firebase.firestore.Timestamp.now(),
      duration: '',
      meetingURL: meetingURL || '',
      autosave: !!isAutosave,
      updatedAt: window.firebase.firestore.Timestamp.now(),
    }

    // Preserve summary, actionItems, and notes if they exist (don't overwrite)
    if (existingData?.summary) {
      saveData.summary = existingData.summary
    }
    if (existingData?.actionItems) {
      saveData.actionItems = existingData.actionItems
    }
    if (existingData?.notes) {
      saveData.notes = existingData.notes
    }

    console.log('💾💾💾 SAVING TRANSCRIPT TO FIRESTORE:', {
      docId: docRef.id,
      transcriptLength: saveData.transcript.length,
      transcriptPreview: saveData.transcript.substring(0, 150),
      path: `users/${currentUser.uid}/meetings/${docRef.id}`
    })

    // CRITICAL: Use set() with merge to ensure transcript field is written
    await docRef.set(saveData, { merge: true })
    console.log('✅ Firestore set() completed, verifying...')

    // Verify the save worked - CRITICAL CHECK
    const verifyDoc = await docRef.get()
    if (!verifyDoc.exists) {
      throw new Error('Document does not exist after save!')
    }

    const savedData = verifyDoc.data()
    const savedLength = savedData.transcript?.length || 0

    console.log('🔍 Verification:', {
      savedLength: savedLength,
      expectedLength: saveData.transcript.length,
      match: savedLength === saveData.transcript.length
    })

    if (savedLength === 0 && saveData.transcript.length > 0) {
      console.error('❌❌❌ CRITICAL: Transcript field is EMPTY after save!')
      console.error('  Expected:', saveData.transcript.length, 'chars')
      console.error('  Got:', savedLength, 'chars')
      console.error('  Document data:', savedData)
      throw new Error('Transcript was not saved - field is empty!')
    }

    if (savedLength < saveData.transcript.length * 0.9) {
      console.warn('⚠️ WARNING: Saved transcript is shorter than expected')
      console.warn('  Expected:', saveData.transcript.length)
      console.warn('  Got:', savedLength)
    }

    console.log('✅✅✅ TRANSCRIPT SAVED SUCCESSFULLY! Length:', savedLength)

    // Update last saved transcript for efficiency
    if (isAutosave) {
      lastSavedTranscript = text.trim()
      lastSaveTime = Date.now()
    }
  } catch (error) {
    console.error('❌ Error saving to Firestore:', error)
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    })

    // Show user-friendly error
    const statusEl = document.getElementById('status')
    if (statusEl) {
      statusEl.textContent = `Save failed: ${error.message || 'Unknown error'}`
      statusEl.style.color = 'red'
    }

    throw error
  }
}

// Capture screenshot using html2canvas only (no Chrome API - more reliable)
async function captureScreenshot() {
  if (!currentUser) {
    const statusEl = document.getElementById('status')
    if (statusEl) {
      statusEl.textContent = 'Please sign in to capture screenshots'
      statusEl.style.color = 'red'
    }
    return
  }

  // If no meeting document exists, create one on the fly
  if (!currentMeetingDocId) {
    const statusEl = document.getElementById('status')
    statusEl.textContent = 'Creating meeting document...'
    statusEl.style.color = '#666'

    try {
      await ensureFirebase()
      if (!db) {
        throw new Error('Firebase not initialized')
      }

      // Get meeting URL
      let meetingURL = ''
      try {
        const tabs = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        })
        if (tabs && tabs[0] && tabs[0].url) {
          meetingURL = tabs[0].url
        }
      } catch (error) {
        console.error('Error getting meeting URL:', error)
      }

      // Create new meeting document
      const meetingTitle = document.getElementById('title')?.value || 'Untitled meeting'
      const docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc()
      currentMeetingDocId = docRef.id

      // Initialize document
      await docRef.set({
        title: meetingTitle,
        transcript: '',
        createdAt: window.firebase.firestore.Timestamp.now(),
        duration: '',
        meetingURL: meetingURL,
        autosave: false,
        notes: [],
        updatedAt: window.firebase.firestore.Timestamp.now(),
      }, { merge: true })

      await saveCurrentMeetingDocId(docRef.id, meetingURL)
      console.log('✅ Meeting document created for screenshot:', currentMeetingDocId)

      statusEl.textContent = 'Ready to capture screenshot...'
      statusEl.style.color = '#666'
    } catch (error) {
      console.error('❌ Error creating meeting document:', error)
      if (statusEl) {
        statusEl.textContent = 'Error: Could not create meeting document. Please try starting capture first.'
        statusEl.style.color = 'red'
      }
      return
    }
  }

  const statusEl = document.getElementById('status')
  const saveStatusEl = document.getElementById('saveStatus')

  try {
    statusEl.textContent = 'Capturing screenshot... (this may take up to 30 seconds)'
    statusEl.style.color = '#666'

    // Get active tab and verify it's a meeting page
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    })

    if (!tabs || !tabs[0] || !tabs[0].id) {
      throw new Error('No active tab found')
    }

    const tab = tabs[0]
    const tabId = tab.id
    const tabUrl = tab.url || ''

    // Verify we're on a meeting page
    if (!tabUrl.includes('meet.google.com') && !tabUrl.includes('zoom.us')) {
      throw new Error('Please navigate to a Google Meet or Zoom meeting page first')
    }

    // Capture screenshot via content script using html2canvas ONLY (no Chrome API fallback)
    const dataUrl = await new Promise((resolve, reject) => {
      let timeoutId = null
      let isResolved = false

      // Set up listener for screenshot response
      const messageListener = (msg, sender, sendResponse) => {
        if (msg.type === 'ONIX_SCREENSHOT_RESPONSE') {
          if (isResolved) return // Already handled
          isResolved = true

          // Clear timeout if response received
          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }

          chrome.runtime.onMessage.removeListener(messageListener)

          if (msg.dataUrl) {
            resolve(msg.dataUrl)
          } else {
            reject(new Error(msg.error || 'Failed to capture screenshot'))
          }
        }
      }
      chrome.runtime.onMessage.addListener(messageListener)

      // Request screenshot from content script (html2canvas only - no fallback)
      chrome.tabs.sendMessage(tabId, {
        type: 'ONIX_CAPTURE_SCREENSHOT',
        tabId: tabId
      }, (response) => {
        if (chrome.runtime.lastError) {
          if (isResolved) return
          isResolved = true

          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }

          chrome.runtime.onMessage.removeListener(messageListener)
          const errorMsg = chrome.runtime.lastError.message
          if (errorMsg.includes('Extension context invalidated')) {
            reject(new Error('Extension was reloaded. Please refresh the page and try again.'))
          } else if (errorMsg.includes('Receiving end does not exist')) {
            reject(new Error('Please make sure you are on a Google Meet or Zoom meeting page and the extension is active.'))
          } else {
            reject(new Error(`Screenshot error: ${errorMsg}`))
          }
          return
        }

        // Response will come via ONIX_SCREENSHOT_RESPONSE message
        // Set timeout in case response never comes (30 seconds for complex pages)
        timeoutId = setTimeout(() => {
          if (isResolved) return
          isResolved = true

          chrome.runtime.onMessage.removeListener(messageListener)
          reject(new Error('Screenshot capture timed out. Try using "Paste Image" button instead - take a screenshot manually (Windows: Win+Shift+S, Mac: Cmd+Shift+4) and paste it here.'))
        }, 30000) // 30 second timeout
      })
    })

    console.log('✅ Screenshot captured, uploading to Firebase Storage...')
    statusEl.textContent = 'Uploading screenshot...'

    // Convert data URL to blob
    const response = await fetch(dataUrl)
    const blob = await response.blob()

    // Upload to Firebase Storage
    await ensureFirebase()
    if (!storage) {
      // If storage is not available, save screenshot as base64 in Firestore instead
      console.warn('⚠️ Firebase Storage not available, saving screenshot as base64 in Firestore')
      // Save directly to Firestore notes with data URL
      await saveNoteToFirestore(screenshotId, dataUrl, dataUrl, noteTextInput?.value || '', 'screenshot')
      statusEl.textContent = '✓ Screenshot saved (as base64)'
      statusEl.style.color = 'green'
      if (noteInputContainer) {
        noteInputContainer.style.display = 'none'
      }
      return
    }

    const timestamp = Date.now()
    const screenshotId = `screenshot_${timestamp}`
    const storageRef = storage.ref()
    const screenshotRef = storageRef.child(`users/${currentUser.uid}/meetings/${currentMeetingDocId}/screenshots/${screenshotId}.png`)

    // Upload screenshot
    const uploadTask = screenshotRef.put(blob)
    await new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          console.log(`Upload progress: ${progress.toFixed(1)}%`)
        },
        (error) => {
          console.error('Upload error:', error)
          reject(error)
        },
        () => {
          resolve()
        }
      )
    })

    // Get download URL
    const screenshotUrl = await screenshotRef.getDownloadURL()
    console.log('✅ Screenshot uploaded:', screenshotUrl)

    // Create thumbnail (simple approach: use same image for now, can optimize later)
    const thumbnailUrl = screenshotUrl

    // Show note input UI for student-style note-taking
    pendingScreenshotDataUrl = {
      screenshotId,
      screenshotUrl,
      thumbnailUrl
    }

    if (noteInputContainer && noteTextInput) {
      noteInputContainer.style.display = 'block'
      noteTextInput.value = ''
      noteTextInput.focus()
      // Show preview
      if (previewImage) {
        previewImage.src = screenshotUrl
        imagePreview.style.display = 'block'
      }
      statusEl.textContent = 'Add a caption for this screenshot (optional)'
      statusEl.style.color = '#666'
    } else {
      // If note input UI not available, save immediately without caption
      await saveNoteToFirestore(screenshotId, screenshotUrl, thumbnailUrl, '')
    }

  } catch (error) {
    console.error('❌ Error capturing screenshot:', error)
    const errorMsg = error.message || 'Unknown error'

    // Show error in status element
    if (statusEl) {
      statusEl.textContent = `Screenshot error: ${errorMsg}`
      statusEl.style.color = 'red'

      // Also show in saveStatus for visibility
      const saveStatusEl = document.getElementById('saveStatus')
      if (saveStatusEl) {
        saveStatusEl.textContent = `❌ ${errorMsg}`
        saveStatusEl.style.color = 'red'
      }
    }

    pendingScreenshotDataUrl = null
    if (noteInputContainer) {
      noteInputContainer.style.display = 'none'
    }

    // Log full error for debugging
    console.error('Full screenshot error details:', error)
  }
}

// Save note to Firestore (helper function)
async function saveNoteToFirestore(screenshotId, screenshotUrl, thumbnailUrl, noteText) {
  if (!currentUser || !currentMeetingDocId) {
    throw new Error('User not signed in or meeting not started')
  }

  await ensureFirebase()
  if (!db) {
    throw new Error('Firebase not initialized')
  }

  const note = {
    id: screenshotId,
    timestamp: window.firebase.firestore.Timestamp.now(),
    screenshotUrl: screenshotUrl,
    screenshotThumbnail: thumbnailUrl,
    text: noteText || '',
    type: 'screenshot', // Mark as manual screenshot note
    createdAt: window.firebase.firestore.Timestamp.now()
  }

  // Get existing document
  const docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc(currentMeetingDocId)
  const docSnap = await docRef.get()

  if (!docSnap.exists) {
    throw new Error('Meeting document not found')
  }

  const existingData = docSnap.data()
  const existingNotes = existingData.notes || []

  // Add new note
  existingNotes.push(note)

  // Update document with notes array
  await docRef.update({
    notes: existingNotes,
    updatedAt: window.firebase.firestore.Timestamp.now()
  })

  console.log('✅ Note saved to Firestore with screenshot')
  return note
}

// Save text-only note to Firestore
async function saveTextNoteToFirestore(noteText) {
  if (!currentUser || !currentMeetingDocId) {
    throw new Error('User not signed in or meeting not started')
  }

  await ensureFirebase()
  if (!db) {
    throw new Error('Firebase not initialized')
  }

  const note = {
    id: `text_note_${Date.now()}`,
    timestamp: window.firebase.firestore.Timestamp.now(),
    text: noteText,
    type: 'text', // Mark as text-only note
    createdAt: window.firebase.firestore.Timestamp.now()
  }

  // Get existing document
  const docRef = db.collection('users').doc(currentUser.uid).collection('meetings').doc(currentMeetingDocId)
  const docSnap = await docRef.get()

  if (!docSnap.exists) {
    throw new Error('Meeting document not found')
  }

  const existingData = docSnap.data()
  const existingNotes = existingData.notes || []

  // Add new note
  existingNotes.push(note)

  // Update document with notes array
  await docRef.update({
    notes: existingNotes,
    updatedAt: window.firebase.firestore.Timestamp.now()
  })

  console.log('✅ Text note saved to Firestore')
  return note
}

// Generate summary using AssemblyAI API
async function generateSummary() {
  if (!currentUser) {
    const statusEl = document.getElementById('status')
    if (statusEl) {
      statusEl.textContent = 'Please sign in to generate summary'
      statusEl.style.color = 'red'
    }
    return
  }

  if (!currentMeetingDocId) {
    const statusEl = document.getElementById('status')
    if (statusEl) {
      statusEl.textContent = 'Please start a meeting capture first'
      statusEl.style.color = 'orange'
    }
    return
  }

  const statusEl = document.getElementById('status')
  const saveStatusEl = document.getElementById('saveStatus')

  try {
    statusEl.textContent = 'Generating summary...'
    statusEl.style.color = '#666'

    // Get transcript (no character limit for testing)
    const transcriptText = getTranscriptText()
    if (!transcriptText || transcriptText.trim().length === 0) {
      statusEl.textContent = 'No transcript content to generate summary'
      statusEl.style.color = 'orange'
      return
    }

    // Get Firebase auth token
    const token = await currentUser.getIdToken()

    // Call API to generate summary (use relative URL - will work with dashboard)
    // For extension, we need to determine the dashboard URL
    // You can set this in extension settings or use a default
    const dashboardUrl = 'http://localhost:3000' // TODO: Make this configurable
    let response
    try {
      response = await fetch(`${dashboardUrl}/api/extension-meetings/generate-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          meetingId: currentMeetingDocId,
          transcript: transcriptText
        })
      })
    } catch (fetchError) {
      console.error('❌ Fetch error:', fetchError)
      const errorMsg = fetchError.message || 'Network error. Make sure the dashboard is running at ' + dashboardUrl
      console.error('❌ Dashboard URL:', dashboardUrl)
      console.error('❌ Full error:', fetchError)
      throw new Error('Failed to fetch: ' + errorMsg + '. Is the dashboard running at ' + dashboardUrl + '?')
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` }
      }
      throw new Error(errorData.error || `Failed to generate summary: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()

    console.log('✅ Summary generated:', result)
    statusEl.textContent = '✓ Summary generated successfully'
    statusEl.style.color = 'green'

    if (saveStatusEl) {
      saveStatusEl.textContent = `🤖 Summary and action items updated`
      saveStatusEl.style.color = '#6f42c1'
      setTimeout(() => {
        saveStatusEl.textContent = ''
      }, 5000)
    }

  } catch (error) {
    console.error('❌ Error generating summary:', error)
    console.error('❌ Full error details:', {
      message: error.message,
      stack: error.stack,
      meetingId: currentMeetingDocId,
      hasUser: !!currentUser,
      transcriptLength: getTranscriptText().length
    })

    if (statusEl) {
      const errorMsg = error.message || 'Unknown error'
      if (errorMsg.includes('fetch') || errorMsg.includes('Failed to fetch')) {
        statusEl.textContent = '⚠️ Summary: Dashboard not running? Check console for details'
        statusEl.style.color = 'orange'
      } else {
        statusEl.textContent = `Summary error: ${errorMsg}`
        statusEl.style.color = 'red'
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded event fired')
  try {
    // Load persisted meeting document ID on startup (based on current meeting URL)
    await loadCurrentMeetingDocId()
    if (currentMeetingDocId) {
      console.log('✅ Loaded meeting document ID from storage:', currentMeetingDocId)
    } else {
      console.log('No meeting document ID found in storage (new meeting or panel refresh)')
    }
    initUI()
    console.log('initUI called')
  } catch (error) {
    console.error('Error in DOMContentLoaded:', error)
  }
})

// Also try to initialize if DOM is already loaded
if (document.readyState === 'loading') {
  // DOM is still loading, wait for DOMContentLoaded
  console.log('DOM is still loading, waiting for DOMContentLoaded')
} else {
  // DOM is already loaded
  console.log('DOM already loaded, initializing immediately')
  loadCurrentMeetingDocId().then(() => {
    if (currentMeetingDocId) {
      console.log('✅ Loaded meeting document ID:', currentMeetingDocId)
    }
    initUI()
  }).catch(err => {
    console.error('Error initializing:', err)
  })
}

// Connect to content script to hide the 'Open Onix' button while side panel is open
// And maintain connection to know when to show it back
function maintainButtonVisibilityConnection() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id
    if (tabId) {
      try {
        const port = chrome.tabs.connect(tabId, { name: 'onix-sidepanel-connection' })
        // Port doesn't need to do anything, just exist
        // When sidepanel closes, port disconnects -> content script shows button
        port.onDisconnect.addListener(() => {
          // Expected when tab refreshes or closes, or sidepanel closes
          // If tab refreshed while sidepanel open, we might want to reconnect?
          // We can listen to chrome.tabs.onUpdated to reconnect.
        })
      } catch (e) {
        console.log('Could not connect to content script (may not be a meeting page)', e)
      }
    }
  })
}

// Initial connection
maintainButtonVisibilityConnection()

// Reconnect if the user refreshes the page while side panel is open
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    maintainButtonVisibilityConnection()
  }
})



