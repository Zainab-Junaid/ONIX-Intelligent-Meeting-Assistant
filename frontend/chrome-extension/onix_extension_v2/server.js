const express = require('express');
const WebSocket = require('ws');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for audio file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Store active WebSocket connections
const activeConnections = new Map();
let speakerProfiles = new Map();

// Initialize WebSocket server
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const connectionId = Date.now().toString();
  activeConnections.set(connectionId, ws);
  
  console.log(`New WebSocket connection: ${connectionId}`);
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'audio_chunk':
          await handleAudioChunk(connectionId, message.audioData, message.timestamp);
          break;
        case 'register_speaker':
          await registerSpeaker(connectionId, message.speakerName, message.audioData);
          break;
        case 'start_transcription':
          await startTranscription(connectionId);
          break;
        case 'stop_transcription':
          await stopTranscription(connectionId);
          break;
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });
  
  ws.on('close', () => {
    activeConnections.delete(connectionId);
    console.log(`WebSocket connection closed: ${connectionId}`);
  });
});

// Handle audio chunk processing
async function handleAudioChunk(connectionId, audioData, timestamp) {
  try {
    // Convert base64 audio data to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    // Save temporary audio file
    const tempFile = path.join('uploads', `temp_${connectionId}_${timestamp}.wav`);
    fs.writeFileSync(tempFile, audioBuffer);
    
    // Process audio for transcription and speaker identification
    const result = await processAudio(tempFile, connectionId);
    
    // Send result back to client
    const ws = activeConnections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'transcription_result',
        text: result.text,
        speaker: result.speaker,
        confidence: result.confidence,
        timestamp: timestamp
      }));
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempFile);
    
  } catch (error) {
    console.error('Error processing audio chunk:', error);
    const ws = activeConnections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  }
}

// Process audio using Whisper and speaker diarization
async function processAudio(audioFile, connectionId) {
  return new Promise((resolve, reject) => {
    // Use Whisper for transcription
    const whisperProcess = spawn('whisper', [audioFile, '--model', 'base', '--language', 'en', '--output_format', 'json']);
    
    let output = '';
    let errorOutput = '';
    
    whisperProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    whisperProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    whisperProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          const text = result.text || '';
          
          // Simple speaker identification based on voice characteristics
          const speaker = identifySpeaker(audioFile, connectionId);
          
          resolve({
            text: text.trim(),
            speaker: speaker,
            confidence: 0.85 // Placeholder confidence score
          });
        } catch (parseError) {
          reject(new Error('Failed to parse Whisper output'));
        }
      } else {
        reject(new Error(`Whisper process failed with code ${code}: ${errorOutput}`));
      }
    });
  });
}

// Simple speaker identification (in production, use more sophisticated methods)
function identifySpeaker(audioFile, connectionId) {
  // This is a simplified implementation
  // In production, you would use more sophisticated speaker diarization
  const speakers = ['Uswah', 'Iqra', 'Speaker 1', 'Speaker 2'];
  const randomSpeaker = speakers[Math.floor(Math.random() * speakers.length)];
  
  // You could implement more sophisticated speaker identification here
  // using libraries like pyannote-audio or similar
  
  return randomSpeaker;
}

// Register a new speaker
async function registerSpeaker(connectionId, speakerName, audioData) {
  try {
    const audioBuffer = Buffer.from(audioData, 'base64');
    const profileFile = path.join('uploads', `profile_${speakerName}_${connectionId}.wav`);
    fs.writeFileSync(profileFile, audioBuffer);
    
    // Store speaker profile
    speakerProfiles.set(speakerName, {
      audioFile: profileFile,
      registeredAt: new Date()
    });
    
    const ws = activeConnections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'speaker_registered',
        speakerName: speakerName,
        success: true
      }));
    }
    
  } catch (error) {
    console.error('Error registering speaker:', error);
    const ws = activeConnections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'speaker_registered',
        speakerName: speakerName,
        success: false,
        error: error.message
      }));
    }
  }
}

// Start transcription session
async function startTranscription(connectionId) {
  const ws = activeConnections.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'transcription_started',
      connectionId: connectionId
    }));
  }
}

// Stop transcription session
async function stopTranscription(connectionId) {
  const ws = activeConnections.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'transcription_stopped',
      connectionId: connectionId
    }));
  }
}

// REST API endpoints
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    const result = await processAudio(req.file.path, 'api');
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json(result);
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/speakers', (req, res) => {
  const speakers = Array.from(speakerProfiles.keys());
  res.json({ speakers });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', connections: activeConnections.size });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
