# Onix Meeting Assistant

A browser extension that captures real-time meeting audio and provides live transcription with speaker identification using the tabCapture API.

## Features

-  **Real-time Audio Capture**: Uses Chrome's tabCapture API to capture meeting audio without turning on captions
-  **Speaker Identification**: Identifies different speakers by their voice characteristics
-  **Live Transcription**: Real-time speech-to-text using WebSpeech API
-  **Clean UI**: Modern, responsive interface that displays speaker-labeled transcripts
-  **Real-time Updates**: Live transcript updates with timestamps and confidence scores
-  **Auto-save**: Automatic saving to Firebase Firestore
-  **Noise Reduction**: Built-in audio processing for better transcription quality

## Example Output

```
Speaker 1: Hello everyone, I am here to introduce a concept.
Speaker 2: Yes, please continue with the discussion.


## Architecture

- **Frontend**: Chrome Extension (HTML, CSS, JavaScript)
- **Backend**: Node.js server with WebSocket support
- **Transcription**: WebSpeech API
- **Speaker Diarization**: pyannote-audio (optional)
- **Database**: Firebase Firestore

## Prerequisites

- Node.js 16+ and npm
- Python 3.8+
- Chrome browser
- FFmpeg (for audio processing)



### 2. Manual Setup (Alternative)

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt

# Install FFmpeg (macOS)
brew install ffmpeg

# Install FFmpeg (Ubuntu/Debian)
sudo apt-get update && sudo apt-get install -y ffmpeg

# Install FFmpeg (Windows)
# Download from https://ffmpeg.org/download.html and add to PATH
```

### 3. Configure Hugging Face Token (Optional)

For advanced speaker diarization:

1. Go to [Hugging Face Settings](https://huggingface.co/settings/tokens)
2. Create a new token
3. Accept terms for `pyannote/speaker-diarization`
4. Update `speaker_diarization.py` with your token

### 4. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `onix_extension` folder

## Usage

### 1. Start the Backend Server

```bash
npm start
# or for development
npm run dev
```

The server will start on `http://localhost:3001`

### 2. Use the Extension

1. Open a meeting in Google Meet or Zoom
2. Click the "Open Onix" button that appears on the page
3. Sign in with Google (optional, for saving transcripts)
4. Enter a meeting title
5. Click "Start Capture" to begin transcription
6. View live transcripts with speaker identification
7. Click "Stop Capture" when done
8. Save the transcript to Firebase (if signed in)


### WebSocket (ws://localhost:3001)

- `audio_chunk`: Send audio data for processing
- `transcription_result`: Receive transcription results
- `register_speaker`: Register a new speaker profile
- `start_transcription`: Start transcription session
- `stop_transcription`: Stop transcription session

### REST API

- `POST /api/transcribe`: Upload audio file for transcription
- `GET /api/speakers`: Get list of registered speakers
- `GET /api/health`: Check server health

## Configuration

### Environment Variables

```bash
PORT=3001                    # Server port
NODE_ENV=development         # Environment
```

### Firebase Configuration

Update `sidepanel.js` with your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
}
```

## Troubleshooting

### Common Issues

1. **"WebSocket connection failed"**
   - Ensure the backend server is running
   - Check firewall settings
   - Verify the server is accessible at `ws://localhost:3001`

2. **"Failed to capture tab audio"**
   - Ensure you're on a supported meeting platform (Google Meet, Zoom)
   - Check Chrome permissions for the extension
   - Try refreshing the page

3. **"Transcription error"**
   - Check if FFmpeg is installed and in PATH
   - Verify Whisper is properly installed
   - Check server logs for detailed error messages

4. **Poor speaker identification**
   - Register speaker profiles with longer audio samples
   - Ensure good audio quality
   - Consider using the advanced pyannote-audio setup

### Debug Mode

Enable debug logging by setting `NODE_ENV=development`:

```bash
NODE_ENV=development npm start
```

## Development

### Project Structure

```
onix_extension/
├── manifest.json              # Extension manifest
├── background.js              # Background script
├── content.js                 # Content script
├── sidepanel.html             # Extension UI
├── sidepanel.js               # UI logic
├── server.js                  # Backend server
├── speaker_diarization.py     # Advanced speaker diarization
├── package.json               # Node.js dependencies
├── requirements.txt           # Python dependencies
├── setup.py                   # Setup script
└── README.md                  # This file
```

### Adding New Features

1. **New Audio Processing**: Modify `content.js` and `server.js`
2. **UI Changes**: Update `sidepanel.html` and `sidepanel.js`
3. **Speaker Recognition**: Enhance `speaker_diarization.py`
4. **Database Integration**: Modify Firebase functions in `sidepanel.js`

### Testing

```bash
# Test backend server
curl http://localhost:3001/api/health

# Test WebSocket connection
# Use browser dev tools or WebSocket testing tools
```

## Security Considerations

- Audio data is processed locally and not stored permanently
- Firebase authentication is used for user management
- WebSocket connections are localhost-only by default
- No sensitive data is transmitted to external services

## Performance Optimization

- Audio chunks are processed in real-time with minimal latency
- Whisper model size can be adjusted based on accuracy vs. speed needs
- Speaker profiles are cached for faster identification
- WebSocket connections are optimized for low-latency communication

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the troubleshooting section
- Review server logs
- Open an issue on GitHub

## Roadmap

- [ ] Support for more meeting platforms
- [ ] Advanced noise reduction
- [ ] Multi-language support
- [ ] Real-time translation
- [ ] Meeting analytics and insights
- [ ] Integration with calendar apps
