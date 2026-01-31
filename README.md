# EliteBallKalendar (EBK)

A calendar-aware weekly scheduler with live AI rescheduler and productivity stats recap.

## Features

- **Weekly Scheduler**: Input goals → generate focus blocks into free calendar gaps → preview → apply to Google Calendar
- **Live AI Rescheduler**: Chat or voice commands like "I'm late, move all work blocks before 11am" → preview changes → confirm → apply
- **Stats Wrapped**: Track focused hours per goal, reschedules, recovered hours with a story-mode presentation

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: SQLite + Prisma ORM
- **AI**: Gemini API + Bear1 compression middleware
- **Voice**: ElevenLabs TTS/STT
- **Calendar**: Google Calendar API

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Google Cloud Console project with Calendar API enabled

### Setup

1. **Clone and install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Fill in your API keys in `.env.local`:
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from [Google Cloud Console](https://console.cloud.google.com/)
   - `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/)
   - `ELEVENLABS_API_KEY` from [ElevenLabs](https://elevenlabs.io/)
   - `BEAR1_API_KEY` from Bear1 API

3. **Set up the database**
   ```bash
   npm run db:push
   ```

4. **Start development servers**
   ```bash
   npm run dev
   ```
   
   This starts:
   - Frontend at http://localhost:3000
   - Backend API at http://localhost:3001

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Google Calendar API"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set authorized redirect URI to: `http://localhost:3001/api/auth/google/callback`
6. Copy Client ID and Secret to `.env.local`

## Project Structure

```
├── prisma/
│   └── schema.prisma      # Database schema
├── server/
│   ├── index.ts           # Express server entry
│   ├── lib/               # Utility libraries
│   └── routes/            # API route handlers
├── src/
│   ├── components/        # React components
│   │   └── ui/            # shadcn/ui components
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Frontend utilities
│   └── pages/             # Page components
├── .env.example           # Environment template
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/auth/google` | GET | Start Google OAuth |
| `/api/auth/google/callback` | GET | OAuth callback |
| `/api/auth/me` | GET | Get current user |
| `/api/calendar/events` | GET | List calendar events |
| `/api/goals` | GET/POST | List/create goals |
| `/api/goals/:id` | PUT/DELETE | Update/delete goal |
| `/api/scheduler/generate` | POST | Generate focus blocks |
| `/api/scheduler/apply` | POST | Apply blocks to calendar |
| `/api/reschedule` | POST | AI reschedule request |
| `/api/voice/stt` | POST | Speech to text |
| `/api/voice/tts` | POST | Text to speech |
| `/api/stats` | GET | Get productivity stats |

## License

MIT
