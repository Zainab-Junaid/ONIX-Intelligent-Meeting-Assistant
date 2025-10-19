chrome.runtime.onInstalled.addListener(() => {
  // no-op
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ONIX_OPEN_SIDE_PANEL') {
    chrome.sidePanel.open({ tabId: sender.tab?.id }).catch(() => {})
    sendResponse({ ok: true })
  }
})

// Open side panel on supported hosts
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.url) return
  const isMeet = tab.url.startsWith('https://meet.google.com/')
  const isZoom = tab.url.includes('.zoom.us/')
  if ((isMeet || isZoom) && changeInfo.status === 'complete') {
    chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true }).catch(() => {})
  }
})


