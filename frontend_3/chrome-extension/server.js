const express = require('express');
const WebSocket = require('ws');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3003;

// AssemblyAI API Configuration
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY || '4fc97d963b464430bfb009706d15da1b';
// Ensure we always use the correct key
if (!process.env.ASSEMBLYAI_API_KEY) {
  console.log('📝 Using default AssemblyAI API key: 4fc97d963b464430bfb009706d15da1b');
}

// Validate API key format (should be 32 characters)
if (ASSEMBLYAI_API_KEY.length !== 32) {
  console.warn('⚠️ WARNING: AssemblyAI API key length is not 32 characters. It may be invalid.');
  console.warn(`Current key length: ${ASSEMBLYAI_API_KEY.length}`);
}

// AssemblyAI Streaming API v3 - NEW FORMAT
// Using v3 API: wss://streaming.assemblyai.com/v3/ws
// Connection params in query string, Authorization in header
const ASSEMBLYAI_STREAMING_BASE_URL = 'wss://streaming.assemblyai.com/v3/ws';
const ASSEMBLYAI_CONNECTION_PARAMS = {
  sample_rate: 16000,
  format_turns: true  // Request formatted final transcripts
};

// Build URL with query parameters
const queryString = new URLSearchParams(ASSEMBLYAI_CONNECTION_PARAMS).toString();
const ASSEMBLYAI_STREAMING_URL = `${ASSEMBLYAI_STREAMING_BASE_URL}?${queryString}`;

// Log the URL (without exposing full key) for debugging
console.log(`🔑 AssemblyAI API Key: ${ASSEMBLYAI_API_KEY.substring(0, 8)}...${ASSEMBLYAI_API_KEY.substring(ASSEMBLYAI_API_KEY.length - 4)}`);
console.log(`🌐 AssemblyAI WebSocket URL: ${ASSEMBLYAI_STREAMING_BASE_URL}?${queryString}`);
console.log(`📝 Using v3 Streaming API with Authorization header`);

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
// Store AssemblyAI streaming connections (maps connectionId -> AssemblyAI WebSocket)
const assemblyAIConnections = new Map();
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
      // Check if message is binary (audio data) or text (JSON)
      if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
        // Binary audio data - forward directly to AssemblyAI
        await handleAudioChunkForAssemblyAI(connectionId, data, Date.now());
        return;
      }

      // Try to parse as JSON
      let message;
      if (typeof data === 'string') {
        message = JSON.parse(data);
      } else {
        // Convert buffer to string
        message = JSON.parse(data.toString());
      }

      switch (message.type) {
        case 'audio_chunk':
          // Handle base64 encoded audio (legacy support)
          await handleAudioChunkForAssemblyAI(connectionId, message.audioData, message.timestamp);
          break;
        case 'register_speaker':
          await registerSpeaker(connectionId, message.speakerName, message.audioData);
          break;
        case 'start_transcription':
          await startAssemblyAIStreaming(connectionId);
          break;
        case 'stop_transcription':
          await stopAssemblyAIStreaming(connectionId);
          break;
      }
    } catch (error) {
      // If it's not JSON, it might be binary audio data
      if (error instanceof SyntaxError && (Buffer.isBuffer(data) || data instanceof ArrayBuffer)) {
        // Binary audio data - forward to AssemblyAI
        await handleAudioChunkForAssemblyAI(connectionId, data, Date.now());
      } else {
        console.error('❌ Error processing WebSocket message:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    }
  });

  ws.on('close', () => {
    // Clean up AssemblyAI connection if it exists
    const aaiWs = assemblyAIConnections.get(connectionId);
    if (aaiWs) {
      aaiWs.close();
      assemblyAIConnections.delete(connectionId);
    }
    activeConnections.delete(connectionId);
    console.log(`WebSocket connection closed: ${connectionId}`);
  });
});

// Handle audio chunk for AssemblyAI streaming
async function handleAudioChunkForAssemblyAI(connectionId, audioData, timestamp) {
  try {
    const aaiWs = assemblyAIConnections.get(connectionId);

    if (!aaiWs || aaiWs.readyState !== WebSocket.OPEN) {
      console.warn(`⚠️ AssemblyAI connection not ready for ${connectionId}, attempting to reconnect...`);
      await startAssemblyAIStreaming(connectionId);
      // Wait a bit for connection to establish
      await new Promise(resolve => setTimeout(resolve, 500));
      const newAaiWs = assemblyAIConnections.get(connectionId);
      if (!newAaiWs || newAaiWs.readyState !== WebSocket.OPEN) {
        console.error(`❌ Failed to establish AssemblyAI connection for ${connectionId}`);
        return;
      }
    }

    // audioData can be either:
    // 1. Base64 string (from old implementation)
    // 2. ArrayBuffer (from new WebSocket implementation)
    let audioBuffer;

    if (typeof audioData === 'string') {
      // Convert base64 audio data to buffer
      audioBuffer = Buffer.from(audioData, 'base64');
    } else if (audioData instanceof ArrayBuffer) {
      // Already a buffer
      audioBuffer = Buffer.from(audioData);
    } else if (Buffer.isBuffer(audioData)) {
      // Already a Buffer
      audioBuffer = audioData;
    } else {
      console.warn('⚠️ Unknown audio data format:', typeof audioData);
      return;
    }

    // Send audio data to AssemblyAI (they expect raw PCM audio bytes)
    // The audio should be 16-bit PCM, 16kHz, mono
    if (aaiWs.readyState === WebSocket.OPEN) {
      aaiWs.send(audioBuffer);
    }

  } catch (error) {
    console.error('❌ Error sending audio chunk to AssemblyAI:', error);
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

// Transcribe & (optionally) summarize audio with AssemblyAI
async function transcribeWithAssemblyAI(audioFilePath) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY || '4fc97d963b464430bfb009706d15da1b';

  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is not set in environment variables');
  }

  const audioBuffer = fs.readFileSync(audioFilePath);

  // 1) Upload the audio file to AssemblyAI
  const uploadResponse = await axios.post(
    'https://api.assemblyai.com/v2/upload',
    audioBuffer,
    {
      headers: {
        authorization: apiKey,
        'content-type': 'application/octet-stream',
        'transfer-encoding': 'chunked'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    }
  );

  const audioUrl = uploadResponse.data.upload_url;

  // 2) Create a transcription request (with summarization for "class notes" style output)
  const transcriptResponse = await axios.post(
    'https://api.assemblyai.com/v2/transcript',
    {
      audio_url: audioUrl,
      speaker_labels: true,
      summarization: true,
      summary_model: 'informative',
      summary_type: 'paragraph'
    },
    {
      headers: {
        authorization: apiKey,
        'content-type': 'application/json'
      }
    }
  );

  const transcriptId = transcriptResponse.data.id;

  // 3) Poll for completion
  let transcriptResult;
  while (true) {
    const pollingResponse = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
      {
        headers: {
          authorization: apiKey
        }
      }
    );

    transcriptResult = pollingResponse.data;

    if (transcriptResult.status === 'completed') {
      break;
    }

    if (transcriptResult.status === 'error') {
      throw new Error(
        `AssemblyAI transcription failed: ${transcriptResult.error || 'Unknown error'}`
      );
    }

    // Wait a bit before polling again
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return {
    text: transcriptResult.text || '',
    summary: transcriptResult.summary || null,
    utterances: transcriptResult.utterances || [],
    raw: transcriptResult
  };
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

// Start AssemblyAI streaming transcription
async function startAssemblyAIStreaming(connectionId) {
  try {
    // Close existing connection if any
    const existingAaiWs = assemblyAIConnections.get(connectionId);
    if (existingAaiWs) {
      console.log(`🔄 Closing existing AssemblyAI connection for ${connectionId}`);
      existingAaiWs.close();
      // Wait a bit before creating new connection
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Verify API key before connecting
    if (!ASSEMBLYAI_API_KEY || ASSEMBLYAI_API_KEY.length !== 32) {
      throw new Error(`Invalid API key format. Expected 32 characters, got ${ASSEMBLYAI_API_KEY?.length || 0}`);
    }

    console.log(`🔌 Creating AssemblyAI WebSocket connection for ${connectionId}...`);
    console.log(`🔑 Using API key: ${ASSEMBLYAI_API_KEY.substring(0, 8)}...${ASSEMBLYAI_API_KEY.substring(ASSEMBLYAI_API_KEY.length - 4)}`);

    // Create WebSocket connection to AssemblyAI v3 API
    // v3 API uses Authorization header - ws library supports headers in options
    const aaiWs = new WebSocket(ASSEMBLYAI_STREAMING_URL, {
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY
      },
      perMessageDeflate: false  // Disable compression for real-time streaming
    });

    // Handle AssemblyAI connection open
    aaiWs.on('open', () => {
      console.log(`═══════════════════════════════════════════════════════`);
      console.log(`🤖 ASSEMBLYAI CONNECTION ESTABLISHED`);
      console.log(`═══════════════════════════════════════════════════════`);
      console.log(`✅ Connection ID: ${connectionId}`);
      console.log(`✅ Connected to AssemblyAI real-time API`);
      console.log(`✅ Using AssemblyAI for transcription (NOT Web Speech API)`);
      console.log(`═══════════════════════════════════════════════════════`);

      // v3 API doesn't require session config - connection params are in URL
      // The API will automatically start when we send audio data
      console.log(`✅ Ready to stream audio to AssemblyAI v3 API`);

      // Notify client that transcription started
      const ws = activeConnections.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'transcription_started',
          connectionId: connectionId,
          service: 'assemblyai'
        }));
      }
    });

    // Handle messages from AssemblyAI
    aaiWs.on('message', (data) => {
      try {
        // AssemblyAI sends JSON messages
        const message = JSON.parse(data.toString());

        // Handle different message types from AssemblyAI v3 API
        const msgType = message.type; // v3 uses 'type' field

        switch (msgType) {
          case 'Begin':
            // Session started
            const sessionId = message.id;
            const expiresAt = message.expires_at;
            console.log(`✅ AssemblyAI session started: ID=${sessionId}, ExpiresAt=${expiresAt ? new Date(expiresAt * 1000).toISOString() : 'N/A'}`);
            break;

          case 'Turn':
            // Transcript turn (can be interim or final based on turn_is_formatted)
            const transcript = message.transcript || '';
            const isFormatted = message.turn_is_formatted || false;
            const ws = activeConnections.get(connectionId);

            if (ws && ws.readyState === WebSocket.OPEN && transcript) {
              if (isFormatted) {
                // Final formatted transcript
                console.log(`📝 [ASSEMBLYAI] Final transcript: "${transcript.substring(0, 50)}..."`);
                ws.send(JSON.stringify({
                  type: 'transcription_result',
                  text: transcript,
                  speaker: 'Speaker',
                  confidence: 1.0,
                  timestamp: Date.now(),
                  end_of_turn: true
                }));
              } else {
                // Interim transcript
                ws.send(JSON.stringify({
                  type: 'transcription_interim',
                  text: transcript,
                  speaker: 'Speaker',
                  timestamp: Date.now()
                }));
              }
            }
            break;

          case 'Termination':
            // Session terminated
            const audioDuration = message.audio_duration_seconds || 0;
            const sessionDuration = message.session_duration_seconds || 0;
            console.log(`AssemblyAI session terminated: Audio Duration=${audioDuration}s, Session Duration=${sessionDuration}s`);
            const wsTerm = activeConnections.get(connectionId);
            if (wsTerm && wsTerm.readyState === WebSocket.OPEN) {
              wsTerm.send(JSON.stringify({
                type: 'transcription_stopped',
                connectionId: connectionId,
                audio_duration: audioDuration
              }));
            }
            break;

          case 'Error':
            console.error(`❌ AssemblyAI error for ${connectionId}:`, message.error || message.message);
            const wsErr = activeConnections.get(connectionId);
            if (wsErr && wsErr.readyState === WebSocket.OPEN) {
              wsErr.send(JSON.stringify({
                type: 'error',
                message: message.error || message.message || 'AssemblyAI transcription error'
              }));
            }
            break;

          default:
            // Handle other message types (like UtteranceEnd, etc.)
            if (message.text) {
              const ws = activeConnections.get(connectionId);
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'transcription_result',
                  text: message.text,
                  speaker: message.speaker || 'Speaker',
                  confidence: message.confidence || 1.0,
                  timestamp: Date.now()
                }));
              }
            }
            break;
        }
      } catch (parseError) {
        // If it's not JSON, it might be binary audio data (shouldn't happen from AssemblyAI)
        console.warn('⚠️ Received non-JSON message from AssemblyAI:', parseError);
      }
    });

    // Handle AssemblyAI connection errors
    aaiWs.on('error', (error) => {
      console.error(`❌ AssemblyAI WebSocket error for ${connectionId}:`, error);
      const ws = activeConnections.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `AssemblyAI connection error: ${error.message}`
        }));
      }
    });

    // Handle AssemblyAI connection close
    aaiWs.on('close', (code, reason) => {
      const reasonStr = reason?.toString() || '';
      console.log(`🔌 AssemblyAI streaming closed for ${connectionId} (code: ${code}, reason: ${reasonStr})`);

      // Check if it's an authentication error
      if (code === 4001 || reasonStr.includes('Not authorized') || reasonStr.includes('Unauthorized')) {
        console.error('═══════════════════════════════════════════════════════');
        console.error('❌ ASSEMBLYAI AUTHENTICATION ERROR');
        console.error('═══════════════════════════════════════════════════════');
        console.error('The API key is being rejected by AssemblyAI.');
        console.error('Possible reasons:');
        console.error('  1. API key is invalid or expired');
        console.error('  2. API key does not have real-time API access');
        console.error('  3. API key format is incorrect');
        console.error(`Current key: ${ASSEMBLYAI_API_KEY.substring(0, 8)}...${ASSEMBLYAI_API_KEY.substring(ASSEMBLYAI_API_KEY.length - 4)}`);
        console.error('═══════════════════════════════════════════════════════');
        console.error('💡 SOLUTION:');
        console.error('  1. Go to https://www.assemblyai.com/app/account');
        console.error('  2. Check if your API key is valid');
        console.error('  3. Make sure your account has real-time API access');
        console.error('  4. Generate a new API key if needed');
        console.error('  5. Update the key in server.js line 14');
        console.error('═══════════════════════════════════════════════════════');

        const ws = activeConnections.get(connectionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'transcription_error',
            error: 'AssemblyAI authentication failed. The API key may be invalid or expired. Please check your API key at https://www.assemblyai.com/app/account'
          }));
        }
        assemblyAIConnections.delete(connectionId);
        return; // Don't retry on auth errors - it will just keep failing
      }

      assemblyAIConnections.delete(connectionId);

      // Notify client
      const ws = activeConnections.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'transcription_stopped',
          connectionId: connectionId
        }));
      }
    });

    // Store the AssemblyAI connection
    assemblyAIConnections.set(connectionId, aaiWs);

  } catch (error) {
    console.error(`❌ Error starting AssemblyAI streaming for ${connectionId}:`, error);
    const ws = activeConnections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Failed to start AssemblyAI streaming: ${error.message}`
      }));
    }
  }
}

// Stop AssemblyAI streaming transcription
async function stopAssemblyAIStreaming(connectionId) {
  try {
    const aaiWs = assemblyAIConnections.get(connectionId);

    if (aaiWs) {
      if (aaiWs.readyState === WebSocket.OPEN) {
        // Send termination message to AssemblyAI v3 API
        // v3 API uses 'Terminate' type
        aaiWs.send(JSON.stringify({
          type: 'Terminate'
        }));
      }

      // Close the connection
      aaiWs.close();
    }

    assemblyAIConnections.delete(connectionId);

    // Notify client
    const ws = activeConnections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'transcription_stopped',
        connectionId: connectionId
      }));
    }

    console.log(`✅ AssemblyAI streaming stopped for ${connectionId}`);

  } catch (error) {
    console.error(`❌ Error stopping AssemblyAI streaming for ${connectionId}:`, error);
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

// Test endpoint that uses AssemblyAI instead of local Whisper
app.post('/api/transcribe-assembly', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const result = await transcribeWithAssemblyAI(req.file.path);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      text: result.text.trim(),
      summary: result.summary,
      utterances: result.utterances
    });
  } catch (error) {
    console.error('AssemblyAI transcription error:', error);
    res.status(500).json({ error: error.message || 'AssemblyAI transcription failed' });
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
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`🚀 ONIX Transcription Server Started`);
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔌 WebSocket server ready for connections`);
  console.log(`🤖 Using AssemblyAI for transcription`);
  console.log(`🔑 API Key: ${ASSEMBLYAI_API_KEY.substring(0, 10)}...${ASSEMBLYAI_API_KEY.substring(ASSEMBLYAI_API_KEY.length - 4)}`);
  console.log(`🌐 AssemblyAI URL: wss://api.assemblyai.com/v2/realtime/ws`);
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`✅ Ready to receive connections from Chrome extension`);
  console.log(`═══════════════════════════════════════════════════════`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
