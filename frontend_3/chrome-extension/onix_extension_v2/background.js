chrome.runtime.onInstalled.addListener(() => {
  // Disable side panel globally by default to ensure it auto-closes on non-meeting tabs
  chrome.sidePanel.setOptions({ enabled: false }).catch(() => { })
})

// Also disable globally on startup in case it wasn't caught by onInstalled
chrome.sidePanel.setOptions({ enabled: false }).catch(() => { })

// Helper function to capture tab audio
function captureTabAudio(tabId, sendResponse) {
  console.log(`═══════════════════════════════════════════════════════`)
  console.log(`🎤 TAB CAPTURE REQUEST`)
  console.log(`═══════════════════════════════════════════════════════`)
  console.log(`📋 Tab ID: ${tabId}`)

  // Verify tab exists and get its URL
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error('❌ Error getting tab:', chrome.runtime.lastError.message)
      sendResponse({
        error: `Cannot access tab: ${chrome.runtime.lastError.message}`,
        details: chrome.runtime.lastError.message
      })
      return
    }

    if (!tab) {
      console.error('❌ Tab not found')
      sendResponse({
        error: 'Tab not found. Please make sure you are on a meeting page.',
        details: 'Tab does not exist'
      })
      return
    }

    const tabUrl = tab.url || ''
    console.log(`🌐 Tab URL: ${tabUrl}`)

    // Check if it's a Chrome internal page (cannot be captured)
    if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://') || tabUrl.startsWith('chrome-search://')) {
      console.error('❌ Cannot capture Chrome internal pages')
      sendResponse({
        error: 'Chrome pages cannot be captured. Please navigate to a Google Meet or Zoom meeting page.',
        details: `Current URL: ${tabUrl}`
      })
      return
    }

    // Verify it's a meeting page
    const isMeet = tabUrl.startsWith('https://meet.google.com/')
    const isZoom = tabUrl.includes('.zoom.us/')

    if (!isMeet && !isZoom) {
      console.warn('⚠️ Not a meeting page:', tabUrl)
      sendResponse({
        error: 'Please navigate to a Google Meet or Zoom meeting page first.',
        details: `Current URL: ${tabUrl}`
      })
      return
    }

    console.log(`✅ Valid meeting page detected: ${isMeet ? 'Google Meet' : 'Zoom'}`)

    // First, make sure the tab is active (tabCapture requires active tab)
    chrome.tabs.update(tabId, { active: true }, () => {
      if (chrome.runtime.lastError) {
        console.warn('⚠️ Could not activate tab:', chrome.runtime.lastError.message)
      } else {
        console.log('✅ Tab activated')
      }

      // Small delay to ensure tab is active
      setTimeout(() => {
        // Check if tabCapture API is available
        console.log('🔍 Checking tabCapture API availability...')
        console.log('chrome.tabCapture exists:', !!chrome.tabCapture)

        if (chrome.tabCapture) {
          console.log('✅ chrome.tabCapture object exists')
          console.log('Available methods on chrome.tabCapture:', Object.keys(chrome.tabCapture))
          console.log('chrome.tabCapture.capture:', chrome.tabCapture.capture)
          console.log('chrome.tabCapture.capture type:', typeof chrome.tabCapture.capture)

          // Check if it's available but with different name
          if (chrome.tabCapture.getMediaStreamId) {
            console.log('⚠️ Found getMediaStreamId method - might need to use this instead')
          }
        } else {
          console.error('❌ chrome.tabCapture object does not exist')
        }

        // Check if tabCapture API exists
        if (!chrome.tabCapture) {
          sendResponse({
            error: 'Tab capture API not available. Remove and re-add the extension.',
            details: 'chrome.tabCapture does not exist'
          })
          return
        }

        // Use getMediaStreamId (Manifest V3) - this is the correct method
        if (typeof chrome.tabCapture.getMediaStreamId !== 'function') {
          sendResponse({
            error: 'getMediaStreamId not available',
            details: 'Available methods: ' + Object.keys(chrome.tabCapture || {}).join(', ')
          })
          return
        }

        console.log('🔌 Calling getMediaStreamId for tab:', tabId)

        // Try getMediaStreamId first (Manifest V3 method)
        // If that doesn't work, try the older capture() method as fallback
        if (typeof chrome.tabCapture.getMediaStreamId === 'function') {
          // Method 1: getMediaStreamId (preferred for Manifest V3)
          chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message
              console.error('❌ getMediaStreamId error:', errorMsg)

              // Try fallback: capture() method (older API)
              console.log('🔄 Trying fallback: capture() method...')
              chrome.tabCapture.capture({ audio: true, video: false }, (fallbackStreamId) => {
                if (chrome.runtime.lastError) {
                  const fallbackError = chrome.runtime.lastError.message
                  console.error('❌ capture() also failed:', fallbackError)
                  sendResponse({
                    error: `Tab capture failed: ${errorMsg}. Fallback also failed: ${fallbackError}`,
                    details: errorMsg,
                    fallbackToMicrophone: true
                  })
                } else if (fallbackStreamId) {
                  console.log('✅ Tab capture success (using capture() fallback), streamId:', fallbackStreamId)
                  sendResponse({ streamId: fallbackStreamId, success: true })
                } else {
                  sendResponse({
                    error: 'No streamId returned from either method',
                    details: 'Both getMediaStreamId and capture() returned no streamId',
                    fallbackToMicrophone: true
                  })
                }
              })
            } else if (streamId) {
              console.log('✅ Tab capture success (using getMediaStreamId), streamId:', streamId)
              sendResponse({ streamId: streamId, success: true })
            } else {
              // No error but no streamId - try fallback
              console.log('⚠️ getMediaStreamId returned no streamId, trying capture()...')
              chrome.tabCapture.capture({ audio: true, video: false }, (fallbackStreamId) => {
                if (chrome.runtime.lastError) {
                  sendResponse({
                    error: 'No streamId returned',
                    details: 'getMediaStreamId returned no streamId, capture() failed: ' + chrome.runtime.lastError.message,
                    fallbackToMicrophone: true
                  })
                } else if (fallbackStreamId) {
                  console.log('✅ Tab capture success (using capture() fallback), streamId:', fallbackStreamId)
                  sendResponse({ streamId: fallbackStreamId, success: true })
                } else {
                  sendResponse({
                    error: 'No streamId returned',
                    details: 'Both methods returned no streamId',
                    fallbackToMicrophone: true
                  })
                }
              })
            }
          })
        } else {
          // getMediaStreamId not available, try capture() directly
          console.log('⚠️ getMediaStreamId not available, using capture() method...')
          chrome.tabCapture.capture({ audio: true, video: false }, (streamId) => {
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message
              console.error('❌ Tab capture error:', errorMsg)
              sendResponse({
                error: `Tab capture failed: ${errorMsg}`,
                details: errorMsg,
                fallbackToMicrophone: true
              })
            } else if (streamId) {
              console.log('✅ Tab capture success (using capture()), streamId:', streamId)
              sendResponse({ streamId: streamId, success: true })
            } else {
              sendResponse({
                error: 'No streamId returned',
                details: 'capture() returned no streamId',
                fallbackToMicrophone: true
              })
            }
          })
        }
      }, 200) // Small delay to ensure tab activation
    })
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ONIX_OPEN_SIDE_PANEL') {
    chrome.sidePanel.open({ tabId: sender.tab?.id }).catch(() => { })
    sendResponse({ ok: true })
  }

  // Get current active tab ID
  if (message?.type === 'ONIX_GET_CURRENT_TAB_ID') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        sendResponse({ tabId: tabs[0].id })
      } else {
        sendResponse({ error: 'No active tab found' })
      }
    })
    return true // Keep channel open for async response
  }

  // Inject html2canvas script for screenshot capture
  if (message?.type === 'ONIX_INJECT_SCREENSHOT_SCRIPT') {
    const tabId = message.tabId || sender.tab?.id
    if (tabId) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['html2canvas.min.js']
      }).then(() => {
        sendResponse({ success: true })
      }).catch(() => {
        // If file doesn't exist, inject from CDN
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            return new Promise((resolve, reject) => {
              if (window.html2canvas) {
                resolve()
                return
              }
              const script = document.createElement('script')
              script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
              script.onload = resolve
              script.onerror = reject
              document.head.appendChild(script)
            })
          }
        }).then(() => {
          sendResponse({ success: true })
        }).catch((error) => {
          sendResponse({ success: false, error: error.message })
        })
      })
      return true
    }
  }

  // Handle tab audio capture request
  if (message?.type === 'ONIX_CAPTURE_TAB_AUDIO') {
    const tabId = message.tabId || sender.tab?.id

    // Log that this is being called from a user gesture (sidepanel button click)
    console.log('🎯 Tab capture requested from user gesture (sidepanel button click)')

    // If no tabId provided, get active tab
    if (!tabId) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) {
          sendResponse({ error: 'No active tab found. Please make sure you are on a meeting page.' })
          return
        }
        captureTabAudio(tabs[0].id, sendResponse)
      })
      return true
    }

    captureTabAudio(tabId, sendResponse)
    return true // Keep channel open for async response
  }

  // Handle auth token request for AssemblyAI
  if (message?.type === 'ONIX_GET_AUTH_TOKEN') {
    // Forward to sidepanel to get Firebase auth token
    chrome.runtime.sendMessage({
      type: 'ONIX_GET_AUTH_TOKEN_FORWARD',
      requestId: message.requestId || Date.now()
    }).catch(() => {
      // Sidepanel might not be open, send error response
      sendResponse({ error: 'Sidepanel not available' })
    })
    return true
  }

  // Handle screenshot capture request (fallback when html2canvas fails)
  if (message?.type === 'ONIX_CAPTURE_SCREENSHOT' || message?.type === 'ONIX_CAPTURE_SCREENSHOT_BACKGROUND') {
    // Get tab ID from message or sender
    const tabId = message.tabId || sender.tab?.id
    if (!tabId) {
      sendResponse({ error: 'No tab ID provided. Please make sure you are on a meeting page.' })
      return
    }

    // Get the tab to verify URL and get window ID
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting tab:', chrome.runtime.lastError)
        sendResponse({ error: chrome.runtime.lastError.message })
        return
      }

      if (!tab) {
        sendResponse({ error: 'Tab not found' })
        return
      }

      // Verify the tab URL matches our host_permissions
      const tabUrl = tab.url || ''
      const isMeet = tabUrl.startsWith('https://meet.google.com/')
      const isZoom = tabUrl.includes('.zoom.us/')

      if (!isMeet && !isZoom) {
        sendResponse({ error: 'Please navigate to a Google Meet or Zoom meeting page first' })
        return
      }

      if (!tab.windowId) {
        sendResponse({ error: 'Could not get tab window ID' })
        return
      }

      // For screenshot capture, we need the tab to be active and visible
      // Try to activate the tab first
      chrome.tabs.update(tabId, { active: true }, () => {
        if (chrome.runtime.lastError) {
          console.warn('Could not activate tab:', chrome.runtime.lastError.message)
        }

        // Get the current window to find the active tab
        chrome.windows.get(tab.windowId, { populate: false }, (window) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: `Error getting window: ${chrome.runtime.lastError.message}` })
            return
          }

          // Small delay to ensure tab is active
          setTimeout(() => {
            // Try capturing with null first (current window - works with activeTab if tab is active)
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
              if (chrome.runtime.lastError) {
                // If null fails, try with window ID
                chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl2) => {
                  if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message
                    console.error('Screenshot capture error:', errorMsg, 'Tab URL:', tabUrl, 'Window ID:', tab.windowId)

                    // Provide helpful error message
                    if (errorMsg.includes('permission') || errorMsg.includes('activeTab') || errorMsg.includes('all_urls')) {
                      sendResponse({ error: `Screenshot permission error: ${errorMsg}. The meeting tab must be visible and active. Please click on the meeting tab, then try capturing the screenshot again.` })
                    } else {
                      sendResponse({ error: `Screenshot error: ${errorMsg}. Tab URL: ${tabUrl}` })
                    }
                  } else if (dataUrl2) {
                    console.log('✅ Screenshot captured successfully (with window ID)')
                    sendResponse({ dataUrl: dataUrl2, success: true })
                  } else {
                    sendResponse({ error: 'Failed to capture screenshot - no data URL returned' })
                  }
                })
              } else if (dataUrl) {
                console.log('✅ Screenshot captured successfully (with null)')
                sendResponse({ dataUrl: dataUrl, success: true })
              } else {
                sendResponse({ error: 'Failed to capture screenshot - no data URL returned' })
              }
            })
          }, 200) // Slightly longer delay to ensure tab activation
        })
      })
    })

    return true // Keep channel open for async response
  }
})

// True only when user is in an active meeting (not landing/home). Panel closes when they leave.
function isActiveMeetingPage(url) {
  if (!url) return false
  if (url.startsWith('https://meet.google.com/')) {
    if (url.includes('/landing') || url.endsWith('meet.google.com') || url.endsWith('meet.google.com/')) return false
    return true
  }
  if (url.includes('.zoom.us/')) return true
  return false
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.url) return
  const active = isActiveMeetingPage(tab.url)
  if (active && changeInfo.status === 'complete') {
    chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true }).catch(() => {})
    chrome.sidePanel.open({ tabId }).catch(() => {})
  } else if (!active) {
    // User left the meeting (e.g. back to landing) — close panel by disabling for this tab
    chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {})
  }
})

// Also open side panel when user navigates to a meeting URL
// Also open side panel when user navigates to a meeting URL, and HIDE it otherwise
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId)
    if (tab.url) {
      if (isActiveMeetingPage(tab.url)) {
        chrome.sidePanel.setOptions({ tabId: activeInfo.tabId, path: 'sidepanel.html', enabled: true }).catch(() => {})
        chrome.sidePanel.open({ tabId: activeInfo.tabId }).catch(() => {})
      } else {
        chrome.sidePanel.setOptions({ tabId: activeInfo.tabId, enabled: false }).catch(() => {})
      }
    }
  } catch (error) {
    // Ignore errors
  }
})


