# How to Run the WebSocket Server

## Step-by-Step Instructions

### 1. Open Terminal/Command Prompt

- **Windows**: Open PowerShell or Command Prompt
- **Mac/Linux**: Open Terminal

### 2. Navigate to the Extension Directory

```bash
cd frontend/chrome-extension/onix_extension_v2
```

### 3. Install Dependencies (First Time Only)

```bash
npm install
```

This will install:
- `express` - Web server
- `ws` - WebSocket library
- `cors` - CORS middleware
- `axios` - HTTP client
- `multer` - File upload handling

### 4. Set AssemblyAI API Key (Optional)

The server has a default API key, but you can set your own:

**Windows PowerShell:**
```powershell
$env:ASSEMBLYAI_API_KEY = "your_api_key_here"
```

**Windows Command Prompt:**
```cmd
set ASSEMBLYAI_API_KEY=your_api_key_here
```

**Mac/Linux:**
```bash
export ASSEMBLYAI_API_KEY=your_api_key_here
```

### 5. Start the Server

**Option A: Using npm script (Recommended)**
```bash
npm start
```

**Option B: Direct node command**
```bash
node server.js
```

**Option C: With auto-restart on changes (Development)**
```bash
npm run dev
```

### 6. Verify Server is Running

You should see output like:
```
Server running on port 3001
WebSocket server ready for connections
```

### 7. Keep the Terminal Open

**Important**: Keep this terminal window open while using the extension. The server must be running for transcription to work.

## Troubleshooting

### Port Already in Use

If you see an error like "Port 3001 is already in use":

**Windows:**
```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace PID with the number from above)
taskkill /PID <PID> /F
```

**Mac/Linux:**
```bash
# Find process using port 3001
lsof -i :3001

# Kill the process (replace PID with the number from above)
kill -9 <PID>
```

### Missing Dependencies

If you see "Cannot find module" errors:
```bash
npm install
```

### AssemblyAI API Key Issues

If transcription doesn't work:
1. Check that your API key is valid
2. Make sure the environment variable is set correctly
3. The server will use the default key if none is set

## Quick Start (All-in-One)

```bash
# Navigate to directory
cd frontend/chrome-extension/onix_extension_v2

# Install dependencies (first time only)
npm install

# Start server
npm start
```

## What the Server Does

- Listens on `ws://localhost:3001` for WebSocket connections
- Receives audio chunks from the Chrome extension
- Forwards audio to AssemblyAI's real-time transcription API
- Sends transcription results back to the extension
- Handles speaker diarization and real-time streaming

## Next Steps

Once the server is running:
1. Load the Chrome extension
2. Open a Google Meet or Zoom meeting
3. Click "Start Capture" in the extension sidepanel
4. Transcription will start automatically!

