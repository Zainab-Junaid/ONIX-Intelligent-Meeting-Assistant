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

// Tab capture and real-time audio processing
let pageIsCapturing = false
let audioContext = null
let mediaStream = null
let processor = null
let websocket = null
let audioChunks = []
let isConnected = false
let fallbackRecognition = null
let participantNames = []
let currentSpeakerIndex = 0
let lastSpeakerTime = 0
let currentSpeaker = null
let speakerChangeThreshold = 3000 // 3 seconds
let speakerVoiceMap = new Map() // Map to store voice characteristics to speaker IDs
let nextSpeakerId = 1 // Next available speaker ID

// Extract participant names from meeting platforms
function extractParticipantNames() {
  const url = location.href
  participantNames = []
  
  if (url.startsWith('https://meet.google.com/')) {
    extractGoogleMeetParticipants()
  } else if (url.includes('.zoom.us/')) {
    extractZoomParticipants()
  }
  
  // Remove duplicates and clean up the list
  participantNames = [...new Set(participantNames)].filter(name => isValidParticipantName(name))
  
  console.log('Extracted participants:', participantNames)
  console.log('Clean participant names found:', participantNames.length)
  
  // Send participants to sidepanel
  chrome.runtime.sendMessage({ 
    type: 'ONIX_PARTICIPANTS_FOUND', 
    participants: participantNames 
  })
  
  return participantNames
}

function extractGoogleMeetParticipants() {
  console.log('Extracting Google Meet participants...')
  
  // Try multiple selectors for Google Meet participant names
  const selectors = [
    // Primary participant name selectors
    '[data-participant-id] [data-self-name]',
    '[data-participant-id] span[jsname]',
    '[data-participant-id] div[jsname]',
    'div[data-participant-id]',
    '.zWGUib', // Google Meet participant name class
    '[jsname="BOHaEe"]', // Another Google Meet selector
    'div[data-self-name]',
    'span[data-self-name]',
    
    // Additional selectors for participants panel
    '.participant-name',
    '.participant-item .name',
    '.participant-list .name',
    '.participants .name',
    '[data-participant-name]',
    '.participant .display-name',
    '.participant .user-name',
    '.participant .name-text',
    '.participant .participant-name',
    
    // Video tile selectors
    '.video-tile .name',
    '.video-tile .participant-name',
    '.video-tile .display-name',
    '.video-tile [data-self-name]',
    '.video-tile span',
    '.video-tile div',
    
    // Meeting participants panel
    '.participants-panel .name',
    '.participants-panel .participant-name',
    '.participants-panel .display-name',
    '.participants-panel [data-self-name]',
    '.participants-panel span',
    '.participants-panel div',
    
    // Generic selectors
    '.name',
    '.display-name',
    '.user-name',
    '.participant-name',
    '.name-text'
  ]
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector)
    elements.forEach(el => {
      const name = cleanParticipantName(el.textContent?.trim())
      if (isValidParticipantName(name) && !participantNames.includes(name)) {
        participantNames.push(name)
        console.log('Found participant:', name, 'from selector:', selector)
      }
    })
  }
  
  // Also try to get names from video tiles more comprehensively
  const videoTiles = document.querySelectorAll('[data-participant-id]')
  videoTiles.forEach(tile => {
    // Try multiple child selectors
    const childSelectors = ['span', 'div', '.name', '.display-name', '[data-self-name]']
    childSelectors.forEach(childSelector => {
      const nameElement = tile.querySelector(childSelector)
      if (nameElement) {
        const name = cleanParticipantName(nameElement.textContent?.trim())
        if (isValidParticipantName(name) && !participantNames.includes(name)) {
          participantNames.push(name)
          console.log('Found participant from video tile:', name)
        }
      }
    })
  })
  
  // Try to extract from participants panel if it exists
  const participantsPanel = document.querySelector('.participants-panel, .participants-list, .participants-container')
  if (participantsPanel) {
    const nameElements = participantsPanel.querySelectorAll('span, div, .name, .display-name, .participant-name')
    nameElements.forEach(el => {
      const name = cleanParticipantName(el.textContent?.trim())
      if (isValidParticipantName(name) && !participantNames.includes(name)) {
        participantNames.push(name)
        console.log('Found participant from panel:', name)
      }
    })
  }
  
  console.log('Total Google Meet participants found:', participantNames.length)
}

function extractZoomParticipants() {
  console.log('Extracting Zoom participants...')
  
  // Try multiple selectors for Zoom participant names
  const selectors = [
    // Primary Zoom selectors
    '.participants-item__display-name',
    '.participant-item__display-name',
    '.participant-name',
    '[data-testid="participant-name"]',
    '.participants-list-item__name',
    '.participant-item__name',
    
    // Additional Zoom selectors
    '.participant-item .name',
    '.participant-item .display-name',
    '.participant-item .user-name',
    '.participants-list .name',
    '.participants-list .display-name',
    '.participants-list .user-name',
    '.participants-container .name',
    '.participants-container .display-name',
    '.participants-container .user-name',
    
    // Video tile selectors
    '.video-tile .name',
    '.video-tile .participant-name',
    '.video-tile .display-name',
    '.video-tile .user-name',
    
    // Meeting participants panel
    '.participants-panel .name',
    '.participants-panel .participant-name',
    '.participants-panel .display-name',
    '.participants-panel .user-name',
    
    // Generic selectors
    '.name',
    '.display-name',
    '.user-name',
    '.participant-name',
    '.name-text'
  ]
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector)
    elements.forEach(el => {
      const name = cleanParticipantName(el.textContent?.trim())
      if (isValidParticipantName(name) && !participantNames.includes(name)) {
        participantNames.push(name)
        console.log('Found Zoom participant:', name, 'from selector:', selector)
      }
    })
  }
  
  // Also try to get names from participant list more comprehensively
  const participantList = document.querySelector('.participants-list, .participants-container, .participants-panel')
  if (participantList) {
    const nameElements = participantList.querySelectorAll('span, div, .name, .display-name, .participant-name, .user-name')
    nameElements.forEach(el => {
      const name = cleanParticipantName(el.textContent?.trim())
      if (isValidParticipantName(name) && !participantNames.includes(name)) {
        participantNames.push(name)
        console.log('Found Zoom participant from list:', name)
      }
    })
  }
  
  console.log('Total Zoom participants found:', participantNames.length)
}

// Get next speaker name with better logic
function getNextSpeaker() {
  const now = Date.now()
  
  // First, try to detect who is currently speaking/highlighted in the meeting
  const activeSpeaker = detectActiveSpeaker()
  if (activeSpeaker) {
    currentSpeaker = activeSpeaker
    lastSpeakerTime = now
    console.log('Active speaker detected:', currentSpeaker)
    return currentSpeaker
  }
  
  // If no participants found or participants are not valid names, use generic names
  if (participantNames.length === 0 || !hasValidParticipantNames()) {
    // Use generic speaker names with rotation
    const speakerNumber = (currentSpeakerIndex % 5) + 1 // Rotate between Speaker 1-5
    currentSpeakerIndex++
    console.log('No valid participants found, using generic speaker:', 'Speaker ' + speakerNumber)
    return 'Speaker ' + speakerNumber
  }
  
  // If enough time has passed since last speaker change, rotate to next speaker
  if (now - lastSpeakerTime > speakerChangeThreshold) {
    const validNames = participantNames.filter(name => isValidParticipantName(name))
    if (validNames.length > 0) {
      currentSpeaker = validNames[currentSpeakerIndex % validNames.length]
      currentSpeakerIndex++
      lastSpeakerTime = now
      console.log('Speaker rotated to:', currentSpeaker)
    } else {
      // Fallback to generic names if no valid names
      const speakerNumber = (currentSpeakerIndex % 5) + 1
      currentSpeaker = 'Speaker ' + speakerNumber
      currentSpeakerIndex++
      lastSpeakerTime = now
      console.log('No valid participant names, using generic speaker:', currentSpeaker)
    }
  }
  
  // If no current speaker set, use first valid participant or generic
  if (!currentSpeaker) {
    const validNames = participantNames.filter(name => isValidParticipantName(name))
    if (validNames.length > 0) {
      currentSpeaker = validNames[0]
      console.log('Using first valid participant:', currentSpeaker)
    } else {
      currentSpeaker = 'Speaker 1'
      currentSpeakerIndex = 1
      console.log('No valid participants, using default speaker:', currentSpeaker)
    }
    lastSpeakerTime = now
  }
  
  return currentSpeaker
}

// Detect who is currently speaking/highlighted in the meeting
function detectActiveSpeaker() {
  const url = location.href
  
  if (url.startsWith('https://meet.google.com/')) {
    return detectGoogleMeetActiveSpeaker()
  } else if (url.includes('.zoom.us/')) {
    return detectZoomActiveSpeaker()
  }
  
  return null
}

// Detect active speaker in Google Meet
function detectGoogleMeetActiveSpeaker() {
  // Look for highlighted/active video tiles
  const activeSelectors = [
    '[data-participant-id][data-is-dominant-speaker="true"]',
    '[data-participant-id].dominant-speaker',
    '[data-participant-id][aria-label*="speaking"]',
    '[data-participant-id][data-is-speaking="true"]',
    '.dominant-speaker [data-self-name]',
    '.speaking [data-self-name]',
    '[data-participant-id].active-speaker'
  ]
  
  for (const selector of activeSelectors) {
    const element = document.querySelector(selector)
    if (element) {
      const name = extractNameFromElement(element)
      if (name && isValidParticipantName(name)) {
        console.log('Found active speaker in Google Meet:', name)
        return name
      }
    }
  }
  
  // Look for video tiles with speaking indicators
  const videoTiles = document.querySelectorAll('[data-participant-id]')
  for (const tile of videoTiles) {
    // Check if this tile has speaking indicators
    const hasSpeakingIndicator = tile.querySelector('.speaking-indicator, .microphone-on, [data-is-speaking="true"]')
    if (hasSpeakingIndicator) {
      const name = extractNameFromElement(tile)
      if (name && isValidParticipantName(name)) {
        console.log('Found speaking participant in Google Meet:', name)
        return name
      }
    }
  }
  
  return null
}

// Detect active speaker in Zoom
function detectZoomActiveSpeaker() {
  // Look for active speaker indicators in Zoom
  const activeSelectors = [
    '.participant-item.active-speaker',
    '.participant-item.speaking',
    '.participants-item.active-speaker',
    '.participants-item.speaking',
    '[data-testid="participant-name"].active-speaker',
    '.participant-item[aria-label*="speaking"]'
  ]
  
  for (const selector of activeSelectors) {
    const element = document.querySelector(selector)
    if (element) {
      const name = extractNameFromElement(element)
      if (name && isValidParticipantName(name)) {
        console.log('Found active speaker in Zoom:', name)
        return name
      }
    }
  }
  
  return null
}

// Extract name from an element
function extractNameFromElement(element) {
  // Try to find name in the element or its children
  const nameSelectors = [
    '[data-self-name]',
    '.participant-name',
    '.display-name',
    'span',
    'div'
  ]
  
  for (const selector of nameSelectors) {
    const nameElement = element.querySelector(selector) || element
    if (nameElement && nameElement.textContent) {
      const name = cleanParticipantName(nameElement.textContent.trim())
      if (name && isValidParticipantName(name)) {
        return name
      }
    }
  }
  
  return null
}

// Enhance Roman Urdu text recognition
function enhanceRomanUrduText(text) {
  if (!text) return text
  
  // Comprehensive Roman Urdu word corrections and enhancements
  const romanUrduCorrections = {
    // Common greetings and basic words
    'hello': 'hello',
    'hi': 'hi',
    'salam': 'salam',
    'adaab': 'adaab',
    'namaste': 'namaste',
    
    // Pronouns and basic words
    'aap': 'aap',
    'main': 'main',
    'ham': 'ham',
    'hum': 'hum',
    'tum': 'tum',
    'woh': 'woh',
    'yeh': 'yeh',
    'sab': 'sab',
    'sabse': 'sabse',
    'kuch': 'kuch',
    'koi': 'koi',
    'kisi': 'kisi',
    'kis': 'kis',
    'kisne': 'kisne',
    'kisko': 'kisko',
    
    // Verbs - to be
    'hai': 'hai',
    'hain': 'hain',
    'hoga': 'hoga',
    'hogi': 'hogi',
    'hoge': 'hoge',
    'hona': 'hona',
    'hote': 'hote',
    'hota': 'hota',
    'hoti': 'hoti',
    
    // Question words
    'kaise': 'kaise',
    'kya': 'kya',
    'kyun': 'kyun',
    'kahan': 'kahan',
    'kab': 'kab',
    'kitna': 'kitna',
    'kitne': 'kitne',
    'kisliye': 'kisliye',
    'kya kar rahe': 'kya kar rahe',
    'kya kar raha': 'kya kar raha',
    'kya kar rahi': 'kya kar rahi',
    
    // Possessive pronouns
    'mera': 'mera',
    'meri': 'meri',
    'mere': 'mere',
    'tera': 'tera',
    'teri': 'teri',
    'tere': 'tere',
    'apka': 'apka',
    'apki': 'apki',
    'apke': 'apke',
    'uska': 'uska',
    'uski': 'uski',
    'uske': 'uske',
    'hamara': 'hamara',
    'hamari': 'hamari',
    'hamare': 'hamare',
    'tumhara': 'tumhara',
    'tumhari': 'tumhari',
    'tumhare': 'tumhare',
    
    // Common adjectives and responses
    'acha': 'acha',
    'theek': 'theek',
    'bilkul': 'bilkul',
    'zaroor': 'zaroor',
    'shukriya': 'shukriya',
    'meherbani': 'meherbani',
    'maaf': 'maaf',
    'sorry': 'sorry',
    'excuse': 'excuse',
    'bura': 'bura',
    'accha': 'accha',
    'badhiya': 'badhiya',
    'mast': 'mast',
    'awesome': 'awesome',
    'great': 'great',
    'nice': 'nice',
    'good': 'good',
    'bad': 'bad',
    'okay': 'okay',
    'ok': 'ok',
    
    // Action verbs - to do
    'karna': 'karna',
    'karte': 'karte',
    'karta': 'karta',
    'karti': 'karti',
    'kar raha': 'kar raha',
    'kar rahe': 'kar rahe',
    'kar rahi': 'kar rahi',
    'kar diya': 'kar diya',
    'kar diye': 'kar diye',
    'kar diyi': 'kar diyi',
    'kar sakta': 'kar sakta',
    'kar sakte': 'kar sakte',
    'kar sakti': 'kar sakti',
    
    // Action verbs - to go
    'jana': 'jana',
    'jate': 'jate',
    'jata': 'jata',
    'jati': 'jati',
    'ja raha': 'ja raha',
    'ja rahe': 'ja rahe',
    'ja rahi': 'ja rahi',
    'chala': 'chala',
    'chale': 'chale',
    'chali': 'chali',
    'gaya': 'gaya',
    'gaye': 'gaye',
    'gayi': 'gayi',
    
    // Action verbs - to come
    'aana': 'aana',
    'aate': 'aate',
    'aata': 'aata',
    'aati': 'aati',
    'aa raha': 'aa raha',
    'aa rahe': 'aa rahe',
    'aa rahi': 'aa rahi',
    'aya': 'aya',
    'aye': 'aye',
    'ayi': 'ayi',
    
    // Action verbs - to see
    'dekhna': 'dekhna',
    'dekhte': 'dekhte',
    'dekhta': 'dekhta',
    'dekhti': 'dekhti',
    'dekh raha': 'dekh raha',
    'dekh rahe': 'dekh rahe',
    'dekh rahi': 'dekh rahi',
    'dekha': 'dekha',
    'dekhe': 'dekhe',
    'dekhi': 'dekhi',
    
    // Action verbs - to hear/listen
    'sunna': 'sunna',
    'sunte': 'sunte',
    'sunta': 'sunta',
    'sunti': 'sunti',
    'sun raha': 'sun raha',
    'sun rahe': 'sun rahe',
    'sun rahi': 'sun rahi',
    'suna': 'suna',
    'sune': 'sune',
    'suni': 'suni',
    
    // Action verbs - to speak
    'bolna': 'bolna',
    'bolte': 'bolte',
    'bolta': 'bolta',
    'bolti': 'bolti',
    'bol raha': 'bol raha',
    'bol rahe': 'bol rahe',
    'bol rahi': 'bol rahi',
    'bola': 'bola',
    'bole': 'bole',
    'boli': 'boli',
    
    // Action verbs - to understand
    'samajhna': 'samajhna',
    'samajhte': 'samajhte',
    'samajhta': 'samajhta',
    'samajhti': 'samajhti',
    'samajh raha': 'samajh raha',
    'samajh rahe': 'samajh rahe',
    'samajh rahi': 'samajh rahi',
    'samjha': 'samjha',
    'samjhe': 'samjhe',
    'samjhi': 'samjhi',
    
    // Action verbs - to make/create
    'banana': 'banana',
    'banate': 'banate',
    'banata': 'banata',
    'banati': 'banati',
    'bana raha': 'bana raha',
    'bana rahe': 'bana rahe',
    'bana rahi': 'bana rahi',
    'banaya': 'banaya',
    'banaye': 'banaye',
    'banayi': 'banayi',
    
    // Action verbs - to take
    'lena': 'lena',
    'lete': 'lete',
    'leta': 'leta',
    'leti': 'leti',
    'le raha': 'le raha',
    'le rahe': 'le rahe',
    'le rahi': 'le rahi',
    'liya': 'liya',
    'liye': 'liye',
    'liyi': 'liyi',
    
    // Action verbs - to give
    'dena': 'dena',
    'dete': 'dete',
    'deta': 'deta',
    'deti': 'deti',
    'de raha': 'de raha',
    'de rahe': 'de rahe',
    'de rahi': 'de rahi',
    'diya': 'diya',
    'diye': 'diye',
    'diyi': 'diyi',
    
    // Action verbs - to get
    'pana': 'pana',
    'pate': 'pate',
    'pata': 'pata',
    'pati': 'pati',
    'pa raha': 'pa raha',
    'pa rahe': 'pa rahe',
    'pa rahi': 'pa rahi',
    'mila': 'mila',
    'mile': 'mile',
    'mili': 'mili',
    
    // Time and place words
    'abhi': 'abhi',
    'ab': 'ab',
    'pehle': 'pehle',
    'baad': 'baad',
    'yahan': 'yahan',
    'wahan': 'wahan',
    'idhar': 'idhar',
    'udhar': 'udhar',
    'upar': 'upar',
    'niche': 'niche',
    'andar': 'andar',
    'bahar': 'bahar',
    'aage': 'aage',
    'piche': 'piche',
    'dono': 'dono',
    'teeno': 'teeno',
    'sab': 'sab',
    
    // Common phrases
    'kaise hain': 'kaise hain',
    'kaise ho': 'kaise ho',
    'kya haal': 'kya haal',
    'kya kar rahe': 'kya kar rahe',
    'kya kar raha': 'kya kar raha',
    'kya kar rahi': 'kya kar rahi',
    'kahan se': 'kahan se',
    'kahan tak': 'kahan tak',
    'kab tak': 'kab tak',
    'kitna time': 'kitna time',
    'kitna der': 'kitna der',
    'kitna paisa': 'kitna paisa',
    'kitna rupya': 'kitna rupya',
    
    // Common misrecognitions and corrections
    'hello': 'hello',
    'hi': 'hi',
    'yes': 'yes',
    'no': 'no',
    'okay': 'okay',
    'ok': 'ok',
    'please': 'please',
    'thank you': 'thank you',
    'thanks': 'thanks',
    'welcome': 'welcome',
    'sorry': 'sorry',
    'excuse me': 'excuse me',
    'pardon': 'pardon',
    'repeat': 'repeat',
    'again': 'again',
    'slowly': 'slowly',
    'fast': 'fast',
    'quickly': 'quickly',
    'wait': 'wait',
    'stop': 'stop',
    'start': 'start',
    'begin': 'begin',
    'end': 'end',
    'finish': 'finish',
    'complete': 'complete',
    'ready': 'ready',
    'not ready': 'not ready',
    'busy': 'busy',
    'free': 'free',
    'available': 'available',
    'not available': 'not available'
  }
  
  let enhancedText = text.toLowerCase()
  
  // Apply Roman Urdu corrections
  Object.keys(romanUrduCorrections).forEach(incorrect => {
    const correct = romanUrduCorrections[incorrect]
    const regex = new RegExp(`\\b${incorrect}\\b`, 'gi')
    enhancedText = enhancedText.replace(regex, correct)
  })
  
  // Capitalize first letter of each sentence
  enhancedText = enhancedText.replace(/(^|\.\s+)([a-z])/g, (match, prefix, letter) => {
    return prefix + letter.toUpperCase()
  })
  
  // Additional Roman Urdu specific improvements
  // Fix common misrecognitions in Roman Urdu
  const romanUrduFixes = {
    // Common speech recognition errors
    'aap kaise hain': 'aap kaise hain',
    'aap kaise ho': 'aap kaise ho',
    'main theek hun': 'main theek hun',
    'main theek hoon': 'main theek hoon',
    'aap ka naam kya hai': 'aap ka naam kya hai',
    'mera naam': 'mera naam',
    'aap kahan se hain': 'aap kahan se hain',
    'aap kahan rehte hain': 'aap kahan rehte hain',
    'aap kya kar rahe hain': 'aap kya kar rahe hain',
    'aap kya kar raha hai': 'aap kya kar raha hai',
    'aap kya kar rahi hain': 'aap kya kar rahi hain',
    'main samajh gaya': 'main samajh gaya',
    'main samajh gayi': 'main samajh gayi',
    'aap samajh gaye': 'aap samajh gaye',
    'bilkul theek': 'bilkul theek',
    'zaroor': 'zaroor',
    'shukriya': 'shukriya',
    'aapka shukriya': 'aapka shukriya',
    'koi baat nahi': 'koi baat nahi',
    'koi problem nahi': 'koi problem nahi',
    'theek hai': 'theek hai',
    'acha hai': 'acha hai',
    'badhiya hai': 'badhiya hai',
    'mast hai': 'mast hai',
    'awesome hai': 'awesome hai',
    'great hai': 'great hai',
    'nice hai': 'nice hai',
    'good hai': 'good hai',
    'bad hai': 'bad hai',
    'okay hai': 'okay hai',
    'ok hai': 'ok hai',
    'please': 'please',
    'thank you': 'thank you',
    'thanks': 'thanks',
    'welcome': 'welcome',
    'sorry': 'sorry',
    'excuse me': 'excuse me',
    'pardon': 'pardon',
    'repeat': 'repeat',
    'again': 'again',
    'slowly': 'slowly',
    'fast': 'fast',
    'quickly': 'quickly',
    'wait': 'wait',
    'stop': 'stop',
    'start': 'start',
    'begin': 'begin',
    'end': 'end',
    'finish': 'finish',
    'complete': 'complete',
    'ready': 'ready',
    'not ready': 'not ready',
    'busy': 'busy',
    'free': 'free',
    'available': 'available',
    'not available': 'not available'
  }
  
  // Apply Roman Urdu phrase fixes
  Object.keys(romanUrduFixes).forEach(phrase => {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    enhancedText = enhancedText.replace(regex, romanUrduFixes[phrase])
  })
  
  console.log('Enhanced Roman Urdu text:', text, '->', enhancedText)
  return enhancedText
}

// Dynamic language switching based on content
let currentLanguage = 'en-IN'
let romanUrduDetectionCount = 0
let englishDetectionCount = 0
const languageSwitchThreshold = 3

function switchLanguageIfNeeded(text) {
  if (!text) return
  
  const hasRomanUrdu = containsRomanUrdu(text)
  
  if (hasRomanUrdu) {
    romanUrduDetectionCount++
    englishDetectionCount = Math.max(0, englishDetectionCount - 1)
  } else {
    englishDetectionCount++
    romanUrduDetectionCount = Math.max(0, romanUrduDetectionCount - 1)
  }
  
  // Switch to Roman Urdu optimized settings if we detect enough Roman Urdu
  if (romanUrduDetectionCount >= languageSwitchThreshold && currentLanguage !== 'en-IN') {
    currentLanguage = 'en-IN'
    if (fallbackRecognition) {
      fallbackRecognition.lang = 'en-IN'
      console.log('Switched to Roman Urdu optimized language settings')
    }
  }
  // Switch to standard English if we detect enough English
  else if (englishDetectionCount >= languageSwitchThreshold && currentLanguage !== 'en-US') {
    currentLanguage = 'en-US'
    if (fallbackRecognition) {
      fallbackRecognition.lang = 'en-US'
      console.log('Switched to standard English language settings')
    }
  }
}

// Check if text contains Roman Urdu words
function containsRomanUrdu(text) {
  if (!text) return false
  
  const romanUrduWords = [
    // Basic words
    'aap', 'main', 'ham', 'hum', 'tum', 'woh', 'yeh', 'sab', 'sabse', 'kuch', 'koi', 'kisi', 'kis', 'kisne', 'kisko',
    
    // Verbs - to be
    'hai', 'hain', 'hoga', 'hogi', 'hoge', 'hona', 'hote', 'hota', 'hoti',
    
    // Question words
    'kaise', 'kya', 'kyun', 'kahan', 'kab', 'kitna', 'kitne', 'kisliye',
    
    // Possessive pronouns
    'mera', 'meri', 'mere', 'tera', 'teri', 'tere', 'apka', 'apki', 'apke', 'uska', 'uski', 'uske',
    'hamara', 'hamari', 'hamare', 'tumhara', 'tumhari', 'tumhare',
    
    // Common adjectives
    'acha', 'accha', 'theek', 'bilkul', 'zaroor', 'shukriya', 'meherbani', 'maaf', 'bura', 'badhiya', 'mast',
    
    // Action verbs - to do
    'karna', 'karte', 'karta', 'karti', 'kar raha', 'kar rahe', 'kar rahi', 'kar diya', 'kar diye', 'kar diyi',
    'kar sakta', 'kar sakte', 'kar sakti',
    
    // Action verbs - to go
    'jana', 'jate', 'jata', 'jati', 'ja raha', 'ja rahe', 'ja rahi', 'chala', 'chale', 'chali', 'gaya', 'gaye', 'gayi',
    
    // Action verbs - to come
    'aana', 'aate', 'aata', 'aati', 'aa raha', 'aa rahe', 'aa rahi', 'aya', 'aye', 'ayi',
    
    // Action verbs - to see
    'dekhna', 'dekhte', 'dekhta', 'dekhti', 'dekh raha', 'dekh rahe', 'dekh rahi', 'dekha', 'dekhe', 'dekhi',
    
    // Action verbs - to hear/listen
    'sunna', 'sunte', 'sunta', 'sunti', 'sun raha', 'sun rahe', 'sun rahi', 'suna', 'sune', 'suni',
    
    // Action verbs - to speak
    'bolna', 'bolte', 'bolta', 'bolti', 'bol raha', 'bol rahe', 'bol rahi', 'bola', 'bole', 'boli',
    
    // Action verbs - to understand
    'samajhna', 'samajhte', 'samajhta', 'samajhti', 'samajh raha', 'samajh rahe', 'samajh rahi', 'samjha', 'samjhe', 'samjhi',
    
    // Action verbs - to make/create
    'banana', 'banate', 'banata', 'banati', 'bana raha', 'bana rahe', 'bana rahi', 'banaya', 'banaye', 'banayi',
    
    // Action verbs - to take
    'lena', 'lete', 'leta', 'leti', 'le raha', 'le rahe', 'le rahi', 'liya', 'liye', 'liyi',
    
    // Action verbs - to give
    'dena', 'dete', 'deta', 'deti', 'de raha', 'de rahe', 'de rahi', 'diya', 'diye', 'diyi',
    
    // Action verbs - to get
    'pana', 'pate', 'pata', 'pati', 'pa raha', 'pa rahe', 'pa rahi', 'mila', 'mile', 'mili',
    
    // Time and place words
    'abhi', 'ab', 'pehle', 'baad', 'yahan', 'wahan', 'idhar', 'udhar', 'upar', 'niche', 'andar', 'bahar', 'aage', 'piche', 'dono', 'teeno',
    
    // Common phrases
    'kaise hain', 'kaise ho', 'kya haal', 'kya kar rahe', 'kya kar raha', 'kya kar rahi', 'kahan se', 'kahan tak', 'kab tak',
    'kitna time', 'kitna der', 'kitna paisa', 'kitna rupya',
    
    // Greetings
    'salam', 'adaab', 'namaste'
  ]
  
  const lowerText = text.toLowerCase()
  return romanUrduWords.some(word => lowerText.includes(word))
}

// Reset speaker when starting new capture
function resetSpeaker() {
  currentSpeaker = null
  currentSpeakerIndex = 0
  lastSpeakerTime = 0
  speakerVoiceMap.clear()
  nextSpeakerId = 1
}

// Track recent transcripts to prevent duplicates
let recentTranscripts = []
const MAX_RECENT_TRANSCRIPTS = 5

// Check if transcript is duplicate or too similar to recent ones
function isDuplicateOrSimilar(transcript) {
  if (!transcript || transcript.length < 2) return true
  
  const lowerTranscript = transcript.toLowerCase().trim()
  
  // Check against recent transcripts
  for (let i = 0; i < recentTranscripts.length; i++) {
    const recent = recentTranscripts[i].toLowerCase().trim()
    
    // Check for exact match
    if (recent === lowerTranscript) {
      return true
    }
    
    // Check for high similarity (90%+ match) - more strict to allow more content
    const similarity = calculateSimilarity(lowerTranscript, recent)
    if (similarity > 0.9) {
      return true
    }
  }
  
  // Add to recent transcripts
  recentTranscripts.push(transcript)
  if (recentTranscripts.length > MAX_RECENT_TRANSCRIPTS) {
    recentTranscripts.shift() // Remove oldest
  }
  
  return false
}

// Calculate similarity between two strings
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

// Calculate Levenshtein distance between two strings
function levenshteinDistance(str1, str2) {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

// Generate a simple voice signature based on audio characteristics
function generateVoiceSignature(audioData) {
  // This is a simplified voice signature - in a real implementation,
  // you would use more sophisticated audio analysis
  if (!audioData || audioData.length === 0) return null
  
  // Create a simple hash based on audio characteristics
  let hash = 0
  for (let i = 0; i < Math.min(audioData.length, 1000); i += 10) {
    hash = ((hash << 5) - hash + audioData[i]) & 0xffffffff
  }
  return Math.abs(hash).toString()
}

// Get or assign a persistent speaker ID for a voice
function getPersistentSpeakerId(voiceSignature) {
  if (!voiceSignature) {
    // If no voice signature, assign next available ID
    const speakerId = 'Speaker ' + nextSpeakerId
    nextSpeakerId++
    return speakerId
  }
  
  // Check if we've seen this voice before
  if (speakerVoiceMap.has(voiceSignature)) {
    return speakerVoiceMap.get(voiceSignature)
  }
  
  // New voice - assign next available ID
  const speakerId = 'Speaker ' + nextSpeakerId
  speakerVoiceMap.set(voiceSignature, speakerId)
  nextSpeakerId++
  console.log('New voice detected, assigned:', speakerId)
  return speakerId
}

// Clean participant name by removing UI elements and metadata
function cleanParticipantName(name) {
  if (!name) return ''
  
  const originalName = name
  console.log('Cleaning name:', originalName)
  
  let cleanedName = name
  
  // First, handle the "for" prefix specifically
  cleanedName = cleanedName.replace(/^for\s*/i, '')
  
  // Remove common UI elements and metadata
  const unwantedPatterns = [
    /more_vert/gi,
    /More options/gi,
    /\(\d+%\)/g, // Remove confidence percentages like (75%)
    /\d{1,2}:\d{2}:\d{2}/g, // Remove timestamps like 12:42:40
    /\d{4}-\d{2}-\d{2}/g, // Remove dates
    /mic\s*check/gi,
    /tech\s*\d+/gi,
    /hello\s*hello/gi,
    /check\s*\d+/gi,
    /^\d+\s*/, // Remove leading numbers
    /\s*\d+$/, // Remove trailing numbers
    /[^a-zA-Z\s]/g, // Remove all non-letter, non-space characters
    /\s+/g // Replace multiple spaces with single space
  ]
  
  // Apply all cleaning patterns
  unwantedPatterns.forEach(pattern => {
    cleanedName = cleanedName.replace(pattern, ' ')
  })
  
  // Clean up extra spaces and trim
  cleanedName = cleanedName.replace(/\s+/g, ' ').trim()
  
  // Remove duplicate words (like "IqraIshaqIqraIshaq" -> "Iqra Ishaq")
  const words = cleanedName.split(' ')
  const uniqueWords = []
  const seen = new Set()
  
  words.forEach(word => {
    if (word && !seen.has(word.toLowerCase())) {
      uniqueWords.push(word)
      seen.add(word.toLowerCase())
    }
  })
  
  cleanedName = uniqueWords.join(' ')
  
  // If name is too long or contains repeated patterns, try to extract the core name
  if (cleanedName.length > 20) {
    // Look for repeated patterns and extract the first occurrence
    const words = cleanedName.split(' ')
    const firstHalf = words.slice(0, Math.ceil(words.length / 2))
    const secondHalf = words.slice(Math.ceil(words.length / 2))
    
    // If first half matches second half, use first half
    if (firstHalf.join(' ').toLowerCase() === secondHalf.join(' ').toLowerCase()) {
      cleanedName = firstHalf.join(' ')
    }
  }
  
  console.log('Cleaned name:', originalName, '->', cleanedName)
  return cleanedName
}

// Validate if a name is a proper participant name
function isValidParticipantName(name) {
  if (!name || name.length === 0) return false
  
  // Must be between 2 and 30 characters
  if (name.length < 2 || name.length > 30) return false
  
  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(name)) return false
  
  // Should not contain only numbers or special characters
  if (!/[a-zA-Z]{2,}/.test(name)) return false
  
  // Should not contain common UI words
  const uiWords = ['more', 'options', 'vert', 'mic', 'check', 'tech', 'hello', 'click', 'button', 'menu', 'for']
  const lowerName = name.toLowerCase()
  if (uiWords.some(word => lowerName.includes(word))) return false
  
  // Should not be just punctuation or symbols
  if (/^[^a-zA-Z]*$/.test(name)) return false
  
  // Should not contain only single characters or very short words
  const words = name.split(' ')
  if (words.length > 0 && words.every(word => word.length < 2)) return false
  
  // Should not be repeated single words (like "a a a")
  if (words.length > 1 && words.every(word => word === words[0])) return false
  
  return true
}

// Check if we have valid participant names (not just generic or UI elements)
function hasValidParticipantNames() {
  if (participantNames.length === 0) return false
  
  // Check if we have at least one valid participant name
  const validNames = participantNames.filter(name => isValidParticipantName(name))
  
  // If we have valid names, use them; otherwise fall back to generic speakers
  if (validNames.length > 0) {
    console.log('Found valid participant names:', validNames)
    return true
  }
  
  console.log('No valid participant names found, will use generic speakers')
  return false
}

// WebSocket connection to backend with fallback
function connectToBackend() {
  if (isConnected) return
  
  // Try to connect to WebSocket server
  websocket = new WebSocket('ws://localhost:3001')
  
  // Set timeout for connection
  const connectionTimeout = setTimeout(() => {
    if (!isConnected) {
      console.log('Server connection timeout, using fallback mode')
      chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', fallback: true, message: 'Using offline mode' })
    }
  }, 3000)
  
  websocket.onopen = () => {
    clearTimeout(connectionTimeout)
    console.log('Connected to transcription server')
    isConnected = true
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', connected: true })
  }
  
  websocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      
      switch (data.type) {
        case 'transcription_result':
          chrome.runtime.sendMessage({ 
            type: 'ONIX_TRANSCRIPT_CHUNK', 
            text: data.text,
            speaker: data.speaker,
            confidence: data.confidence,
            timestamp: data.timestamp
          })
          break
        case 'error':
          chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', error: data.message })
          break
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error)
    }
  }
  
  websocket.onclose = () => {
    clearTimeout(connectionTimeout)
    console.log('Disconnected from transcription server')
    isConnected = false
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', disconnected: true })
  }
  
  websocket.onerror = (error) => {
    clearTimeout(connectionTimeout)
    console.error('WebSocket error:', error)
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', fallback: true, message: 'Server unavailable, using offline mode' })
  }
}

function startTabCapture() {
  if (pageIsCapturing) return
  
  console.log('Starting capture...')
  
  // Reset speaker tracking
  resetSpeaker()
  
  // Extract participant names from the meeting
  extractParticipantNames()
  
  // Start Web Speech API immediately
  console.log('Starting transcription with Web Speech API')
  console.log('Found participants:', participantNames)
  startWebSpeechFallback()
}

// Primary transcription using Web Speech API
function startWebSpeechFallback() {
  if (pageIsCapturing) {
    console.log('Already capturing, skipping restart')
    return
  }
  
  console.log('Initializing Web Speech API...')
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', error: 'Speech recognition not supported' })
    return
  }
  
  fallbackRecognition = new SpeechRecognition()
  fallbackRecognition.continuous = true
  fallbackRecognition.interimResults = true
  fallbackRecognition.maxAlternatives = 5  // Use more alternatives for better capture
  fallbackRecognition.lang = 'en-IN'  // Set language immediately
  
  // Enhanced settings for better speech capture
  if (fallbackRecognition.grammars) {
    fallbackRecognition.grammars = new SpeechGrammarList()
  }
  
  // Add multiple language support for better recognition
  const supportedLanguages = ['en-IN', 'en-US', 'en-GB', 'hi-IN', 'ur-PK']
  if (fallbackRecognition.languages) {
    fallbackRecognition.languages = supportedLanguages
  }
  
  // Use English (India) for better Roman Urdu support
  // This language setting works better for Roman Urdu mixed with English
  
  // Optimized settings for better performance
  
  fallbackRecognition.onresult = (event) => {
    // Update activity time for heartbeat
    if (typeof lastActivityTime !== 'undefined') {
      lastActivityTime = Date.now()
    }
    
    let finalText = ''
    let interimText = ''
    let bestText = ''
    let bestConfidence = 0
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i]
      
      if (res.isFinal) {
        // Process all meaningful content with better sensitivity
        const transcript = res[0].transcript.trim()
        const confidence = res[0].confidence || 0.5
        
        // More lenient filtering - capture more speech
        if (transcript.length < 2 || confidence < 0.2) {
          console.log('Skipping very short or very low-confidence result:', transcript, confidence)
          continue
        }
        
        // Less strict duplicate checking - allow similar but different content
        if (isDuplicateOrSimilar(transcript) && transcript.length < 10) {
          console.log('Skipping short duplicate result:', transcript)
          continue
        }
        
        let currentText = transcript
        let currentConfidence = confidence
        
        // Check all alternatives for better results
        for (let j = 0; j < res.length; j++) {
          const alternative = res[j]
          const altText = alternative.transcript.trim()
          const altConfidence = alternative.confidence || 0.5
          
          // Choose better alternative if available
          if (altText.length > currentText.length || altConfidence > currentConfidence) {
            currentText = altText
            currentConfidence = altConfidence
          }
        }
        
        // Check if this result has better confidence or is longer
        if (currentConfidence > bestConfidence || currentText.length > bestText.length) {
          bestText = currentText
          bestConfidence = currentConfidence
        }
        
        finalText += currentText
      } else {
        // Handle interim results for real-time updates - be more inclusive
        const interimTranscript = res[0].transcript.trim()
        if (interimTranscript.length > 3) { // Show interim for shorter phrases too
          interimText += interimTranscript
        }
      }
    }
    
    // Send interim results for real-time updates (more responsive)
    if (interimText && interimText.trim().length > 5) {
      const enhancedInterimText = enhanceRomanUrduText(interimText)
      const activeSpeaker = detectActiveSpeaker()
      let speaker = activeSpeaker || currentSpeaker || 'Speaker 1'
      
      chrome.runtime.sendMessage({ 
        type: 'ONIX_TRANSCRIPT_INTERIM', 
        text: enhancedInterimText,
        speaker: speaker,
        timestamp: Date.now()
      })
    }
    
    // Send final results for all meaningful content
    if (finalText && finalText.trim().length > 1) {
      // Use the best text
      const finalEnhancedText = enhanceRomanUrduText(bestText || finalText.trim())
      
      // Switch language settings based on content
      switchLanguageIfNeeded(finalEnhancedText)
      
      // Try to detect who is currently speaking in the meeting
      const activeSpeaker = detectActiveSpeaker()
      let speaker = activeSpeaker
      
      // If we have a valid participant name, use it
      if (speaker && isValidParticipantName(speaker)) {
        // Keep using the valid participant name
        console.log('Using detected participant name:', speaker)
        currentSpeaker = speaker
      } else {
        // No valid participant name detected, use persistent speaker ID system
        if (currentSpeaker && currentSpeaker.startsWith('Speaker ')) {
          speaker = currentSpeaker
          console.log('Reusing current speaker:', speaker)
        } else {
          // Assign a new persistent speaker ID
          speaker = 'Speaker ' + nextSpeakerId
          nextSpeakerId++
          currentSpeaker = speaker
          console.log('Assigned new persistent speaker:', speaker)
        }
      }
      
      console.log('Final transcript for speaker:', speaker, 'Text:', finalEnhancedText, 'Confidence:', bestConfidence)
      
      // Update activity time for heartbeat
      if (typeof lastActivityTime !== 'undefined') {
        lastActivityTime = Date.now()
      }
      
      chrome.runtime.sendMessage({ 
        type: 'ONIX_TRANSCRIPT_CHUNK', 
        text: finalEnhancedText,
        speaker: speaker,
        confidence: bestConfidence,
        timestamp: Date.now()
      })
    }
  }
  
  fallbackRecognition.onerror = (e) => {
    console.error('Speech recognition error:', e.error)
    
    // Handle specific error types silently
    if (e.error === 'no-speech') {
      // Silently handle no-speech errors - don't show to user
      console.log('No speech detected, continuing to listen...')
      if (pageIsCapturing) {
        setTimeout(() => {
          if (pageIsCapturing) {
            try {
              fallbackRecognition.start()
              console.log('Speech recognition restarted after no-speech')
            } catch (restartError) {
              console.error('Failed to restart after no-speech:', restartError)
            }
          }
        }, 1000) // Shorter delay for no-speech
      }
      return // Don't send error message for no-speech
    }
    
    // Only send error messages for serious errors
    if (e.error === 'audio-capture' || e.error === 'not-allowed' || e.error === 'network') {
      chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', error: e.error })
      
      if (pageIsCapturing) {
        setTimeout(() => {
          if (pageIsCapturing) {
            try {
              fallbackRecognition.start()
              console.log('Speech recognition restarted after error')
            } catch (restartError) {
              console.error('Failed to restart after error:', restartError)
            }
          }
        }, 2000)
      }
    }
  }
  
  fallbackRecognition.onend = () => {
    console.log('Speech recognition ended, restarting...')
    if (pageIsCapturing) {
      // Restart recognition if still capturing with immediate restart
      setTimeout(() => {
        if (pageIsCapturing && fallbackRecognition) {
          try {
            fallbackRecognition.start()
            console.log('Speech recognition restarted')
          } catch (error) {
            console.error('Error restarting speech recognition:', error)
            // Try to reinitialize if restart fails
            setTimeout(() => {
              if (pageIsCapturing) {
                startWebSpeechFallback()
              }
            }, 500) // Shorter delay for faster recovery
          }
        }
      }, 50) // Much shorter delay for seamless continuation
    }
  }
  
  // Start recognition immediately without waiting for getUserMedia
  try {
    fallbackRecognition.start()
    pageIsCapturing = true
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', started: true, fallback: false })
    console.log('Speech recognition started successfully')
      
    // Add a heartbeat to ensure continuous operation
    let lastActivityTime = Date.now()
    const heartbeatInterval = setInterval(() => {
      if (!pageIsCapturing) {
        clearInterval(heartbeatInterval)
        return
      }
      
      const now = Date.now()
      // If no activity for 15 seconds, restart recognition (more responsive)
      if (now - lastActivityTime > 15000) {
        console.log('No activity detected, restarting recognition...')
        try {
          if (fallbackRecognition) {
            fallbackRecognition.stop()
            setTimeout(() => {
              if (pageIsCapturing && fallbackRecognition) {
                fallbackRecognition.start()
                lastActivityTime = now
                console.log('Recognition restarted due to inactivity')
              }
            }, 500) // Faster restart
          }
        } catch (error) {
          console.error('Error in heartbeat restart:', error)
        }
      }
    }, 5000) // Check every 5 seconds for more responsive detection
    
    // Periodically refresh participant names and detect active speakers
    const refreshInterval = setInterval(() => {
      if (pageIsCapturing) {
        const oldCount = participantNames.length
        extractParticipantNames()
        if (participantNames.length > oldCount) {
          console.log('New participants detected:', participantNames)
        }
        
        // Also check for active speaker
        const activeSpeaker = detectActiveSpeaker()
        if (activeSpeaker && activeSpeaker !== currentSpeaker) {
          console.log('Active speaker changed to:', activeSpeaker)
          currentSpeaker = activeSpeaker
        }
      } else {
        clearInterval(refreshInterval)
        clearInterval(heartbeatInterval)
      }
    }, 1000) // Check every 1 second for more responsive detection
    
  } catch (error) {
    console.error('Error starting speech recognition:', error)
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', error: 'Failed to start speech recognition' })
  }
}

function setupAudioProcessing(stream) {
  try {
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    
    // Create media stream source
    const source = audioContext.createMediaStreamSource(stream)
    
    // Create script processor for audio processing
    processor = audioContext.createScriptProcessor(4096, 1, 1)
    
    processor.onaudioprocess = (event) => {
      if (!isConnected || !websocket) return
      
      const inputBuffer = event.inputBuffer
      const inputData = inputBuffer.getChannelData(0)
      
      // Convert float32 to int16 for better compression
      const int16Data = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768))
      }
      
      // Convert to base64 for transmission
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(int16Data.buffer)))
      
      // Send audio chunk to backend
      websocket.send(JSON.stringify({
        type: 'audio_chunk',
        audioData: base64Audio,
        timestamp: Date.now()
      }))
    }
    
    // Connect audio nodes
    source.connect(processor)
    processor.connect(audioContext.destination)
    
    pageIsCapturing = true
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', started: true })
    
  } catch (error) {
    console.error('Error setting up audio processing:', error)
    chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', error: error.message })
  }
}

function stopTabCapture() {
  if (!pageIsCapturing) return
  
  console.log('Stopping capture...')
  
  // Stop Web Speech API fallback
  if (fallbackRecognition) {
    try {
      fallbackRecognition.stop()
      console.log('Speech recognition stopped')
    } catch (error) {
      console.error('Error stopping speech recognition:', error)
    }
    fallbackRecognition = null
  }
  
  // Stop audio processing
  if (processor) {
    processor.disconnect()
    processor = null
  }
  
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop())
    mediaStream = null
  }
  
  if (websocket) {
    websocket.close()
    websocket = null
  }
  
  pageIsCapturing = false
  isConnected = false
  chrome.runtime.sendMessage({ type: 'ONIX_TRANSCRIPT_STATUS', stopped: true })
  console.log('Capture stopped successfully')
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'ONIX_START_CAPTURE') {
    connectToBackend()
    startTabCapture()
  }
  if (msg?.type === 'ONIX_STOP_CAPTURE') stopTabCapture()
  if (msg?.type === 'ONIX_REFRESH_PARTICIPANTS') {
    console.log('Manually refreshing participants...')
    extractParticipantNames()
  }
})




