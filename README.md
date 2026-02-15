# Roomshare

A production room-sharing and rental platform built with trust, safety, and reliability as core values. Roomshare connects hosts with guests through a full-featured search experience, booking lifecycle management, real-time messaging, and a comprehensive admin panel.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth v5 |
| Maps | MapLibre GL, react-map-gl |
| Storage | Supabase |
| Cache / Rate Limiting | Upstash Redis |
| Monitoring | Sentry |
| AI | AI SDK with Groq + OpenAI |
| Styling | Tailwind CSS 4 |
| UI | Radix UI, Lucide icons, Framer Motion |
| Validation | Zod 4 |
| CAPTCHA | Cloudflare Turnstile |
| Testing | Jest 30, Playwright, Testing Library, fast-check |

## Features

- **Search with Map** -- Full-text search with interactive MapLibre map, filters (price, dates, amenities, room type), faceted results, sorting, and cursor-based pagination
- **Listings** -- Create, edit, view, and manage listings with image upload and status toggling
- **Bookings** -- Booking calendar, booking form, and a state machine governing the holds/bookings lifecycle
- **Messaging** -- Real-time messaging between hosts and guests with block and unread-count support
- **AI Chatbot** -- Neighborhood intelligence chatbot for local area information
- **User Profiles** -- Profile completion, avatar upload, settings, and account management
- **Reviews** -- Review cards, submission forms, and host responses
- **Favorites and Saved Searches** -- Save listings and create search alerts with cron-based notifications
- **Admin Panel** -- Dashboard with audit logs, listing management, user management, reports, and verifications
- **Auth** -- Email/password authentication with email verification, forgot/reset password, and Turnstile CAPTCHA
- **Geocoding** -- Google Places/Geocoding integration with accuracy checking and caching
- **Rate Limiting** -- Redis-backed rate limiting on sensitive endpoints
- **Notifications** -- In-app notification center
- **Offline Support** -- Service worker with offline fallback page
- **Health Monitoring** -- Liveness and readiness probes, metrics endpoints, Web Vitals tracking
- **Reporting** -- User reporting system for flagging content

## Project Structure

```
src/
  app/           # Next.js App Router pages and API routes
  components/    # React components (search, map, filters, chat, auth, UI, etc.)
  hooks/         # Custom React hooks
  lib/           # Business logic, services, utilities
  contexts/      # React contexts
  types/         # TypeScript type definitions
  styles/        # Global styles
prisma/          # Prisma schema and migrations
tests/e2e/       # Playwright E2E tests
scripts/         # Utility and seed scripts
public/          # Static assets (icons, images, map styles)
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL database
- Redis instance (Upstash or local)

### Setup

1. Clone the repository and install dependencies:

   ```bash
   pnpm install
   ```

2. Copy `.env.example` to `.env` and fill in the required values:

   ```bash
   cp .env.example .env
   ```

3. Run database migrations:

   ```bash
   npx prisma migrate dev
   ```

4. Start the development server:

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test` | Run unit tests (Jest) |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm test:e2e` | Run E2E tests (Playwright) |
| `pnpm test:e2e:ui` | Run E2E tests with Playwright UI |

## License

Private -- all rights reserved.
