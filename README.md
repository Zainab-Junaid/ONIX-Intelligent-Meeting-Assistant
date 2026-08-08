# ONIX — Your Intelligent AI Meeting Assistant

Developed by: Zainab Junaid, Laraib Zafar, Uswah Fatima, Mubashra Iftikhar, Iqra Ishaq

> ONIX is an intelligent AI meeting assistant that captures meeting audio, produces speaker-aware transcripts, generates concise summaries, extracts action items and decisions, sends follow-up emails to participants, and integrates with calendars and collaboration tools to help teams stay aligned.
> Works both as a meeting bot and a Chrome extension

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]() [![License: MIT](https://img.shields.io/badge/license-MIT-blue)]() [![Coverage Status](https://img.shields.io/badge/coverage---yellow)]()

Table of contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture & Data Flow](#architecture--data-flow)
- [Quickstart — Local Development](#quickstart--local-development)
- [Environment Variables (.env.example)](#environment-variables-envexample)
- [API Reference (example endpoints)](#api-reference-example-endpoints)
- [Frontend Usage & UX Flow](#frontend-usage--ux-flow)
- [Database Schema (recommended)](#database-schema-recommended)
- [Security, Privacy & Compliance](#security-privacy--compliance)
- [Deployment & Scaling](#deployment--scaling)
- [Testing & CI](#testing--ci)
- [Observability & Monitoring](#observability--monitoring)
- [Contributing](#contributing)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [Roadmap](#roadmap)
- [Acknowledgements](#acknowledgements)
- [License](#license)

---

## Overview
ONIX is designed to automate the tedious parts of meetings:
- Real-time transcription with speaker diarization
- Short, actionable summaries for meeting participants
- Action item extraction with assignees and deadlines
- Calendar integration (create events, attach summaries)
- Searchable meeting history with attachments and metadata
- Privacy-first architecture (configurable retention, on-premise options)

It aims to be flexible: run fully in the cloud, or in partially on-premises setups for sensitive data.

## Key Features
- Real-time and post-call transcription (supports prerecorded audio)
- Speaker diarization (who said what)
- Multi-tier summaries: bullet summary → short summary → executive summary
- Automatic action item and decision extraction (with suggested assignees)
- Smart highlighting of follow-ups and deadlines
- Integration adapters: Google Calendar, Outlook Calendar, Slack, Microsoft Teams, Notion
- Role-aware access controls and meeting-level data retention policies
- Export formats: SRT, VTT, plain text, PDF, markdown
- Multi-language support (configurable models)

## Tech Stack
- Frontend: Next.js (TypeScript), React
- Backend: Node.js + Express / NestJS (TypeScript)
- Transcription / Speech: Whisper (open-source), cloud STT (optional: Google Cloud Speech-to-Text, Azure Speech)
- LLMs and NLP: OpenAI APIs (GPT / embeddings), or self-hosted LLMs for on-prem option
- Database: PostgreSQL (primary), Redis (caching, websocket), MinIO or S3-compatible object store (audio, artifacts)
- Realtime: WebSockets (Socket.IO) or WebRTC for audio piping
- Containerization: Docker, Docker Compose; Kubernetes for production
- CI: GitHub Actions
- Testing: Jest (unit), Playwright or Cypress (E2E)
- Observability: Prometheus/Grafana or third-party APM (DataDog/New Relic)
- Languages in the repo: TypeScript, JavaScript, Python (for model utilities), HTML/CSS, shell scripts

## Architecture & Data Flow
1. Client (web or native) joins/creates a meeting.
2. Audio stream is recorded or ingested (WebRTC or uploaded file).
3. Audio chunking -> STT model (Whisper or cloud STT) -> partial transcripts.
4. Speaker diarization applied to chunks -> labeled segments.
5. Transcript segments sent to NLP pipeline:
   - Summarization (short/executive)
   - Action item detection
   - Named-entity recognition (people, dates, tasks)
   - Embeddings for semantic search (store in vector DB or use PostgreSQL + pgvector)
6. Results stored in DB and object store; notifications sent to participants; calendar events updated or created if needed.

Notes:
- Use a queue (e.g., BullMQ) for asynchronous processing and retries.
- Keep real-time pipeline lightweight; offload expensive summarization to worker nodes.

## Quickstart — Local Development
Prerequisites:
- Node.js 18+ (or the project's required version)
- PostgreSQL
- Redis (optional but recommended)
- Docker & Docker Compose (optional)
- Yarn or npm

1. Clone the repo
```bash
git clone https://github.com/Zainab-Junaid/ONIX-Intelligent-Meeting-Assistant.git
cd ONIX-Intelligent-Meeting-Assistant
```

2. Install dependencies
```bash
# yarn
yarn install

# or npm
npm install
```

3. Copy env file and configure
```bash
cp .env.example .env
# Edit .env with keys for DB, API keys, etc.
```

4. Run database migrations
```bash
# Example, adapt to project scripts
yarn prisma migrate dev
# or
npm run migrate
```

5. Start development servers
```bash
# start backend
yarn workspace backend dev

# start frontend
yarn workspace frontend dev
```

6. Open the frontend at http://localhost:3000 (or configured port)

Docker (quick):
```bash
# start postgres, redis, and app via docker-compose
docker-compose up --build
```

## Environment Variables (.env.example)
A recommended .env.example to guide local setup:

```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/onix

# Redis
REDIS_URL=redis://localhost:6379

# JWT / Auth
JWT_SECRET=replace_with_secure_value
SESSION_SECRET=replace_with_secure_value

# Storage
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=onix-bucket
S3_ACCESS_KEY_ID=youraccesskey
S3_SECRET_ACCESS_KEY=yoursecretkey

# OpenAI / LLM
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Speech / STT (optional)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/google-creds.json
WHISPER_BACKEND=local # or "openai_whisper", "google_stt"

# App
PORT=4000
FRONTEND_URL=http://localhost:3000
```

Adjust to include integrations (Slack, Google, Outlook) and SMTP settings for email notifications.

## API Reference (example endpoints)
These are example endpoints — adapt to the actual server routes your project exposes.

- Create a meeting
  POST /api/meetings
  Request:
  ```json
  {
    "title": "Product Sync",
    "start_time": "2026-08-10T10:00:00Z",
    "participants": ["alice@example.com","bob@example.com"]
  }
  ```
  Response:
  ```json
  {
    "id": "meeting_123",
    "title": "Product Sync",
    "join_url": "https://app.example.com/meetings/meeting_123/join"
  }
  ```

- Upload audio (post-meeting)
  POST /api/meetings/:id/audio
  Form: file field `audio`

- Start live transcription
  POST /api/meetings/:id/transcription/start
  Response:
  ```json
  { "status": "transcription_started", "socket_channel": "transcript-meeting_123" }
  ```

- Retrieve transcript
  GET /api/meetings/:id/transcript
  Response:
  ```json
  {
    "transcript_id": "t_456",
    "segments": [
      { "speaker": "Alice", "start": 12.3, "end": 14.8, "text": "Let's ship the update." }
    ]
  }
  ```

- Get summary
  GET /api/meetings/:id/summary?level=short
  Response:
  ```json
  {
    "level": "short",
    "summary": "Decided to ship the update; Alice to own the patch; deadline Aug 20."
  }
  ```

## Frontend Usage & UX Flow
- Meeting creation: invite participants through email calendar integration.
- Join meeting: microphone permission asked; option to record locally or stream.
- Live UI:
  - Live transcript area with speaker labels
  - Highlighted action items and decisions panel
  - Timelines to jump to audio intervals (click segment -> play)
- Post-call UI:
  - Download transcript (SRT/VTT)
  - View summaries at three levels
  - Assign action items, set deadlines
  - Share summary to Slack/Email/Notion

UX Tips:
- Provide a "redaction" mode for private remarks before sharing externally.
- Allow per-meeting retention policy to aut-delete raw audio after X days.

## Database Schema (recommended)
Simplified core tables:

- users: id, email, name, role, settings
- meetings: id, title, organizer_id, start_time, end_time, metadata
- participants: id, meeting_id, user_id, email, role
- audio_blobs: id, meeting_id, file_path, uploaded_at, length_seconds
- transcripts: id, meeting_id, segments(jsonb), full_text, created_at
- summaries: id, meeting_id, level(short|long|exec), content, created_at
- actions: id, meeting_id, text, assignee_id, status, due_date, created_by
- embeddings: id, meeting_id, vector, content_ref

Use pgvector (or a dedicated vector DB) for semantic search.

## Security, Privacy & Compliance
- Secure credentials in environment variables or secret manager (Azure Key Vault, AWS Secrets Manager).
- Encrypt audio and transcripts at rest (S3 + server-side encryption) and in transit (TLS).
- Implement RBAC for access to meeting artifacts.
- Provide meeting-level retention policies and on-demand deletion.
- Audit logs for access and exports.
- If storing PII, follow GDPR/CCPA guidelines (data subject access, deletion flows).
- For HIPAA sensitive deployments, prefer on-premise STT and LLMs and sign appropriate BAAs.

## Deployment & Scaling
- Small teams: a single Node backend + Next.js frontend + managed Postgres + S3 + Redis.
- Medium/large: containerize services and deploy on Kubernetes.
  - Use horizontal autoscaling for workers processing STT and LLM inference.
  - Use managed vector DBs if available, or scale pgvector with proper hardware.
- Use asynchronous worker queues (BullMQ/Sidekiq-like) for heavy NLP tasks.
- Use a CDN for static frontend assets.
- Consider spot instances for cost savings on heavy batch processing.

Suggested deployment targets:
- Frontend: Vercel / Netlify (for Next.js static)
- Backend: Cloud Run / App Engine / ECS / EC2 / Kubernetes
- Model inference: dedicated GPU nodes, or cloud-managed LLM endpoints

## Testing & CI
- Unit tests: Jest + ts-jest
- Integration tests: run DB (test container) and Redis with test scripts
- E2E: Playwright or Cypress to cover critical paths (join meeting, transcript flow)
- CI pipeline (GitHub Actions):
  - Lint -> Unit tests -> Build -> Publish artifacts
  - Optional: integration test job with docker-compose services

## Observability & Monitoring
- Structured logging (JSON) and centralized log aggregation (ELK, DataDog).
- Metrics: request duration, transcription latency, processing queue length.
- Alerts: job failure rate, queue backlog > threshold, error rate spike.
- Traces: instrument critical calls (STT, LLM requests) with OpenTelemetry.

## Contributing
We welcome contributions!

- Fork the repo
- Create a branch: feature/my-feature
- Add tests and update docs
- Open a PR with a clear description and screenshots where relevant

Please follow the repository's coding conventions:
- TypeScript + strict typing
- Lint and format with Prettier and ESLint
- Write unit tests for new logic

Add an issue if you'd like to discuss large changes first.

## Troubleshooting & FAQ
Q: Transcription is inaccurate on noisy audio — what to do?
- Use higher-quality audio (16kHz+). Preprocess noise reduction. Try alternative STT backends (cloud vs local).
- Increase chunk size or configure voice activity detection thresholds.

Q: Summaries are too verbose or too short
- Tweak model prompts and max tokens used for summarization.
- Provide meeting context and agenda to improve summarization.

## Roadmap
Planned improvements:
- Live transcript corrections (user edits feed to model to refine future summaries)
- Video support (slide/context-aware captions)
- Realtime participant sentiment & attention analytics
- Multi-language speaker diarization improvements
- Native mobile clients with background recording support

## Acknowledgements
Thanks to the open-source projects and model providers:
- Whisper (OpenAI) and other STT systems
- OpenAI / Hugging Face models for LLM tasks
- Vector DBs and pgvector projects

## License
This project is provided under the MIT License. See LICENSE for details.
