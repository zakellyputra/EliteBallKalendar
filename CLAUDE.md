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

# Database
npm run db:push       # Push schema changes to SQLite
npm run db:studio     # Open Prisma Studio GUI
npm run db:generate   # Regenerate Prisma client

# Build
npm run build         # Vite production build to /build
```

## Architecture

### Frontend-Backend Split
- **Frontend**: Vite + React 18 + TypeScript at `src/`
- **Backend**: Express + TypeScript at `server/`
- Vite proxies `/api/*` to the backend (configured in `vite.config.ts`)

### Key Data Flow: Schedule Generation
1. User creates Goals with `targetMinutesPerWeek`
2. `POST /api/scheduler/generate` calls `server/lib/scheduler.ts:generateSchedule()`
3. Scheduler fetches user's Settings (working window, block length, min gap) and calendar events
4. Free slots are computed by subtracting busy events from working windows
5. Greedy algorithm fills free slots with focus blocks for each goal
6. Frontend displays proposed blocks; user can drag to reposition
7. `POST /api/scheduler/apply` creates Google Calendar events and FocusBlock records

### Free Time Calculation
Both frontend (`Dashboard.tsx:calculateFreeTime()`) and backend (`scheduler.ts`) calculate available time using the same algorithm:
- For each enabled day in `workingWindow`, compute working hours
- Subtract busy intervals (non-EliteBall events) with `minGapMinutes` buffers
- Only count slots that can fit at least one `blockLengthMinutes` block
- Calculate schedulable minutes as: `numBlocks * blockLengthMinutes` where `numBlocks = floor((slotDuration + minGapMinutes) / (blockLengthMinutes + minGapMinutes))`

### AI Rescheduling
- Uses Gemini API with Bear1 compression middleware (`server/lib/bear1.ts`)
- Voice commands via ElevenLabs TTS/STT (`server/lib/elevenlabs.ts`)
- Reschedule operations: move, create, delete blocks

### Database (Prisma + SQLite)
Key models in `prisma/schema.prisma`:
- `User` - OAuth tokens, relationships to all user data
- `Settings` - `workingWindow` (JSON), `blockLengthMinutes`, `minGapMinutes`, `selectedCalendars`
- `Goal` - `name`, `targetMinutesPerWeek`
- `FocusBlock` - Links goal to calendar event, tracks status
- `RescheduleLog` - Tracks AI reschedule operations and compression stats

### Frontend State
- `src/hooks/useScheduler.ts` - Schedule generation and application
- `src/hooks/useGoals.ts` - Goal CRUD
- `src/hooks/useSettings.ts` - Settings management
- `src/lib/api.ts` - All API client functions and TypeScript types

### Routes
| Page | Path | Purpose |
|------|------|---------|
| Dashboard | `/` | Main view with goals, scheduler, weekly calendar |
| Onboarding | `/onboarding` | First-time setup flow |
| AI Rescheduler | `/reschedule` | Chat/voice interface for rescheduling |
| Statistics | `/stats` | Productivity stats and "wrapped" summary |
| Settings | `/settings` | Working hours, block length, calendars |

## Environment Variables

Required in `.env.local`:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - OAuth for Calendar API
- `GEMINI_API_KEY` - AI rescheduling
- `ELEVENLABS_API_KEY` - Voice commands
- `BEAR1_API_KEY` - Context compression
- `DATABASE_URL` - SQLite path (default: `file:./dev.db`)

## UI Components

Uses shadcn/ui components in `src/components/ui/`. Path alias `@/` resolves to `src/`.
