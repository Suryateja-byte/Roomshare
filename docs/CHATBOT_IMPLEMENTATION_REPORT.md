# AI Neighborhood Concierge - Comprehensive Implementation Report

**Generated:** December 16, 2025
**Project:** RoomShare
**Component:** AI Neighborhood Concierge Chatbot

---

## Executive Summary

The AI Neighborhood Concierge is a sophisticated chatbot system integrated into the RoomShare listing detail pages. It enables users to explore nearby amenities and ask questions about listings using a hybrid approach combining:

1. **Google Places UI Kit** - For real-time nearby place searches
2. **Groq + Llama 3.1** - For conversational AI responses about neighborhoods

The system implements comprehensive security measures including Fair Housing Act compliance, multi-layer rate limiting, privacy-safe logging, and Google Places API Terms of Service compliance.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Component Breakdown](#2-component-breakdown)
3. [Data Flow Analysis](#3-data-flow-analysis)
4. [Security Implementation](#4-security-implementation)
5. [Rate Limiting System](#5-rate-limiting-system)
6. [Intent Detection Engine](#6-intent-detection-engine)
7. [Fair Housing Compliance](#7-fair-housing-compliance)
8. [Google Places Integration](#8-google-places-integration)
9. [Privacy & Logging](#9-privacy--logging)
10. [Testing Coverage](#10-testing-coverage)
11. [File Reference Map](#11-file-reference-map)

---

## 1. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LISTING PAGE CLIENT                                │
│                    src/app/listings/[id]/ListingPageClient.tsx              │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEIGHBORHOOD CHAT                                    │
│                     src/components/NeighborhoodChat.tsx                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Props: { latitude, longitude, listingId }                          │    │
│  │  State: messages[], isLoading, error                                 │    │
│  │  Hooks: useNearbySearchRateLimit                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            │                                      │
            ▼                                      ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│     NEARBY PLACES PATH        │    │       LLM CHAT PATH           │
│  (Client-Side)                │    │    (Server-Side)              │
│                               │    │                               │
│  1. detectNearbyIntent()      │    │  1. POST /api/chat            │
│  2. checkFairHousingPolicy()  │    │  2. Fair Housing Check        │
│  3. NearbyPlacesCard          │    │  3. Rate Limit Check          │
│  4. Google Places UI Kit      │    │  4. Groq/Llama Streaming      │
│                               │    │  5. Response Rendering        │
└───────────────────────────────┘    └───────────────────────────────┘
                │                                  │
                ▼                                  ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│   GOOGLE PLACES UI KIT        │    │     GROQ API                  │
│   gmp-place-search            │    │     llama-3.1-8b-instant      │
│   gmp-place-nearby-search     │    │     Streaming Response        │
│   gmp-place-text-search       │    │                               │
└───────────────────────────────┘    └───────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 18 + Next.js 14 | UI rendering |
| Animation | Framer Motion | Chat animations |
| AI | Groq + Llama 3.1 (8B) | Conversational responses |
| Places | Google Places UI Kit (Beta) | Nearby place search |
| Rate Limiting | Upstash Redis | Server-side rate limits |
| State | sessionStorage + React Hooks | Client-side rate limits |

---

## 2. Component Breakdown

### 2.1 Main Chat Component

**File:** `src/components/NeighborhoodChat.tsx`
**Lines:** 530+
**Responsibility:** Primary chat interface and message orchestration

```typescript
interface NeighborhoodChatProps {
  latitude: number;
  longitude: number;
  listingId: string;
}
```

**Key Features:**
- Expandable chat panel with sliding animation
- Message history with assistant/user differentiation
- Real-time streaming from LLM responses
- Automatic intent routing (nearby vs LLM)
- Welcome message with suggested queries
- Error handling with retry capability
- 30-second LLM timeout protection

**State Management:**
```typescript
const [isOpen, setIsOpen] = useState(false);
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [inputValue, setInputValue] = useState('');
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [pendingNearbyCard, setPendingNearbyCard] = useState<NearbyCardData | null>(null);
```

### 2.2 Nearby Places Card

**File:** `src/components/chat/NearbyPlacesCard.tsx`
**Lines:** 460+
**Responsibility:** Google Places UI Kit wrapper with ToS compliance

```typescript
interface NearbyPlacesCardProps {
  latitude: number;
  longitude: number;
  queryText: string;
  normalizedIntent: {
    mode: 'type' | 'text';
    includedTypes?: string[];
    textQuery?: string;
  };
  onSearchComplete?: (resultCount: number) => void;
  onSearchSuccess?: () => void;
  isVisible?: boolean;
  canSearch?: boolean;
  remainingSearches?: number;
  multiBrandDetected?: boolean;
}
```

**Search Configuration:**
```typescript
const INITIAL_RADIUS = 1600;    // 1.6km initial search
const EXPANDED_RADIUS = 5000;   // 5km expanded search
const MAX_RESULTS = 5;          // Results per search
const SEARCH_TIMEOUT_MS = 15000; // 15s timeout
```

**Status States:**
- `loading` - Initializing Places UI Kit
- `ready` - Search executing
- `error` - API failure
- `no-results` - Empty results
- `rate-limited` - Quota exceeded

**Google Places API Compliance Notes:**
- Places are rendered ONLY by UI Kit components (`gmp-place-search`)
- No extraction of place data to custom UI
- Google attributions preserved (`<gmp-place-attribution />`)
- No storage of place names/addresses/ratings
- No coordinate extraction from `place.location`

### 2.3 Chat API Route

**File:** `src/app/api/chat/route.ts`
**Lines:** 230+
**Runtime:** Node.js (Edge incompatible due to streaming)

**Security Stack (8 Layers):**
1. Origin/Host enforcement (exact match from env allowlist)
2. Content-Type: `application/json` enforcement
3. Rate limit check (Redis-backed, dual burst + sustained)
4. Body size guard (100KB max via `request.text()`)
5. JSON parsing with error handling
6. Input validation (listingId, message content)
7. Fair Housing policy check
8. Groq streaming with timeout

**System Prompt Strategy:**
```typescript
const systemPrompt = `You are a helpful neighborhood concierge...
Context: User is viewing a listing at coordinates (${latitude}, ${longitude}).
Guidelines:
- Provide helpful information about the neighborhood
- Focus on amenities, transportation, and local features
- Do not discuss specific safety statistics or crime rates
- Do not make recommendations based on demographics
- If asked about Fair Housing protected topics, redirect...`;
```

**Streaming Implementation:**
```typescript
return new Response(stream, {
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  },
});
```

---

## 3. Data Flow Analysis

### 3.1 User Message Flow

```
User Input
    │
    ▼
┌─────────────────────────────────────────┐
│ 1. INPUT VALIDATION                      │
│    - Trim whitespace                     │
│    - Check max length (500 chars)        │
│    - Reject empty input                  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 2. FAIR HOUSING POLICY CHECK            │
│    checkFairHousingPolicy(message)       │
│    - 28+ blocked patterns               │
│    - If blocked → show refusal message  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 3. INTENT DETECTION                     │
│    detectNearbyIntent(message)          │
│    - Check location keywords            │
│    - Extract place types                │
│    - Determine search type (type/text)  │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
┌──────────────┐  ┌──────────────────┐
│ NEARBY PATH  │  │    LLM PATH      │
│              │  │                  │
│ Rate limit   │  │ POST /api/chat   │
│ check        │  │ Server-side      │
│ (client)     │  │ processing       │
│              │  │                  │
│ Render       │  │ Stream response  │
│ PlacesCard   │  │ to UI            │
└──────────────┘  └──────────────────┘
```

### 3.2 Nearby Search Decision Tree

```
detectNearbyIntent(message)
    │
    ├─► containsCodeBlock? → NO (skip)
    │
    ├─► matches LLM_ONLY_PATTERNS? → NO (route to LLM)
    │   - "what time does X open"
    │   - "how much does X cost"
    │   - "is X good"
    │
    ├─► matches LISTING_CONTEXT_PATTERNS? → NO (route to LLM)
    │   - "is there parking here"
    │   - "does this place have..."
    │
    ├─► matches NEGATION_PATTERNS? → NO (route to LLM)
    │   - "I don't need a gym"
    │   - "no restaurants please"
    │
    ├─► hasMixedIntent? → NO (route to LLM)
    │   - "where is gym + what are hours"
    │
    ├─► hasLocationIntent? → YES
    │   │
    │   ├─► shouldUseTextSearch? → TEXT SEARCH
    │   │   - Specific cuisines
    │   │   - Brand names
    │   │   - Specialty activities
    │   │
    │   └─► extractPlaceTypes? → TYPE SEARCH
    │       - Generic place types
    │       - Returns includedTypes[]
    │
    └─► DEFAULT → TEXT SEARCH with normalized query
```

---

## 4. Security Implementation

### 4.1 API Route Security Stack

| Layer | Protection | Implementation |
|-------|------------|----------------|
| 1 | Origin Enforcement | `ALLOWED_ORIGINS` env var exact match |
| 2 | Host Enforcement | `ALLOWED_HOSTS` env var exact match |
| 3 | Content-Type | Reject non-JSON requests |
| 4 | Rate Limiting | Redis-backed (Upstash) |
| 5 | Body Size | 100KB max via `request.text()` |
| 6 | Input Validation | Schema validation |
| 7 | Fair Housing | Pattern matching before AI |
| 8 | Output Sanitization | No user reflection |

### 4.2 Input Validation

```typescript
// Message validation
if (!message || typeof message !== 'string') {
  return error('Invalid message');
}
if (message.length > 500) {
  return error('Message too long');
}

// Listing validation
if (!listingId || typeof listingId !== 'string' || listingId.length > 64) {
  return error('Invalid listingId');
}
```

### 4.3 CORS Configuration

```typescript
// Production: Strict origin matching
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
const allowedHosts = process.env.ALLOWED_HOSTS?.split(',') || [];

// Development: Allow localhost
if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push('http://localhost:3000');
  allowedHosts.push('localhost:3000', 'localhost');
}
```

---

## 5. Rate Limiting System

### 5.1 Multi-Layer Rate Limiting

The system implements rate limiting at three levels:

| Level | Scope | Limits | Storage |
|-------|-------|--------|---------|
| Client-Side | Per listing per session | 3 searches, 10s debounce | sessionStorage |
| Server Burst | Per IP per minute | 5 req/min (chat), 100 req/min (metrics) | Redis |
| Server Sustained | Per IP per hour | 30 req/hour (chat), 500 req/hour (metrics) | Redis |

### 5.2 Client-Side Rate Limit Hook

**File:** `src/hooks/useNearbySearchRateLimit.ts`

```typescript
const MAX_SEARCHES_PER_LISTING = 3;
const DEBOUNCE_MS = 10000;        // 10 seconds
const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

interface UseNearbySearchRateLimitReturn {
  canSearch: boolean;
  remainingSearches: number;
  isDebounceBusy: boolean;
  debounceRemainingMs: number;    // For countdown display
  startDebounce: () => void;
  incrementCount: () => void;
  reset: () => void;
}
```

**Storage Key Format:**
```typescript
`nearby-search-limit-${listingId}`
```

### 5.3 Server-Side Rate Limiting

**File:** `src/lib/rate-limit-redis.ts`

```typescript
// Chat API Rate Limits
export const chatBurstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'chat-burst',
});

export const chatSustainedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 h'),
  prefix: 'chat-sustained',
});

// Metrics API Rate Limits (higher since fire-and-forget)
export const metricsBurstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  prefix: 'metrics-burst',
});
```

**Fail-Closed Behavior:**
- Development without Redis: Rate limiting bypassed
- Production without Redis: All requests denied
- Redis error: Requests denied (security over availability)

---

## 6. Intent Detection Engine

### 6.1 Core Detection Function

**File:** `src/lib/nearby-intent.ts`

```typescript
interface NearbyIntentResult {
  isNearbyQuery: boolean;
  searchType: 'type' | 'text';
  includedTypes?: string[];    // For type-based search
  textQuery?: string;          // For text-based search
  normalizedQuery: string;
  multiBrandDetected?: boolean;
  hasMixedIntent?: boolean;
}
```

### 6.2 Place Type Mapping

```typescript
const PLACE_TYPE_MAP: Record<string, string[]> = {
  // Fitness
  gym: ['gym'],
  fitness: ['gym'],

  // Food & Drink
  restaurant: ['restaurant'],
  cafe: ['cafe'],
  coffee: ['cafe'],

  // Shopping
  grocery: ['supermarket'],
  supermarket: ['supermarket'],

  // Transit
  transit: ['transit_station'],
  subway: ['subway_station'],
  train: ['train_station'],

  // ...50+ mappings
};
```

### 6.3 Internationalization Support

**Romanized Keywords (30+):**
```typescript
const I18N_KEYWORDS: Record<string, string> = {
  // Japanese (Romanized)
  jimu: 'gym',
  suupaa: 'supermarket',

  // Spanish
  gimnasio: 'gym',
  supermercado: 'supermarket',

  // Chinese (Pinyin)
  jianshenfa: 'gym',
  chaoshi: 'supermarket',
};
```

**Unicode Keywords (60+):**
```typescript
const UNICODE_KEYWORDS: Record<string, string> = {
  // Chinese (Simplified)
  '咖啡': 'cafe',
  '健身房': 'gym',
  '超市': 'supermarket',

  // Japanese
  'ジム': 'gym',
  'カフェ': 'cafe',

  // Korean
  '카페': 'cafe',
  '헬스장': 'gym',

  // Arabic
  'مقهى': 'cafe',
  'صالة رياضية': 'gym',
};
```

### 6.4 Typo Correction Dictionary

```typescript
const TYPO_CORRECTIONS: Record<string, string> = {
  // Brand names
  chipolte: 'chipotle',
  starbuks: 'starbucks',
  mcdonlds: "mcdonald's",

  // Common misspellings
  resteraunt: 'restaurant',
  grocey: 'grocery',
  pharmcy: 'pharmacy',
  laundramat: 'laundromat',

  // ...40+ corrections
};
```

---

## 7. Fair Housing Compliance

### 7.1 Policy Implementation

**File:** `src/lib/fair-housing-policy.ts`

**Protected Classes (FHA):**
- Race
- Color
- Religion
- National Origin
- Sex
- Familial Status
- Disability

### 7.2 Blocked Pattern Categories

| Category | Examples | Count |
|----------|----------|-------|
| `race-neighborhood` | "white neighborhood", "asian area" | 3 |
| `demographic-location` | "where do Indians live" | 1 |
| `demographic-exclusion` | "no blacks", "avoid hispanics" | 1 |
| `safety-crime` | "safe neighborhood", "crime rate" | 3 |
| `crime-statistics` | "violent crime", "robbery area" | 1 |
| `negative-area` | "bad area", "sketchy neighborhood" | 1 |
| `positive-area-vague` | "good neighborhood", "nice area" | 1 |
| `religion-neighborhood` | "christian area", "muslim community" | 2 |
| `no-children` | "no kids", "no children area" | 2 |
| `adults-only` | "adults only", "child free" | 1 |
| `no-disability` | "no disabled", "no wheelchairs" | 2 |
| `school-ranking` | "best school district" | 1 |
| `gentrification` | "up and coming", "gentrifying" | 2 |

**Total: 28+ blocked patterns across 19 categories**

### 7.3 Refusal Strategy

```typescript
export const POLICY_REFUSAL_MESSAGE =
  "I can help you find specific amenities like gyms, restaurants, or transit stations. " +
  "What would you like me to search for?";
```

**Key Design Decisions:**
- Generic refusal message (no category reveal to prevent gaming)
- No logging of matched pattern category
- Redirect user to allowed searches

---

## 8. Google Places Integration

### 8.1 UI Kit Loader

**File:** `src/lib/googleMapsUiKitLoader.ts`

```typescript
// Singleton loader pattern
let loadPromise: Promise<void> | null = null;
let isLoaded = false;

export async function loadPlacesUiKit(): Promise<void> {
  if (isLoaded && window.google?.maps?.places) return;
  if (loadPromise) return loadPromise;

  // Create callback-based loader
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}
```

### 8.2 Search Types

**Type-Based Search (Nearby Search):**
```html
<gmp-place-search selectable>
  <gmp-place-nearby-search-request
    .includedTypes=${['gym', 'restaurant']}
    .maxResultCount=${5}
    .locationRestriction=${new google.maps.Circle({center, radius})}
  />
  <gmp-place-all-content />
</gmp-place-search>
```

**Text-Based Search:**
```html
<gmp-place-search selectable>
  <gmp-place-text-search-request
    .textQuery=${'indian restaurant'}
    .maxResultCount=${5}
    .locationBias=${new google.maps.Circle({center, radius})}
  />
  <gmp-place-all-content />
</gmp-place-search>
```

### 8.3 ToS Compliance Checklist

| Requirement | Implementation |
|-------------|----------------|
| Use official UI components | `gmp-place-search`, `gmp-place-all-content` |
| Show Google attributions | `<gmp-place-attribution />` |
| No custom place rendering | Places shown only via UI Kit |
| No data extraction | Only result count accessed |
| No coordinate extraction | `place.location` never accessed |
| No data storage | No place data persisted |

---

## 9. Privacy & Logging

### 9.1 Client-Side Metrics

**File:** `src/lib/logNearbySearch.ts`

```typescript
interface ClientMetricsParams {
  listingId: string;    // Will be HMAC'd server-side
  route: 'nearby' | 'llm';
  isBlocked: boolean;
  searchType?: 'type' | 'text';
  includedTypes?: string[];
  resultCount?: number;
}
```

**Privacy Measures:**
- No user text logged
- No blocked category logged
- Session ID via `crypto.randomUUID()`
- Fire-and-forget (non-blocking)

### 9.2 Server-Side Metrics API

**File:** `src/app/api/metrics/route.ts`

**HMAC Processing:**
```typescript
function hmacListingId(listingId: string): string {
  return crypto
    .createHmac('sha256', LOG_HMAC_SECRET)
    .update(listingId)
    .digest('hex')
    .slice(0, 16);
}
```

**Allowlisted Place Types (27):**
```typescript
const ALLOWED_PLACE_TYPES = new Set([
  'restaurant', 'cafe', 'bar', 'grocery_store', 'supermarket',
  'pharmacy', 'hospital', 'doctor', 'dentist', 'gym', 'park',
  'library', 'bank', 'atm', 'gas_station', 'parking',
  'bus_station', 'subway_station', 'train_station', 'airport',
  'laundry', 'dry_cleaner', 'post_office', 'shopping_mall',
  'convenience_store', 'hardware_store', 'pet_store',
  'movie_theater', 'museum', 'art_gallery'
]);
```

**Intentionally Excluded:**
- Religion (church, mosque, synagogue)
- Education (school, university)

### 9.3 Safe Log Format

```typescript
const safeLog = {
  ts: Date.now(),
  lid: hmacListingId(payload.listingId),  // Never raw ID
  sid: payload.sid,
  route: payload.route,
  blocked: payload.blocked,
  // Only for allowed requests:
  type: payload.type,
  types: payload.types,
  count: payload.count,
};
```

---

## 10. Testing Coverage

### 10.1 Test Files

| File | Coverage Area |
|------|---------------|
| `src/__tests__/lib/nearby-intent.test.ts` | Intent detection |
| `src/__tests__/lib/fair-housing-policy.test.ts` | Policy compliance |
| `src/__tests__/hooks/useNearbySearchRateLimit.test.tsx` | Rate limiting |
| `src/__tests__/actions/chat.test.ts` | Chat server actions |

### 10.2 Test Categories

**Intent Detection Tests:**
- Type-based queries (gym, grocery, park, transit)
- Text-based queries (cuisines, brands, activities)
- Non-nearby queries (property questions)
- Edge cases (empty, single word, typos)
- Listing context detection (P1-B15)
- Distance query detection (P1-B16)
- Unicode/i18n support (P1-B19)
- Negation pattern detection (P2-B24)
- Code block detection (P2-B25)
- Multi-brand detection (P2-C3)

**Fair Housing Tests:**
- Allowed queries (amenities)
- Blocked race/ethnicity queries
- Blocked safety/crime queries
- Blocked religion queries
- Blocked familial status queries
- Blocked disability queries
- Blocked school ranking queries
- Blocked gentrification queries
- Edge cases (empty, short, null)
- Case insensitivity

---

## 11. File Reference Map

### 11.1 Components

| Path | Purpose | Lines |
|------|---------|-------|
| `src/components/NeighborhoodChat.tsx` | Main chat interface | 530+ |
| `src/components/chat/NearbyPlacesCard.tsx` | Places UI Kit wrapper | 460+ |

### 11.2 API Routes

| Path | Purpose | Runtime |
|------|---------|---------|
| `src/app/api/chat/route.ts` | LLM chat endpoint | Node.js |
| `src/app/api/metrics/route.ts` | Privacy-safe logging | Node.js |

### 11.3 Libraries

| Path | Purpose |
|------|---------|
| `src/lib/nearby-intent.ts` | Intent detection engine |
| `src/lib/fair-housing-policy.ts` | FHA compliance |
| `src/lib/googleMapsUiKitLoader.ts` | Maps API loader |
| `src/lib/logNearbySearch.ts` | Client metrics |
| `src/lib/rate-limit-redis.ts` | Redis rate limiting |

### 11.4 Hooks

| Path | Purpose |
|------|---------|
| `src/hooks/useNearbySearchRateLimit.ts` | Client rate limiting |

### 11.5 Types

| Path | Purpose |
|------|---------|
| `src/types/google-places-ui-kit.d.ts` | Places UI Kit TypeScript declarations |

### 11.6 Integration Point

| Path | Line | Usage |
|------|------|-------|
| `src/app/listings/[id]/ListingPageClient.tsx` | 526 | `<NeighborhoodChat>` render |

---

## Environment Variables

```env
# Groq (AI chat)
GROQ_API_KEY=gsk_...

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY=AIza...

# Rate Limiting
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Security
ALLOWED_ORIGINS=https://example.com
ALLOWED_HOSTS=example.com

# Logging
LOG_HMAC_SECRET=your-32-byte-secret
```

---

## Known Bug Fixes Applied

| ID | Description | Status |
|----|-------------|--------|
| P0-B27 | Rate limit bypass on canSearch prop change | Fixed |
| P1-03 | Separate debounce from search count | Fixed |
| P1-04 | Countdown display for debounce | Fixed |
| P1-05 | Improved timeout error message | Fixed |
| P1-B15 | Listing context pattern detection | Fixed |
| P1-B16 | Distance query detection | Fixed |
| P1-B19 | Unicode/non-romanized script support | Fixed |
| P2-B24 | Negation pattern detection | Fixed |
| P2-B25 | Code block detection | Fixed |
| P2-C3 | Multi-brand detection warning | Fixed |
| B2 | useEffect cleanup for Places UI | Fixed |
| B4 | Multi-intent type collection | Fixed |
| B5 | i18n keyword translation | Fixed |
| B6 | Search timeout handling | Fixed |
| B14 | Emergency services & education types | Fixed |
| B18 | Functional state update for rate limit | Fixed |
| B22 | Expanded typo corrections | Fixed |
| C2 | Rate limited state rendering | Fixed |
| C5 | LLM-only pattern routing | Fixed |
| C6 | Parking type support | Fixed |
| C7 | Mixed intent detection | Fixed |
| C8 | Search radius display in no-results | Fixed |
| C13 | Enhanced skeleton UI during load | Fixed |
| C14 | Expanded typo dictionary | Fixed |

---

## Conclusion

The AI Neighborhood Concierge is a well-architected chatbot system that balances functionality with security and compliance. Key strengths include:

1. **Hybrid Architecture** - Intelligent routing between Places API and LLM
2. **Multi-Layer Security** - 8+ security controls on each API route
3. **Fair Housing Compliance** - Comprehensive pattern blocking
4. **Privacy by Design** - HMAC-based logging, no PII storage
5. **ToS Compliance** - Proper Google Places UI Kit usage
6. **Internationalization** - 100+ i18n keyword mappings
7. **Rate Limiting** - 3-tier protection (client, burst, sustained)
8. **Comprehensive Testing** - Intent, policy, and rate limit tests

---

*Report generated by Claude Code analysis of RoomShare codebase.*
