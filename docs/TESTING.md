# Testing Guide

Comprehensive testing guide for the Roomshare project.

---

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Test Infrastructure](#test-infrastructure)
- [Running Tests](#running-tests)
- [Unit Tests](#unit-tests)
- [Integration Tests](#integration-tests)
- [Component Tests](#component-tests)
- [E2E Tests](#e2e-tests)
- [Property-Based Tests](#property-based-tests)
- [Accessibility Tests](#accessibility-tests)
- [Performance Tests](#performance-tests)
- [Mocking Patterns](#mocking-patterns)
- [Coverage](#coverage)
- [Writing New Tests](#writing-new-tests)
- [Debugging Tests](#debugging-tests)

---

## Testing Philosophy

### Test pyramid

The project follows a layered testing approach, with more tests at lower levels:

```
           E2E Tests (~1,480 Playwright specs)
          /  Critical user journeys across browsers  \
        /                                              \
       Property-Based Tests (~100 fast-check properties)
      /  Invariant verification for any valid input      \
    /                                                      \
   Pairwise Integration Tests (~150 filter combinations)
  /  Filter interaction coverage without exponential growth  \
/                                                              \
               Unit Tests (~200+ Jest specs)
              Individual logic, schemas, utilities
```

### Core principles

- **Prevention over detection** -- Build quality in, do not rely on finding bugs later.
- **Deterministic tests** -- No network calls, fixed time, seeded randomness.
- **Mock at boundaries** -- External APIs (Google Maps, Supabase, Radar) are mocked behind adapter modules.
- **State machine coverage** -- Any lifecycle logic (bookings, holds) must have edge case and abuse tests.
- **No PII in test output** -- Even test data should not contain real personal information.

---

## Test Infrastructure

### Jest 30 configuration

**Config file**: `jest.config.js`

| Setting | Value | Purpose |
|---|---|---|
| `testEnvironment` | `jest-environment-jsdom` | Browser-like DOM for React components |
| `setupFiles` | `jest.env.js` | Environment variables set before imports |
| `setupFilesAfterEnv` | `jest.setup.js` | Test framework setup (mocks, polyfills) |
| `moduleNameMapper` | `@/* -> src/*` | Path alias resolution |
| `transformIgnorePatterns` | ESM packages allowed | next-auth, jose, styled-jsx transformed |
| `workerIdleMemoryLimit` | `512MB` | Prevents memory leaks in long test runs |
| `forceExit` | `true` (CI only) | Prevents hanging processes in CI |

### Setup files

**`jest.env.js`** -- Runs before any module imports:
- Sets `DATABASE_URL` to a test value (prevents Prisma validation errors)
- Sets `NEXT_PUBLIC_SUPABASE_URL` and anon key for storage tests
- Disables Turnstile bot protection (`TURNSTILE_ENABLED=false`)

**`jest.setup.js`** -- Runs after the test framework is installed:
- Imports `@testing-library/jest-dom` matchers
- Polyfills `TextEncoder`, `TextDecoder`, `Response.json`
- Mocks Next.js modules: `next/navigation`, `next/headers`, `next/image`, `next/link`
- Mocks NextAuth: `next-auth`, `next-auth/react`, providers, `@auth/prisma-adapter`
- Mocks Prisma client with auto-resolved model methods
- Mocks Turnstile (`@marsidev/react-turnstile`)
- Polyfills `IntersectionObserver`, `ResizeObserver`, `window.matchMedia`
- Suppresses known React console warnings
- Calls `jest.clearAllMocks()` after each test

### Module mocking approach

The Prisma mock in `jest.setup.js` provides a default mock for every model:

```javascript
const mockPrismaModel = {
  findUnique: jest.fn().mockResolvedValue(null),
  findFirst: jest.fn().mockResolvedValue(null),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
  // ... all Prisma methods
};
```

Tests that need specific return values override the mock per-test:

```typescript
import { prisma } from '@/lib/prisma';
(prisma.listing.findUnique as jest.Mock).mockResolvedValue({ id: 'test', title: 'Test' });
```

---

## Running Tests

### Complete command reference

| Command | Description | Speed |
|---|---|---|
| `pnpm test` | Run all Jest tests | ~30s |
| `pnpm test:watch` | Watch mode (re-runs on file changes) | Continuous |
| `pnpm test:coverage` | Run with coverage report | ~45s |
| `pnpm test:ci` | CI mode (coverage, 2 workers) | ~60s |
| `pnpm test:unit` | Unit tests only (lib, hooks, utils) | ~10s |
| `pnpm test:components` | Component tests only | ~15s |
| `pnpm test:api` | API route and server action tests | ~15s |
| `pnpm test:filters` | All filter tests (schema, integration, property, e2e) | ~20s |
| `pnpm test:filters:schema` | Filter schema unit tests | ~5s |
| `pnpm test:filters:integration` | Pairwise integration tests | ~10s |
| `pnpm test:filters:property` | Property-based tests (fast-check) | ~10s |
| `pnpm test:filters:regression` | Filter regression tests | ~5s |
| `pnpm test:filters:perf` | Performance tests (60s timeout) | ~30s |
| `pnpm test:filters:all` | All filter tests with extended timeout | ~45s |
| `pnpm test:e2e` | Seed + run all Playwright E2E tests | ~10min |
| `pnpm test:e2e:ui` | Playwright UI mode (interactive) | Interactive |
| `pnpm test:e2e:headed` | E2E with visible browser | ~12min |
| `pnpm test:e2e:debug` | E2E debug mode (step-through) | Interactive |
| `pnpm test:e2e:chromium` | E2E in Chromium only | ~5min |
| `pnpm test:e2e:mobile` | E2E on mobile viewports | ~5min |
| `pnpm test:e2e:anon` | Anonymous user E2E tests | ~3min |
| `pnpm test:e2e:ci` | CI-optimized E2E | ~8min |
| `pnpm test:e2e:report` | Open HTML report from last run | Instant |

### Running a single test file

```bash
# Jest
pnpm test -- src/__tests__/lib/booking-state-machine.test.ts

# Playwright
pnpm test:e2e -- tests/e2e/search-filters/filter-price.anon.spec.ts
```

### Running tests matching a pattern

```bash
# By file path pattern
pnpm test -- --testPathPattern="api/nearby"

# By test name
pnpm test -- --testNamePattern="price range"

# Verbose output
pnpm test -- --verbose src/__tests__/lib/filter-schema.test.ts
```

---

## Unit Tests

### Location

`src/__tests__/lib/` -- Tests for utilities, schemas, and pure logic.

### What to test

| Module | Examples |
|---|---|
| Filter schemas | `normalizeFilters()`, `validateFilters()`, `isEmptyFilters()` |
| State machines | `canTransition()`, `validateTransition()`, `isTerminalStatus()` |
| Utilities | `formatPrice()`, `slugify()`, distance calculations |
| Validation | Zod schemas, input sanitization, email normalization |
| Rate limiting | Rate limit logic, client-side rate tracking |
| Search utilities | Cursor pagination, keyset pagination, hash functions |
| Booking utilities | Price calculation, date validation, booking state logic |

### Example: state machine test

```typescript
// src/__tests__/lib/booking-state-machine.test.ts
import { canTransition, validateTransition } from '@/lib/booking-state-machine';

describe('booking-state-machine', () => {
  it('allows PENDING -> ACCEPTED', () => {
    expect(canTransition('PENDING', 'ACCEPTED')).toBe(true);
  });

  it('rejects REJECTED -> ACCEPTED (terminal state)', () => {
    expect(canTransition('REJECTED', 'ACCEPTED')).toBe(false);
  });

  it('throws on invalid transition', () => {
    expect(() => validateTransition('CANCELLED', 'PENDING')).toThrow();
  });
});
```

### Example: filter schema test

```typescript
// src/__tests__/lib/filter-schema.test.ts
import { normalizeFilters, DEFAULT_PAGE_SIZE } from '@/lib/filter-schema';

describe('normalizeFilters', () => {
  it('returns defaults for undefined input', () => {
    const result = normalizeFilters(undefined);
    expect(result).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
  });

  it('clamps price to MAX_SAFE_PRICE', () => {
    const result = normalizeFilters({ minPrice: 999999999999 });
    expect(result.minPrice).toBeLessThanOrEqual(1000000000);
  });
});
```

---

## Integration Tests

### Location

- `src/__tests__/api/` -- API route handler tests
- `src/__tests__/actions/` -- Server action tests
- `src/__tests__/integration/` -- Cross-module integration tests

### Pattern: API route testing

```typescript
// src/__tests__/api/reports.test.ts
jest.mock('@/lib/prisma', () => ({ prisma: { report: { create: jest.fn() } } }));
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

import { POST } from '@/app/api/reports/route';
import { auth } from '@/auth';

describe('Reports API', () => {
  it('returns 401 when not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    const request = new Request('http://localhost/api/reports', {
      method: 'POST',
      body: JSON.stringify({ listingId: 'id', reason: 'Spam' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
```

### Pattern: server action testing

```typescript
// src/__tests__/actions/create-listing.test.ts
import { createListing } from '@/actions/create-listing';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

describe('createListing', () => {
  beforeEach(() => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('validates required fields', async () => {
    const result = await createListing({ title: '' });
    expect(result.error).toBeTruthy();
  });
});
```

### Pairwise filter integration tests

Located at `src/__tests__/integration/pairwise-filters.test.ts`. These test all 2-filter combinations to catch interaction bugs without exponential explosion (15 filters would create billions of full combinations; pairwise covers ~150 test cases).

---

## Component Tests

### Location

`src/__tests__/components/` -- React component tests using Testing Library.

### Setup

Tests use `@testing-library/react` with `@testing-library/jest-dom` matchers and `@testing-library/user-event` for user interaction simulation.

### Pattern

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('renders the title', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByRole('heading')).toHaveTextContent('Test');
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<MyComponent onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

### Key mocks available (from jest.setup.js)

- `next/navigation` -- `useRouter`, `usePathname`, `useSearchParams`, `useParams`, `redirect`, `notFound`
- `next/image` -- Renders as plain `<img>`
- `next/link` -- Renders as plain `<a>`
- `next-auth/react` -- `useSession` (defaults to unauthenticated), `signIn`, `signOut`, `SessionProvider`
- `@marsidev/react-turnstile` -- Auto-resolves with mock token
- `window.matchMedia` -- Returns `matches: false` by default
- `IntersectionObserver` and `ResizeObserver` -- No-op implementations

---

## E2E Tests

### Location

`tests/e2e/` -- Playwright end-to-end tests.

### Playwright configuration

**Config file**: `playwright.config.ts`

| Setting | Value |
|---|---|
| Test directory | `tests/e2e/` |
| Parallel | Fully parallel (`fullyParallel: true`) |
| Retries | 0 locally, 2 in CI |
| Workers | 3 locally, 1 in CI |
| Test timeout | 60s (180s for `test.slow()`) |
| Action timeout | 15s |
| Navigation timeout | 45s |
| Expect timeout | 15s |
| Base URL | `http://localhost:3000` |
| Trace | On first retry |
| Screenshots | On failure only |
| Video | On first retry |

### Browser projects

| Project | Browser | Auth | Purpose |
|---|---|---|---|
| `setup` | -- | -- | Authenticates test users, saves sessions |
| `chromium` | Desktop Chrome | Authenticated user | Primary test target |
| `firefox` | Desktop Firefox | Authenticated user | Cross-browser |
| `webkit` | Desktop Safari | Authenticated user | Cross-browser |
| `Mobile Chrome` | Pixel 5 | Authenticated user | Mobile viewport |
| `Mobile Safari` | iPhone 12 | Authenticated user | Mobile viewport |
| `chromium-admin` | Desktop Chrome | Admin user | Admin panel tests |
| `chromium-anon` | Desktop Chrome | None | Anonymous user tests |
| `firefox-anon` | Desktop Firefox | None | Critical anon specs cross-browser |
| `webkit-anon` | Desktop Safari | None | Critical anon specs cross-browser |

### Authentication setup

Auth is handled by `tests/e2e/auth.setup.ts`, which runs before dependent test projects:

1. **User session** -- Logs in via the login form with `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` and saves to `playwright/.auth/user.json`.
2. **Admin session** -- Logs in as `e2e-admin@roomshare.dev` and saves to `playwright/.auth/admin.json`.
3. **User2 session** -- Logs in as `e2e-other@roomshare.dev` for multi-user tests and saves to `playwright/.auth/user2.json`.

### Test data seeding

- **Global setup** (`tests/e2e/global-setup.ts`) runs `scripts/seed-e2e.js` before any tests.
- The seed script creates test users, listings, bookings, and other fixtures.
- E2E tests are **read-only by design** for most data to preserve seed state across parallel test runs.

### Dev server

Playwright auto-starts the dev server via the `webServer` config:

```typescript
webServer: {
  command: 'pnpm run clean:next-locks && pnpm run dev',
  url: 'http://localhost:3000/api/health/ready',
  reuseExistingServer: !process.env.CI,
  timeout: 180000,
}
```

It waits for the `/api/health/ready` endpoint (checks database connectivity) before starting tests.

### File naming conventions

| Pattern | Auth requirement | Example |
|---|---|---|
| `*.spec.ts` | Authenticated user | `search-smoke.spec.ts` |
| `*.anon.spec.ts` | No auth required | `filter-price.anon.spec.ts` |
| `*.admin.spec.ts` | Admin user | `admin.admin.spec.ts` |

### E2E test organization

```
tests/e2e/
  auth.setup.ts           # Authentication setup
  global-setup.ts         # Data seeding
  helpers/                # Shared test utilities
  page-objects/           # Page object models
  a11y/                   # Accessibility audit tests
  booking/                # Booking flow tests
  create-listing/         # Listing creation tests
  dark-mode/              # Dark mode tests
  homepage/               # Homepage tests
  journeys/               # User journey (integration) tests
  listing-detail/         # Listing detail page tests
  listing-edit/           # Listing edit page tests
  map-*.spec.ts           # Map interaction tests
  messaging/              # Messaging tests
  mobile/                 # Mobile-specific tests
  mobile-*.spec.ts        # Mobile UX tests
  nearby/                 # Nearby places tests
  notifications/          # Notification tests
  pagination/             # Pagination tests
  performance/            # Performance measurement tests
  search-filters/         # Individual filter tests
  search-*.spec.ts        # Search page tests
  session/                # Session management tests
  visual/                 # Visual regression tests
```

### Running E2E tests

```bash
# Full suite (seeds + runs)
pnpm test:e2e

# Interactive UI mode (best for development)
pnpm test:e2e:ui

# Single spec
pnpm test:e2e -- tests/e2e/search-filters/filter-price.anon.spec.ts

# Single browser
pnpm test:e2e:chromium

# Debug mode (opens inspector)
pnpm test:e2e:debug

# View last report
pnpm test:e2e:report
```

### Debugging E2E failures

1. **View the HTML report**: `pnpm test:e2e:report`
2. **Check traces**: Traces are captured on first retry. Open with `npx playwright show-trace test-results/<test>/trace.zip`.
3. **Run headed**: `pnpm test:e2e:headed` to see the browser.
4. **Debug mode**: `pnpm test:e2e:debug` opens the Playwright Inspector for step-through debugging.
5. **Screenshots**: Failed tests save screenshots to `test-results/`.

---

## Property-Based Tests

### Location

`src/__tests__/property/filter-properties.test.ts`

### Library

[fast-check](https://github.com/dubzzz/fast-check) -- Generates random valid inputs and checks that invariants hold for all of them.

### Invariants tested

| # | Invariant | Description |
|---|---|---|
| 1 | Idempotence | `normalize(normalize(x)) === normalize(x)` |
| 2 | Order independence | Shuffled arrays yield same results |
| 3 | Monotonicity | More filters = fewer or equal results |
| 4 | Subset rule | Combined filters result is subset of individual results |
| 5 | Pagination consistency | No duplicates, correct totals |
| 6 | Count consistency | Total matches actual items |
| 7 | Sorting correctness | Items sorted by specified key |
| 8 | Safety | Invalid inputs do not crash |
| 9 | Determinism | Same input = same output |
| 10 | Bounds integrity | Results within geographic bounds |
| 11 | Filter match | Every result matches all applied filters |
| 12 | SQL injection resistance | Malicious inputs handled safely |

### Example

```typescript
import * as fc from 'fast-check';
import { normalizeFilters } from '@/lib/filter-schema';

it('normalizeFilters is idempotent', () => {
  fc.assert(
    fc.property(
      fc.record({
        minPrice: fc.option(fc.nat(), { nil: undefined }),
        maxPrice: fc.option(fc.nat(), { nil: undefined }),
      }),
      (input) => {
        const once = normalizeFilters(input);
        const twice = normalizeFilters(once);
        expect(twice).toEqual(once);
      }
    )
  );
});
```

### Running

```bash
pnpm test:filters:property
```

---

## Accessibility Tests

### Playwright axe-core integration

The project uses `@axe-core/playwright` for automated WCAG 2.1 AA compliance checks.

**Coverage**: 32+ pages audited across 15+ spec files and ~120 tests.

### Test locations

| Spec file | Pages covered |
|---|---|
| `a11y/axe-page-audit.anon.spec.ts` | /, /search, /login, /signup, /forgot-password, /listings/[id], /about, /terms, /privacy |
| `a11y/axe-page-audit.auth.spec.ts` | /bookings, /messages, /saved, /settings, /profile, /notifications, /listings/create |
| `a11y/axe-dynamic-states.spec.ts` | Dynamic state changes (modals, form errors) |
| `a11y/listing-detail-a11y.spec.ts` | Listing detail page (keyboard, landmarks, dark mode) |
| `search-a11y*.anon.spec.ts` | Search (filters, keyboard, screen reader) |
| `create-listing/create-listing.a11y.spec.ts` | Create listing form |
| `pagination/pagination-a11y.spec.ts` | Pagination controls |
| `nearby/nearby-accessibility.spec.ts` | Nearby places section |
| `messaging/messaging-a11y.spec.ts` | Messages (keyboard, aria-live, focus) |

### Pattern

```typescript
import AxeBuilder from '@axe-core/playwright';

test('page passes axe accessibility checks', async ({ page }) => {
  await page.goto('/search');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
```

---

## Performance Tests

### Jest-based performance tests

Located at `src/__tests__/performance/filter-performance.test.ts`. These use timing assertions:

```typescript
it('complex filter query completes in < 500ms', async () => {
  const start = performance.now();
  await search({ bounds: SF_BOUNDS, minPrice: 500, amenities: ['Wifi'] });
  expect(performance.now() - start).toBeLessThan(500);
});
```

Run with extended timeout:

```bash
pnpm test:filters:perf
```

### Playwright performance tests

Located at `tests/e2e/performance/`:

| Spec file | Metrics |
|---|---|
| `core-web-vitals.anon.spec.ts` | LCP, FID/INP, CLS for homepage, search, login, listing detail |
| `api-response-times.spec.ts` | API endpoint response times |
| `search-interaction-perf.spec.ts` | Search interaction latency |
| `create-listing/create-listing.perf.spec.ts` | LCP, CLS, TTI for create listing |

---

## Mocking Patterns

### External API mocking

External services are wrapped behind adapter modules and mocked at the module level:

| Service | Adapter module | Mock approach |
|---|---|---|
| Prisma/Database | `@/lib/prisma` | Global mock in `jest.setup.js` |
| NextAuth | `@/auth` | Per-test mock via `jest.mock` |
| Supabase | `@/lib/supabase` | Module mock |
| Rate limiting | `@/lib/with-rate-limit` | Mock to return null (allow) |
| Geocoding | `@/lib/geocoding` | Module mock |
| Email (Resend) | `@/lib/email` | Module mock |
| Radar API | Server route mock | Module mock with fixture data |
| Turnstile | `@marsidev/react-turnstile` | Global mock in `jest.setup.js` |

### Per-test mock override

```typescript
// Override the global Prisma mock for a specific test
import { prisma } from '@/lib/prisma';

it('returns the listing', async () => {
  (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
    id: 'listing-1',
    title: 'Cozy Room',
    price: 800,
  });
  // ... test code
});
```

### Auth mock patterns

```typescript
import { auth } from '@/auth';

// Authenticated user
(auth as jest.Mock).mockResolvedValue({
  user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
});

// Unauthenticated
(auth as jest.Mock).mockResolvedValue(null);
```

### NextResponse mock

For API route tests, mock `next/server`:

```typescript
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));
```

---

## Coverage

### Running coverage

```bash
# Basic coverage
pnpm test:coverage

# CI coverage (with worker limits)
pnpm test:ci
```

### Coverage configuration

From `jest.config.js`:

```javascript
collectCoverageFrom: [
  'src/**/*.{js,jsx,ts,tsx}',
  '!src/**/*.d.ts',
  '!src/**/index.ts',
  '!src/app/layout.tsx',
  '!src/app/global-error.tsx',
],
coverageThreshold: {
  global: {
    branches: 5,
    functions: 5,
    lines: 5,
    statements: 5,
  },
},
```

Coverage reports are generated in the `coverage/` directory (gitignored).

### Current thresholds

The global thresholds are set conservatively (5%). Focus is on testing critical paths thoroughly rather than chasing coverage numbers. Key areas have much higher actual coverage:

- **Filter system**: 90%+ line coverage
- **State machines**: Full branch coverage
- **API routes**: Auth and validation paths covered

---

## Writing New Tests

### Step 1: Determine the test type

| What you changed | Test type | Location |
|---|---|---|
| Utility function, schema, pure logic | Unit test | `src/__tests__/lib/` |
| API route handler | Integration test | `src/__tests__/api/` |
| Server action | Integration test | `src/__tests__/actions/` |
| React component | Component test | `src/__tests__/components/` |
| Custom hook | Hook test | `src/__tests__/hooks/` |
| User-facing flow | E2E test | `tests/e2e/` |
| Filter behavior | Property test | `src/__tests__/property/` |

### Step 2: Create the test file

Follow the naming convention: `<module-name>.test.ts` for Jest, `<feature>.spec.ts` for Playwright.

### Step 3: Write the test

**For unit tests:**

```typescript
import { myFunction } from '@/lib/my-module';

describe('myFunction', () => {
  it('handles normal input', () => {
    expect(myFunction('valid')).toBe('expected');
  });

  it('handles edge cases', () => {
    expect(myFunction(null)).toBeNull();
    expect(myFunction('')).toBe('');
  });

  it('rejects invalid input', () => {
    expect(() => myFunction('invalid')).toThrow();
  });
});
```

**For API route tests:**

```typescript
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

import { GET } from '@/app/api/my-endpoint/route';
import { auth } from '@/auth';

describe('GET /api/my-endpoint', () => {
  it('requires authentication', async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    const req = new Request('http://localhost/api/my-endpoint');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
```

**For E2E tests:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('completes the user flow', async ({ page }) => {
    await page.goto('/feature');
    await expect(page.getByRole('heading', { name: 'Feature' })).toBeVisible();
    await page.getByRole('button', { name: 'Action' }).click();
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

### Step 4: Run and verify

```bash
# Run just your new test
pnpm test -- src/__tests__/lib/my-module.test.ts

# Run the full suite to check for regressions
pnpm test
```

---

## Debugging Tests

### Jest debugging

```bash
# Verbose output
pnpm test -- --verbose src/__tests__/lib/my-test.test.ts

# Run a single test by name
pnpm test -- --testNamePattern="handles edge case"

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand src/__tests__/lib/my-test.test.ts
```

### Common Jest issues

| Issue | Cause | Solution |
|---|---|---|
| `Cannot find module '@/lib/...'` | Path alias not resolved | Check `moduleNameMapper` in `jest.config.js` |
| `SyntaxError: Cannot use import` | ESM module not transformed | Add to `transformIgnorePatterns` exception list |
| `PrismaClientConstructorValidationError` | Missing `DATABASE_URL` | Check `jest.env.js` sets the variable |
| Tests hang after completion | Open handles (DB connections, timers) | Use `--forceExit` or fix the leak |
| `ReferenceError: TextEncoder is not defined` | Missing polyfill | Already handled in `jest.setup.js` |

### Playwright debugging

```bash
# Visual debug mode with inspector
pnpm test:e2e:debug

# Headed mode (see the browser)
pnpm test:e2e:headed

# UI mode (interactive test runner)
pnpm test:e2e:ui

# Generate and view trace
pnpm test:e2e -- --trace on
npx playwright show-trace test-results/<test>/trace.zip
```

### Common Playwright issues

| Issue | Cause | Solution |
|---|---|---|
| Tests timeout waiting for server | Dev server slow to start | Increase `webServer.timeout` or pre-start server |
| `Error: browserType.launch` | Browsers not installed | Run `npx playwright install` |
| Flaky element clicks | Radix overlay intercepts click | Use `click({ force: true })` or wait for overlay |
| Stale DOM handles | React re-render detaches element | Use `waitFor('visible')` before action |
| Auth tests fail | Missing E2E env vars | Set `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` |

### Flaky test checklist

When a test is flaky:

1. Check for time-dependent logic -- use fixed dates.
2. Check for race conditions -- add explicit waits.
3. Check for shared state -- isolate database state.
4. Check for animation timing -- wait for animations to complete.
5. Run in headed mode to observe the failure.
6. Check the trace for timing details.
