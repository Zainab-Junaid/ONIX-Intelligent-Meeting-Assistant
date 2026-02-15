# Troubleshooting: No Live Transcript / Still Shows "Web Speech API"

## ✅ Fixed Issues

I've updated the code to:
1. Remove the old "Web Speech API" fallback message
2. Show "AssemblyAI" status when connected
3. Better error messages if server isn't running

## 🔧 Steps to Fix

### 1. Make Sure Server is Running

**In a terminal, run:**
```bash
cd frontend\chrome-extension\onix_extension_v2
node server.js
```

You should see:
```
Server running on port 3001
WebSocket server ready for connections
```

**Keep this terminal open!** The server must be running.

### 2. Reload the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Find "Onix Extension" (or your extension name)
3. Click the **reload button** (circular arrow icon)
4. This will load the updated code

### 3. Test the Connection

1. Open a Google Meet or Zoom meeting
2. Open the extension sidepanel
3. Click "Start Capture"
4. You should now see:
   - ✅ "Connecting to AssemblyAI transcription..."
   - ✅ "Connected to AssemblyAI transcription server"
   - ✅ Live transcripts appearing as people speak

## 🔍 Check Browser Console

If it's still not working:

1. **Open Browser Console:**
   - Press `F12` or `Ctrl+Shift+I`
   - Go to "Console" tab

2. **Look for these messages:**
   - ✅ `🔌 Connecting to WebSocket server: ws://localhost:3001`
   - ✅ `✅ Connected to transcription server`
   - ✅ `✅ AssemblyAI transcription started`

3. **If you see errors:**
   - ❌ `WebSocket connection error` → Server not running
   - ❌ `Cannot connect to transcription server` → Check server.js is running
   - ❌ `AssemblyAI connection error` → Check API key

## 🚨 Common Issues

### Issue: "Cannot connect to transcription server"
**Solution:** Make sure `server.js` is running on port 3001

### Issue: Still shows "Using Web Speech API"
**Solution:** 
1. Reload the extension (chrome://extensions/)
2. Refresh the meeting page
3. Try again

### Issue: No transcripts appearing
**Solution:**
1. Check server console for errors
2. Check browser console for WebSocket errors
3. Verify AssemblyAI API key is valid
4. Make sure audio is playing in the meeting

### Issue: Port 3001 already in use
**Solution:**
```powershell
# Find what's using port 3001
netstat -ano | findstr :3001

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

## ✅ Expected Behavior

When working correctly, you should see:

1. **Status messages:**
   - "Connecting to AssemblyAI transcription..."
   - "Connected to AssemblyAI transcription server"
   - "Capturing and transcribing with AssemblyAI..."

2. **Live transcripts:**
   - Text appears in real-time as people speak
   - Shows speaker labels (Speaker A, B, etc.)
   - Interim text (italic) updates as speaking
   - Final text (normal) when speaker finishes

3. **Server console:**
   - "New WebSocket connection: [timestamp]"
   - "AssemblyAI streaming connected for [connectionId]"
   - "AssemblyAI session started"

## 📝 Next Steps

If everything is working:
- Transcripts will auto-save to Firestore every 15 seconds
- When you click "Stop Capture", summary and action items will be generated
- Organized notes are generated every 2 minutes during the meeting

