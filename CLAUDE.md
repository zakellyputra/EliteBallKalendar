# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EliteBallKalendar (EBK) is a calendar-aware weekly scheduler with AI rescheduling. Users set weekly goals, and the app generates focus blocks that fit into free calendar gaps, then syncs them to Google Calendar.

## Commands

```bash
# Development (runs both frontend and backend concurrently)
npm run dev

# Individual servers
npm run dev:client    # Vite frontend on http://localhost:3000
npm run dev:server    # Express backend on http://localhost:3001

# Build
npm run build         # Vite production build to /build
```

## Architecture

### Frontend-Backend Split
- **Frontend**: Vite + React 18 + TypeScript at `src/`
- **Backend**: Express + TypeScript at `server/`
- Vite proxies `/api/*` to the backend (configured in `vite.config.ts`)

### Authentication
- **Frontend**: Firebase Auth with Google sign-in (`src/lib/firebase.ts`, `src/hooks/useAuth.ts`)
- **Backend**: Verifies Firebase ID tokens via middleware (`server/middleware/auth.ts`)
- **Google Calendar OAuth**: Separate OAuth flow to get calendar access tokens, stored in Firestore

### Database (Firebase Firestore)

Collections:
- `users` - OAuth tokens for Google Calendar (`calendarAccessToken`, `calendarRefreshToken`, `calendarTokenExpiry`)
- `goals` - User goals with `name`, `targetMinutesPerWeek`, `userId`
- `settings` - User preferences: `workingWindow` (JSON), `blockLengthMinutes`, `minGapMinutes`, `selectedCalendars`, `ebkCalendarId`
- `focusBlocks` - Links goal to calendar event: `goalId`, `start`, `end`, `status`, `calendarEventId`
- `rescheduleLog` - AI reschedule operations and compression stats

### Key Data Flow: Schedule Generation
1. User creates Goals with `targetMinutesPerWeek`
2. `POST /api/scheduler/generate` calls `server/lib/scheduler.ts:generateSchedule()`
3. Scheduler fetches user's Settings (working window, block length, min gap) and calendar events
4. Free slots are computed by subtracting busy events from working windows
5. Greedy algorithm fills free slots with focus blocks for each goal
6. Frontend displays proposed blocks; user can drag to reposition
7. `POST /api/scheduler/apply` creates Google Calendar events and FocusBlock records in Firestore

### Free Time Calculation
Both frontend (`Dashboard.tsx:calculateFreeTime()`) and backend (`scheduler.ts`) calculate available time:
- For each enabled day in `workingWindow`, compute working hours
- Subtract busy intervals (non-EliteBall events) with `minGapMinutes` buffers
- Only count slots that can fit at least one `blockLengthMinutes` block
- Calculate schedulable minutes as: `numBlocks * blockLengthMinutes` where `numBlocks = floor((slotDuration + minGapMinutes) / (blockLengthMinutes + minGapMinutes))`

### AI Rescheduling
- Uses Gemini API with Bear1 compression middleware (`server/lib/bear1.ts`)
- Voice commands via ElevenLabs TTS (`server/lib/elevenlabs.ts`) and browser Speech API
- Reschedule operations: move, create, delete blocks
- Context includes 2 weeks prior + 3 weeks future events

### Frontend State
- `src/hooks/useScheduler.ts` - Schedule generation and application
- `src/hooks/useGoals.ts` - Goal CRUD (direct Firestore)
- `src/hooks/useSettings.ts` - Settings management
- `src/hooks/useAuth.ts` - Firebase authentication
- `src/lib/api.ts` - Backend API client functions

### Backend Routes
| Route | Purpose |
|-------|---------|
| `/api/auth` | Google Calendar OAuth flow |
| `/api/calendar` | List calendars, CRUD events |
| `/api/settings` | User settings CRUD |
| `/api/goals` | Goal CRUD |
| `/api/scheduler` | Generate and apply schedule blocks |
| `/api/reschedule` | AI-powered rescheduling |
| `/api/voice` | TTS endpoint |
| `/api/stats` | Statistics and "wrapped" data |

### Routes (Pages)
| Page | Path | Purpose |
|------|------|---------|
| Dashboard | `/` | Main view with goals, scheduler, weekly calendar |
| Onboarding | `/onboarding` | First-time setup flow |
| AI Rescheduler | `/reschedule` | Chat/voice interface for rescheduling |
| Statistics | `/stats` | Productivity stats and "wrapped" summary |
| Settings | `/settings` | Working hours, block length, calendars |

## Environment Variables

Required in `.env.local`:

```bash
# Server
PORT=3001
SESSION_SECRET=your-session-secret

# Google OAuth (for Calendar API)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback

# AI Services
GEMINI_API_KEY=...
BEAR1_API_KEY=...
BEAR1_BASE_URL=https://api.bear1.ai/

# Voice
ELEVENLABS_API_KEY=...

# Firebase Client (Vite - prefix with VITE_)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...

# Firebase Admin (Server)
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

## UI Components

Uses shadcn/ui components in `src/components/ui/`. Path alias `@/` resolves to `src/`.

## Key Libraries
- **Frontend**: React 18, React Router, Tailwind CSS, shadcn/ui, dnd-kit, Sonner
- **Backend**: Express, googleapis, firebase-admin
- **AI**: @google/generative-ai (Gemini)
