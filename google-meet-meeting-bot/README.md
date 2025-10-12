# Google Meet Meeting Bot

A comprehensive meeting automation bot that can join Google Meet sessions, record audio, generate transcriptions, and provide intelligent summaries using AI.

## 🚀 Features

- **Automated Meeting Joining**: Uses Playwright to automatically join Google Meet sessions
- **Intelligent Summarization**: Generates meeting summaries using AI
- **Database Storage**: PostgreSQL database for storing meeting data and summaries
- **Docker Support**: Fully containerized application for easy deployment
- **REST API**: Backend API for managing meetings and accessing data

## 🏗️ Architecture

This project uses a microservices architecture with the following components:

- **Backend** (`src/backend/`): Express.js API server with Prisma ORM
- **Bot** (`src/bot/`): Meeting automation logic
- **Frontend** (`src/frontend/`): Web interface
- **Playwright** (`src/playwright/`): Browser automation for Google Meet
- **Database**: PostgreSQL with Prisma migrations

## 📋 Prerequisites

- Node.js 18+
- Docker and Docker Compose
- PostgreSQL (or use Docker)
- Google Meet account
- AssemblyAI API key

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd google-meet-meeting-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Generate Prisma client**
   ```bash
   npm run generate
   ```

5. **Run database migrations**
   ```bash
   npm run migrate
   ```

## 🚀 Quick Start

### Using Docker (Recommended)

1. **Start all services**
   ```bash
   docker-compose up -d
   ```

2. **Check service status**
   ```bash
   docker-compose ps
   ```

3. **View logs**
   ```bash
   docker-compose logs -f backend
   ```

### Development Mode

1. **Start database**
   ```bash
   docker-compose up postgres -d
   ```

2. **Run development servers**
   ```bash
   npm run dev
   ```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc"

# AssemblyAI
ASSEMBLYAI_API_KEY="your_assemblyai_api_key"

# Google Meet
GOOGLE_MEET_URL="https://meet.google.com/your-meeting-id"

# Server
PORT=3001
NODE_ENV=development
```

### Google Meet Authentication

1. Generate authentication file:
   ```bash
   npm run gen:auth
   ```

2. Follow the prompts to authenticate with Google

## 📖 API Endpoints

### Meetings
- `GET /api/meetings` - List all meetings
- `POST /api/meetings` - Create new meeting
- `GET /api/meetings/:id` - Get meeting details
- `PUT /api/meetings/:id` - Update meeting
- `DELETE /api/meetings/:id` - Delete meeting

### Summaries
- `GET /api/summaries` - List all summaries
- `GET /api/summaries/:id` - Get summary details
- `POST /api/summaries` - Generate new summary

## 🐳 Docker Services

- **postgres**: PostgreSQL database
- **backend**: Express.js API server
- **bot**: Meeting automation bot

## 📁 Project Structure

```
google-meet-meeting-bot/
├── src/
│   ├── backend/          # Express.js API server
│   ├── bot/             # Meeting bot logic
│   ├── frontend/        # Web interface
│   ├── playwright/      # Browser automation
│   └── models.ts        # Shared data models
├── scripts/             # Utility scripts
├── docker-compose.yml   # Docker services configuration
├── Dockerfile.be        # Backend Docker image
├── Dockerfile.bot       # Bot Docker image
└── package.json         # Workspace configuration
```

## 🔄 Development Workflow

1. **Database changes**: Update `src/backend/schema.prisma` and run migrations
2. **API changes**: Modify files in `src/backend/`
3. **Bot logic**: Update files in `src/bot/` and `src/playwright/`
4. **Frontend**: Modify files in `src/frontend/`

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:backend
npm run test:bot
```

## 📝 Scripts

- `npm run dev` - Start development servers
- `npm run build` - Build all components
- `npm run generate` - Generate Prisma client
- `npm run migrate` - Run database migrations
- `npm run studio` - Open Prisma Studio
- `npm run gen:auth` - Generate Google authentication

## 🚨 Troubleshooting

### Common Issues

1. **Database connection failed**
   - Ensure PostgreSQL is running
   - Check DATABASE_URL in .env

2. **AssemblyAI API errors**
   - Verify ASSEMBLYAI_API_KEY is correct
   - Check API quota and billing

3. **Google Meet authentication issues**
   - Regenerate auth.json using `npm run gen:auth`
   - Ensure proper Google account permissions

4. **Docker build failures**
   - Clear Docker cache: `docker system prune`
   - Rebuild images: `docker-compose build --no-cache`


