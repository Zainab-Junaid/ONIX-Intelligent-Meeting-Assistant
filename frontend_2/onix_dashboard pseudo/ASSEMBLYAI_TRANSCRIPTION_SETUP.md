# AssemblyAI Transcription Setup Guide

## Overview

The extension now supports **AssemblyAI transcription** as an alternative to Web Speech API. AssemblyAI provides:
- ✅ Better accuracy
- ✅ Works with tab audio (meeting audio, not microphone)
- ✅ More reliable transcription
- ✅ Better handling of multiple speakers

## How It Works

1. **Audio Capture**: Tab audio is captured using Chrome's `tabCapture` API
2. **Audio Processing**: Audio is converted to PCM format and sent to AssemblyAI API
3. **Transcription**: AssemblyAI processes the audio and returns text
4. **Display**: Transcription results are shown in real-time in the sidepanel

## Setup Instructions

### 1. API Key Configuration

Make sure your `.env.local` file has the AssemblyAI API key:

```bash
ASSEMBLYAI_API_KEY=your-api-key-here
```

### 2. Start Your Dashboard

```bash
cd frontend/onix_dashboard
npm run dev
```

The dashboard should be running at `http://localhost:3000`

### 3. How to Use

1. **Start a meeting capture** in the extension
2. The extension will automatically:
   - Capture tab audio (meeting audio)
   - Send audio chunks to AssemblyAI every 3 seconds
   - Display transcription results in real-time

## Technical Details

### Audio Processing

- **Sample Rate**: 16kHz (standard for speech recognition)
- **Format**: PCM (16-bit signed integers)
- **Chunk Duration**: 3 seconds
- **Encoding**: WAV format for API transmission

### API Endpoint

The transcription API endpoint is:
```
POST /api/extension-meetings/transcribe-audio
```

**Request:**
- `audio`: WAV file (FormData)
- `meetingId`: Current meeting document ID
- `isFinal`: Boolean (false for streaming chunks)

**Response:**
```json
{
  "success": true,
  "text": "Transcribed text here",
  "confidence": 0.85,
  "isFinal": false,
  "timestamp": 1234567890
}
```

## Fallback Behavior

If AssemblyAI transcription fails or is unavailable:
- The extension automatically falls back to **Web Speech API**
- Web Speech API uses your microphone (not tab audio)
- You'll see a status message indicating which method is being used

## Troubleshooting

### Issue: "No transcription results"

**Possible causes:**
1. Dashboard not running at `http://localhost:3000`
2. API key not configured in `.env.local`
3. No audio in the meeting tab

**Solutions:**
- Check dashboard is running: `npm run dev`
- Verify API key in `.env.local`
- Make sure meeting has audio playing

### Issue: "Failed to fetch"

**Possible causes:**
1. Dashboard URL incorrect
2. CORS issues
3. Network connectivity

**Solutions:**
- Verify dashboard URL in `content.js` (default: `http://localhost:3000`)
- Check browser console for errors
- Ensure dashboard is accessible

### Issue: "No auth token"

**Possible causes:**
1. User not signed in
2. No active meeting

**Solutions:**
- Sign in to the extension
- Start a meeting capture first

## Cost Considerations

AssemblyAI transcription is **paid** (not free like Web Speech API):
- **Pay-as-you-go**: ~$0.00025 per minute
- **Real-time API**: Slightly higher cost
- Check [AssemblyAI pricing](https://www.assemblyai.com/pricing) for current rates

## Comparison: AssemblyAI vs Web Speech API

| Feature | AssemblyAI | Web Speech API |
|---------|------------|----------------|
| **Accuracy** | ⭐⭐⭐⭐⭐ High | ⭐⭐⭐ Medium |
| **Tab Audio** | ✅ Yes | ❌ No (uses mic) |
| **Cost** | 💰 Paid | 🆓 Free |
| **Reliability** | ⭐⭐⭐⭐⭐ High | ⭐⭐⭐ Medium |
| **Setup** | Requires API key | No setup needed |

## Next Steps

1. Test with a short meeting (1-2 minutes)
2. Check transcription quality
3. Compare with Web Speech API results
4. Decide which method works best for your use case

## Notes

- AssemblyAI transcription runs **in parallel** with Web Speech API
- Both results are displayed (you'll see both transcriptions)
- AssemblyAI results are marked with `source: 'assemblyai'`
- You can disable Web Speech API fallback if desired (modify `content.js`)


