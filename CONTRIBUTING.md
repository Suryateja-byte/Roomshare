# Contributing to Roomshare

Thank you for your interest in contributing to Roomshare. This guide covers everything you need to get started.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Architecture Rules](#architecture-rules)
- [Testing Requirements](#testing-requirements)
- [PR Checklist](#pr-checklist)
- [Available Scripts](#available-scripts)
- [Where to Add Things](#where-to-add-things)

---

## Prerequisites

Before you begin, make sure you have the following installed:

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 20+ | LTS recommended |
| **pnpm** | 9+ | Package manager (`npm install -g pnpm`) |
| **PostgreSQL** | 16+ | With PostGIS extension |
| **Docker** (optional) | 20+ | For running PostgreSQL via docker-compose |
| **Git** | 2.30+ | Version control |

### Required Accounts (for full functionality)

| Service | Purpose | Required? |
|---|---|---|
| **Google OAuth** | Social login | Yes (for auth testing) |
| **Supabase** | File storage, realtime | Yes |
| **Resend** | Transactional email | Yes |
| **Cloudflare Turnstile** | Bot protection | Optional (test keys provided) |
| **Upstash Redis** | Rate limiting | Optional (falls back to DB) |
| **Groq** | AI chat features | Optional |
| **Sentry** | Error tracking | Optional |
| **Stadia Maps** | Map tiles | Optional (localhost works without key) |
| **Radar** | Nearby places search | Optional |

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-org/roomshare.git
cd roomshare
```

### 2. Install dependencies

```bash
pnpm install
```

This also runs `prisma generate` automatically via the `postinstall` script.

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values. At minimum, you need:

- `DATABASE_URL` -- PostgreSQL connection string (default: `postgresql://postgres:password@localhost:5433/roomshare?schema=public`)
- `NEXTAUTH_SECRET` -- Generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` -- `http://localhost:3000`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` -- From [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` -- From your Supabase project

**Important**: Never commit `.env*` files. They are gitignored.

### 4. Set up the database

**Option A: Docker (recommended)**

```bash
# Set the password in your shell or .env
export POSTGRES_PASSWORD=password

# Start PostgreSQL with PostGIS
docker compose up -d

# Run migrations
npx prisma migrate dev
```

The docker-compose file uses `postgis/postgis:16-3.4` and maps to port **5433** on localhost.

**Option B: Local PostgreSQL**

```bash
# Ensure PostGIS extension is available
psql -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Run migrations
npx prisma migrate dev
```

### 5. Start the development server

```bash
pnpm dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### 6. Verify your setup

```bash
pnpm lint       # ESLint checks
pnpm typecheck  # TypeScript checks
pnpm test       # Jest test suite
```

---

## Development Workflow

### Branch strategy

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make changes in small, reviewable commits.
3. Open a pull request against `main`.

### Making changes

Follow the **implement-test-verify-expand** cycle:

1. **Understand first** -- Read relevant files and architecture before editing.
2. **Plan the change** -- Identify scope, risk areas (auth/PII/state transitions/DB), and test plan.
3. **Implement in small steps** -- Keep diffs small and local. Prefer minimal dependencies.
4. **Verify explicitly** -- Run lint, typecheck, and tests before committing.

### Running checks before committing

```bash
pnpm lint          # Lint with ESLint
pnpm typecheck     # TypeScript type checking
pnpm test          # Run the full Jest test suite
```

For E2E tests (if your change affects user-facing flows):

```bash
pnpm test:e2e      # Seeds data + runs Playwright tests
```

---

## Code Style

These conventions are drawn from the project's operating rules:

### General principles

- **Clarity over cleverness** -- Write code that is easy to read and understand.
- **Small functions** -- Keep functions focused on a single responsibility.
- **Domain naming** -- Name things after domain concepts: `Hold`, `Spot`, `Booking`, `Listing`.
- **Explicit state machines** -- Avoid "magic" state in components. Use explicit state machines for complex flows (see `src/lib/booking-state-machine.ts` for an example).
- **Comments for "why" only** -- Do not narrate code. Add comments only when the reasoning is not obvious.

### TypeScript

- Strict mode is enabled (`"strict": true` in `tsconfig.json`).
- Use the `@/*` path alias for imports from `src/` (e.g., `import { prisma } from '@/lib/prisma'`).
- Prefer `interface` for object shapes and `type` for unions/intersections.
- Avoid `any` -- use `unknown` and narrow with type guards.

### ESLint

The project uses `eslint-config-next` with core-web-vitals and TypeScript rules. Key rules:

- `@typescript-eslint/no-explicit-any` -- warning (being cleaned up)
- `prefer-const` -- warning
- `react/no-unescaped-entities` -- warning
- React hooks rules enforced

### Formatting

- Tailwind CSS for styling (v4, using `@tailwindcss/postcss`).
- Use `clsx` and `tailwind-merge` for conditional class composition.
- Mobile-first responsive design.

---

## Architecture Rules

These boundaries must not be crossed:

### Layer separation

| Layer | Responsibility | Must NOT |
|---|---|---|
| **Client components** | UI state, rendering, user interactions | Call the database directly |
| **Server layer** (actions, API routes) | Validation, authorization, business invariants, transactional writes | Contain UI rendering logic |
| **DB layer** (Prisma, migrations) | Constraints, indexes, RLS/policies | Contain business logic |

### Data flow rules

- **Business rules live in the server/service layer**, not inside components.
- External services (Maps, Places, Email, Storage) must be wrapped behind a small **adapter module** in `src/lib/`.
- Schema and constraints live in `prisma/schema.prisma` and are enforced server-side.

### Reliability rules (holds, bookings, inventory)

Any hold/reserve/apply/book logic must satisfy:

- **Idempotency** -- Retries must not double-write (see `src/lib/idempotency.ts`).
- **Race safety** -- Two competing users cannot create impossible states.
- **Time-bounded holds** -- Auto-expire; server is source of truth.
- **Authorization** on every state transition.
- **Auditability** -- Structured events without PII.

### Security and privacy

- Validate and sanitize all inputs server-side.
- No raw PII in logs (email, phone, IDs, address). Use the logger in `src/lib/logger.ts`.
- Prefer allowlists over denylists for filters and sort options.
- Rate-limit abuse-prone endpoints (see `src/lib/with-rate-limit.ts`).

---

## Testing Requirements

New behavior must be test-backed:

| Test type | When to write | Location |
|---|---|---|
| **Unit tests** | Pure logic, utilities, schemas | `src/__tests__/lib/` |
| **Integration tests** | Server actions, API routes | `src/__tests__/api/`, `src/__tests__/actions/` |
| **Component tests** | React components with user interaction | `src/__tests__/components/` |
| **Property-based tests** | Filter invariants, schemas | `src/__tests__/property/` |
| **E2E tests** | Critical user flows (search, booking, auth) | `tests/e2e/` |

### Test requirements

- Tests must be **deterministic** -- mock external APIs behind adapters, use fixed time where needed.
- State machine and lifecycle logic **must have tests** for edge cases and abuse scenarios.
- Avoid reliance on network unless explicitly marked as E2E.

For the full testing guide, see [docs/TESTING.md](docs/TESTING.md).

---

## PR Checklist

Before submitting your pull request, verify:

- [ ] **Lint passes** -- `pnpm lint`
- [ ] **Typecheck passes** -- `pnpm typecheck`
- [ ] **Tests pass** -- `pnpm test` (and `pnpm test:e2e` if applicable)
- [ ] **No PII leaks** in logs or error messages
- [ ] **Server-side validation and auth enforced** for any new endpoints or actions
- [ ] **Docs/comments updated** where needed
- [ ] **Small diff, clear commit messages**

### For database changes

If your PR modifies the database schema:

- [ ] Migration included (`npx prisma migrate dev --name your-migration-name`)
- [ ] Rollback note included (reversible vs. requires manual data restore)
- [ ] Data-safety note (locking risk, backfill plan, index creation strategy)
- [ ] Indexes added or updated for new query patterns

---

## Available Scripts

All scripts use `pnpm`. Run `pnpm <script>` from the project root.

| Script | Description |
|---|---|
| `dev` | Start Next.js development server |
| `build` | Production build |
| `start` | Start production server |
| `lint` | Run ESLint |
| `typecheck` | Run TypeScript type checking (`tsc --noEmit`) |
| `verify` | Run verification script |
| `test` | Run Jest test suite |
| `test:watch` | Run Jest in watch mode |
| `test:coverage` | Run Jest with coverage report |
| `test:ci` | Run Jest in CI mode (coverage, limited workers) |
| `test:unit` | Run unit tests only (lib, hooks, utils) |
| `test:components` | Run component tests only |
| `test:api` | Run API and server action tests |
| `test:filters` | Run all filter-related tests |
| `test:filters:schema` | Run filter schema unit tests |
| `test:filters:integration` | Run filter integration (pairwise) tests |
| `test:filters:property` | Run filter property-based tests |
| `test:filters:e2e` | Run filter E2E tests (Jest) |
| `test:filters:regression` | Run filter regression tests |
| `test:filters:perf` | Run filter performance tests (60s timeout) |
| `test:filters:all` | Run all filter tests with extended timeout |
| `test:e2e` | Seed data + run Playwright E2E tests |
| `test:e2e:ui` | Open Playwright UI mode |
| `test:e2e:headed` | Run E2E tests in headed browser |
| `test:e2e:debug` | Run E2E tests in debug mode |
| `test:e2e:report` | Open Playwright HTML report |
| `test:e2e:chromium` | Run E2E in Chromium only |
| `test:e2e:mobile` | Run E2E on mobile viewports |
| `test:e2e:anon` | Run anonymous (no auth) E2E tests |
| `test:e2e:ci` | CI-optimized E2E (Chromium, list+html reporter) |
| `seed:e2e` | Seed E2E test data without running tests |
| `clean:next-locks` | Remove Next.js dev lockfiles |
| `geocode:compare` | Run geocoding accuracy comparison |
| `geocode:compare:extended` | Extended geocoding comparison |
| `geocode:compare:json` | Geocoding comparison (JSON output) |

---

## Where to Add Things

### New API route

1. Create the route file at `src/app/api/<endpoint>/route.ts`.
2. Export the HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`).
3. Add authentication check using `auth()` from `@/auth`.
4. Add rate limiting using `withRateLimit()` from `@/lib/with-rate-limit`.
5. Validate input with Zod schemas from `@/lib/schemas` or `@/lib/filter-schema`.
6. Add tests in `src/__tests__/api/<endpoint>.test.ts`.

### New page

1. Create the page at `src/app/<route>/page.tsx`.
2. For protected pages, add auth checks in the server component.
3. Use the existing layout from `src/app/layout.tsx`.
4. Handle loading, error, and empty states.

### New React component

1. Create the component in `src/components/<domain>/`.
2. Follow the client/server component split -- mark client components with `"use client"`.
3. Use Radix UI primitives for interactive elements (dialogs, dropdowns, etc.).
4. Add tests in `src/__tests__/components/<component>.test.ts`.

### New custom hook

1. Create the hook in `src/hooks/use<Name>.ts`.
2. Follow the naming convention: `useBlockStatus`, `useFormPersistence`, etc.
3. Add tests in `src/__tests__/hooks/use<Name>.test.ts`.

### New database model

1. Add the model to `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name add-<model-name>`.
3. Run `npx prisma generate` to update the client (happens automatically on `pnpm install`).
4. Add the model mock to `jest.setup.js` in the Prisma mock section.
5. Include rollback and data-safety notes in your PR description.

### New server action

1. Create the action in `src/actions/<domain>.ts`.
2. Add `"use server"` directive at the top.
3. Validate all inputs server-side. Never trust client data.
4. Add tests in `src/__tests__/actions/<domain>.test.ts`.

### New external service integration

1. Create an adapter module in `src/lib/<service>.ts`.
2. Wrap all external API calls behind this adapter.
3. Add a circuit breaker instance in `src/lib/circuit-breaker.ts` if the service could fail.
4. Mock the adapter in tests -- never make real external calls in unit/integration tests.

---

## Questions?

If anything is unclear, ask targeted questions early rather than guessing. Key areas where you should ask:

- Desired UX behavior (especially around holds/reservations/apply flows)
- Source of truth for a state (client vs server)
- External API limits or cost constraints
- Existing conventions in the repo
