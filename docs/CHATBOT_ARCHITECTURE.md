# AI Neighborhood Concierge Chatbot - Technical Architecture

## Overview

The AI Neighborhood Concierge is an intelligent chatbot integrated into property listing pages. It helps users explore nearby amenities (gyms, restaurants, transit, etc.) and answer questions about the property and neighborhood.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User Types Message (e.g., "What gyms are nearby?")                        │
│                              │                                               │
│                              ▼                                               │
│   ┌──────────────────────────────────────────────┐                          │
│   │    1. FAIR HOUSING POLICY CHECK              │                          │
│   │    (checkFairHousingPolicy)                  │                          │
│   │    - Blocks discriminatory queries           │                          │
│   │    - Protected: race, religion, familial     │                          │
│   │      status, disability, national origin     │                          │
│   └──────────────────────────────────────────────┘                          │
│                    │                    │                                    │
│              BLOCKED               ALLOWED                                   │
│                    │                    │                                    │
│                    ▼                    ▼                                    │
│   ┌─────────────────────┐  ┌────────────────────────────────┐               │
│   │ Show Policy Refusal │  │ 2. NEARBY INTENT DETECTION     │               │
│   │ Message             │  │    (detectNearbyIntent)        │               │
│   └─────────────────────┘  │    - Is this about places?     │               │
│                            │    - What type of search?      │               │
│                            └────────────────────────────────┘               │
│                                 │                │                           │
│                           IS NEARBY        NOT NEARBY                        │
│                                 │                │                           │
│                                 ▼                ▼                           │
│   ┌─────────────────────────────────────┐  ┌─────────────────────┐          │
│   │ 3. RATE LIMIT CHECK                 │  │ Send to LLM         │          │
│   │    (useNearbySearchRateLimit)       │  │ (Groq + Llama 3.1)  │          │
│   │    - Max 3 searches/listing/session │  └─────────────────────┘          │
│   │    - 10-second debounce             │                                    │
│   │    - 30-minute session expiry       │                                    │
│   └─────────────────────────────────────┘                                    │
│                    │                    │                                    │
│             RATE LIMITED          ALLOWED                                    │
│                    │                    │                                    │
│                    ▼                    ▼                                    │
│   ┌─────────────────────┐  ┌────────────────────────────────┐               │
│   │ Show "Search Limit  │  │ 4. RENDER NearbyPlacesCard     │               │
│   │ Reached" Message    │  │    (Google Places UI Kit)      │               │
│   └─────────────────────┘  └────────────────────────────────┘               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Main Chat Component (`NeighborhoodChat.tsx`)

The orchestrator of the entire chatbot experience.

**Location:** `src/components/NeighborhoodChat.tsx`

**Responsibilities:**
- Renders the floating chat button and chat window
- Manages message state (local messages + AI messages)
- Routes messages through the decision pipeline
- Handles suggested question chips

**Key Props:**
```typescript
interface NeighborhoodChatProps {
  latitude: number;    // Listing coordinates for nearby searches
  longitude: number;
  listingId?: string;  // Used for rate limiting
}
```

**Message Routing Logic (`handleMessage` function):**

```
User submits message
        │
        ▼
┌─────────────────────────────────────────────┐
│ Step 1: Fair Housing Policy Check           │
│ checkFairHousingPolicy(message)             │
│                                             │
│ IF blocked:                                 │
│   → Add policy refusal message              │
│   → Log blocked search                      │
│   → RETURN (stop processing)                │
└─────────────────────────────────────────────┘
        │ (allowed)
        ▼
┌─────────────────────────────────────────────┐
│ Step 2: Nearby Intent Detection             │
│ detectNearbyIntent(message)                 │
│                                             │
│ Returns:                                    │
│   - isNearbyQuery: boolean                  │
│   - searchType: 'type' | 'text'             │
│   - includedTypes?: string[]                │
│   - textQuery?: string                      │
└─────────────────────────────────────────────┘
        │
        ├── isNearbyQuery = FALSE ──────────────┐
        │                                       │
        ▼                                       ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│ NEARBY QUERY HANDLING   │         │ LLM QUERY HANDLING      │
│                         │         │                         │
│ Step 3a: Rate Limit     │         │ Send to /api/chat       │
│ - Check canSearch       │         │ (Groq Llama 3.1 8B)     │
│ - Check isDebounceBusy  │         │                         │
│                         │         │ AI responds via stream  │
│ IF allowed:             │         └─────────────────────────┘
│ - incrementCount()      │
│ - logSearchTrigger()    │
│ - Create LocalMessage   │
│   with NearbyPlacesCard │
└─────────────────────────┘
```

---

### 2. Fair Housing Policy Gate (`fair-housing-policy.ts`)

**Location:** `src/lib/fair-housing-policy.ts`

**Purpose:** Prevents queries that could lead to Fair Housing Act violations.

**Protected Classes:**
- Race, color, national origin
- Religion
- Sex/gender
- Familial status (children)
- Disability

**Blocked Query Categories:**
| Category | Example Queries |
|----------|-----------------|
| `race-neighborhood` | "white neighborhood", "asian area" |
| `safety-crime` | "safe area", "dangerous neighborhood" |
| `religion-neighborhood` | "christian community", "near mosque" |
| `no-children` | "no kids", "adults only area" |
| `no-disability` | "no wheelchairs", "able-bodied only" |
| `school-ranking` | "best school district" |
| `gentrification` | "up and coming area" |

**Refusal Response:**
> "I can help you find specific amenities like gyms, restaurants, or transit stations. What would you like me to search for?"

---

### 3. Nearby Intent Detection (`nearby-intent.ts`)

**Location:** `src/lib/nearby-intent.ts`

**Purpose:** Determines if a message is asking about nearby places and how to search.

**Two Search Types:**

| Type | When Used | Example Queries |
|------|-----------|-----------------|
| **Type-based** (`type`) | Common place categories | "gym", "grocery", "park", "transit" |
| **Text-based** (`text`) | Specific queries | "Nepali restaurant", "CrossFit", "Starbucks" |

**Place Type Mapping (Type-based):**
```javascript
{
  "gym": ["gym"],
  "grocery": ["supermarket"],
  "coffee": ["cafe"],
  "transit": ["transit_station"],
  "park": ["park"],
  // ... more mappings
}
```

**Text Search Triggers (specific patterns):**
- Ethnic cuisines: "nepali", "indian", "thai", "korean"
- Brand names: "Starbucks", "Chipotle", "Whole Foods"
- Specific activities: "CrossFit", "yoga", "pilates"
- Specialty stores: "organic", "farmers market"

**Typo Correction:**
```javascript
{
  "chipolte": "chipotle",
  "starbuks": "starbucks",
  "grocey": "grocery",
  // ... more corrections
}
```

---

### 4. Rate Limiting (`useNearbySearchRateLimit.ts`)

**Location:** `src/hooks/useNearbySearchRateLimit.ts`

**Purpose:** Prevents abuse of the Google Places API by limiting searches.

**Configuration:**
| Setting | Value | Purpose |
|---------|-------|---------|
| `MAX_SEARCHES_PER_LISTING` | 3 | Searches allowed per listing |
| `DEBOUNCE_MS` | 10,000 (10s) | Minimum time between searches |
| `SESSION_EXPIRY_MS` | 1,800,000 (30min) | Counter reset after inactivity |

**Storage:** Uses `sessionStorage` with key format: `nearby-search-limit-{listingId}`

**State Management:**
```typescript
interface RateLimitState {
  searchCount: number;    // Searches used (0-3)
  lastSearchTime: number; // Timestamp of last search
}
```

**Automatic Reset:**
- Counter resets to 0 after 30 minutes of inactivity
- Prevents stale data from blocking new sessions

---

### 5. NearbyPlacesCard (`NearbyPlacesCard.tsx`)

**Location:** `src/components/chat/NearbyPlacesCard.tsx`

**Purpose:** Renders Google Places search results using the official UI Kit.

**Google Places UI Kit Compliance:**
- Places are rendered ONLY by Google's UI Kit components (`gmp-place-search`)
- No extraction of place data into custom UI
- Google attributions are never removed/altered/obscured
- No storage of place names, addresses, or ratings

**Component Lifecycle:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ NearbyPlacesCard Mount                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. LOAD GOOGLE PLACES UI KIT                                       │
│     loadPlacesUiKit() → Promise<void>                               │
│     - Loads Maps JavaScript API                                     │
│     - Imports 'places' library                                      │
│     - Sets status: 'loading' → 'ready'                              │
│                                                                      │
│  2. CREATE UI KIT ELEMENTS (imperative DOM construction)            │
│     ┌──────────────────────────────────────────────────────────┐    │
│     │ <gmp-place-search selectable>                            │    │
│     │   ├─ <gmp-place-nearby-search-request>  (type-based)     │    │
│     │   │   - includedTypes: ["gym"]                           │    │
│     │   │   - locationRestriction: google.maps.Circle          │    │
│     │   │   - maxResultCount: 5                                │    │
│     │   │                                                      │    │
│     │   └─ <gmp-place-text-search-request>    (text-based)     │    │
│     │       - textQuery: "CrossFit"                            │    │
│     │       - locationBias: google.maps.Circle                 │    │
│     │       - maxResultCount: 5                                │    │
│     │                                                          │    │
│     │   └─ <gmp-place-all-content />                           │    │
│     └──────────────────────────────────────────────────────────┘    │
│                                                                      │
│  3. HANDLE SEARCH RESULTS (gmp-load event)                          │
│     - Extract places array from searchElement.places                │
│     - Extract coordinates immediately (before objects become stale) │
│     - If 0 results AND radius < 5km → expand search radius          │
│     - Store in placesLite state for DistanceRail                    │
│                                                                      │
│  4. RENDER DISTANCE BADGES (DistanceRail component)                 │
│     - Calculates haversine distances from listing origin            │
│     - Positions badges next to each result row                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Search Radius Expansion:**
- Initial radius: 1.6 km (1 mile)
- If no results found: Expands to 5 km (3.1 miles)
- Shows "(expanded)" indicator in header

---

### 6. Distance Rail (`DistanceRail.tsx`)

**Location:** `src/components/chat/DistanceRail.tsx`

**Purpose:** Displays distance badges next to each place result.

**How It Works:**

```
┌────────────────────────────────────────────────────────────┐
│ DISTANCE CALCULATION                                        │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Input:                                                     │
│  - origin: { lat, lng } (listing coordinates)               │
│  - places: Array<{ key, location, coords }>                 │
│                                                             │
│  Process:                                                   │
│  1. For each place, get coordinates (multi-tier resolution):│
│     a. Use pre-extracted coords from parent (place.coords)  │
│     b. Use locally cached coords (from previous extraction) │
│     c. Try to extract from location reference               │
│                                                             │
│  2. Calculate distance using Haversine formula:             │
│     haversineMeters(origin, placeCoords)                    │
│                                                             │
│  3. Format distance:                                        │
│     - Under 0.1 mi → Show in feet (e.g., "450 ft")         │
│     - Under 10 mi  → Show 1 decimal (e.g., "2.3 mi")       │
│     - Over 10 mi   → Show rounded (e.g., "15 mi")          │
│                                                             │
│  4. Position badges vertically aligned with result rows    │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Shadow DOM Traversal:**
Google's UI Kit uses Shadow DOM. The component traverses open shadow roots to find result row elements for positioning.

---

### 7. Google Maps UI Kit Loader (`googleMapsUiKitLoader.ts`)

**Location:** `src/lib/googleMapsUiKitLoader.ts`

**Purpose:** Singleton loader for Google Maps JavaScript API with Places library.

**Required Setup:**
1. Enable "Places UI Kit" in Google Cloud Console (not just Places API)
2. Set `NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY` in `.env.local`

**Loading Strategy:**
```javascript
// Callback-based loading (not async loading)
const script = document.createElement('script');
script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta&callback=${CALLBACK_NAME}`;

// On callback:
await window.google.maps.importLibrary('places');
```

---

### 8. LLM Backend (`/api/chat/route.ts`)

**Location:** `src/app/api/chat/route.ts`

**Purpose:** Handles non-nearby queries using Groq's Llama 3.1 8B model.

**Architecture:**
- Uses Vercel AI SDK (`ai` package)
- Streams responses via `streamText`
- Fallback tool for nearby searches that slip past client-side detection

**System Prompt:**
> "You are a helpful assistant for a room rental listing. You can answer general questions about the property and neighborhood. For questions about nearby places, use the nearbyPlaceSearch tool..."

**Fallback Tool:**
```typescript
nearbyPlaceSearch: tool({
  description: 'Trigger a search for nearby places...',
  inputSchema: z.object({
    query: z.string()
  }),
  execute: async ({ query }) => {
    // Returns action metadata - NO place data
    return {
      action: 'NEARBY_UI_KIT',
      query,
      searchType,
      includedTypes,
      coordinates: { lat, lng }
    };
  }
})
```

---

### 9. Search Logging (`logNearbySearch.ts`)

**Location:** `src/lib/logNearbySearch.ts`

**Purpose:** Tracks search usage for analytics (without storing place data).

**Compliance:**
- NO place names, addresses, or ratings logged
- Only metadata: session ID, listing ID, intent, search type
- Fire-and-forget (doesn't block UI)

**What Gets Logged:**
```typescript
{
  timestamp: "2024-01-15T10:30:00.000Z",
  userId: "anonymous",
  sessionId: "sess_1705315800_abc123",
  listingId: "listing-456",
  intent: "gym",
  searchType: "type",
  blocked: false,
  blockReason: null
}
```

---

## Message Types & UI Rendering

### LocalMessage Types

| Type | Description | UI Rendering |
|------|-------------|--------------|
| `nearby-places` | Nearby search results | `NearbyPlacesCard` component |
| `policy-refusal` | Fair Housing violation | Amber warning box |
| `rate-limit` | Search limit reached | Gray info box |
| `debounce` | Too many searches quickly | Gray info box |

### AI Messages

AI-generated text responses use the standard chat bubble styling (white background, rounded corners).

---

## Object Reference Stability (Performance Optimization)

A critical optimization to prevent unnecessary re-renders:

**Problem:** React re-renders components when prop references change.

**Solution:** `stableNormalizedIntent` is created once at message creation time:

```typescript
// In handleMessage() - created ONCE
const nearbyMessage: LocalMessage = {
  id: generateMessageId(),
  nearbyPlacesData: {
    queryText: trimmedMessage,
    normalizedIntent: intent,
    // This object reference is preserved forever
    stableNormalizedIntent: {
      mode: intent.searchType,
      includedTypes: intent.includedTypes,
      textQuery: intent.textQuery,
    },
  },
};
```

**Why This Matters:**
- Without this, adding a new message would recreate ALL `normalizedIntent` objects
- Every `NearbyPlacesCard` would see new props and re-render
- Google Places UI Kit elements would be destroyed and recreated
- Distance badges would flicker/disappear

---

## Environment Variables

| Variable | Purpose | Where Used |
|----------|---------|------------|
| `NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY` | Google Maps API key (browser) | `googleMapsUiKitLoader.ts` |
| `GROQ_API_KEY` | Groq API key (server) | `/api/chat/route.ts` |

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  USER INPUT: "What gyms are nearby?"                                        │
│                                                                              │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │ NeighborhoodChat.handleMessage()                                 │        │
│  │                                                                  │        │
│  │  1. checkFairHousingPolicy("What gyms are nearby?")             │        │
│  │     → { allowed: true }                                         │        │
│  │                                                                  │        │
│  │  2. detectNearbyIntent("What gyms are nearby?")                 │        │
│  │     → { isNearbyQuery: true, searchType: 'type',                │        │
│  │         includedTypes: ['gym'], normalizedQuery: 'gym' }        │        │
│  │                                                                  │        │
│  │  3. useNearbySearchRateLimit.canSearch                          │        │
│  │     → true (1 of 3 searches used)                               │        │
│  │                                                                  │        │
│  │  4. Create LocalMessage with nearbyPlacesData                   │        │
│  │     → stableNormalizedIntent created here (once)                │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │ NearbyPlacesCard renders                                         │        │
│  │                                                                  │        │
│  │  1. loadPlacesUiKit() → Google Maps API loaded                  │        │
│  │                                                                  │        │
│  │  2. Create DOM elements imperatively:                           │        │
│  │     <gmp-place-search>                                          │        │
│  │       <gmp-place-nearby-search-request                          │        │
│  │         includedTypes={["gym"]}                                 │        │
│  │         locationRestriction={Circle(center, 1600m)}            │        │
│  │         maxResultCount={5}                                      │        │
│  │       />                                                        │        │
│  │       <gmp-place-all-content />                                 │        │
│  │     </gmp-place-search>                                         │        │
│  │                                                                  │        │
│  │  3. Google Places UI Kit fetches and renders results            │        │
│  │                                                                  │        │
│  │  4. On 'gmp-load' event:                                        │        │
│  │     - Extract coordinates from results                          │        │
│  │     - Store in placesLite state                                 │        │
│  │     - If 0 results → expand to 5km radius                       │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │ DistanceRail renders alongside results                           │        │
│  │                                                                  │        │
│  │  For each place:                                                │        │
│  │  1. Get coordinates (cached or extracted)                       │        │
│  │  2. Calculate haversine distance from listing                   │        │
│  │  3. Format: "0.3 mi" or "450 ft"                                │        │
│  │  4. Position badge next to result row                           │        │
│  │                                                                  │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  FINAL OUTPUT:                                                              │
│  ┌─────────────────────────────────────────────────┐                        │
│  │ 📍 Nearby Results                               │                        │
│  │ ─────────────────────────────────────────────── │                        │
│  │ [Planet Fitness - Downtown]        │ 0.3 mi    │                        │
│  │ [24 Hour Fitness]                  │ 0.8 mi    │                        │
│  │ [CrossFit Central]                 │ 1.2 mi    │                        │
│  │ [Anytime Fitness]                  │ 1.5 mi    │                        │
│  │ [Gold's Gym]                       │ 2.1 mi    │                        │
│  │ ─────────────────────────────────────────────── │                        │
│  │ 🔲 Google Attribution                           │                        │
│  └─────────────────────────────────────────────────┘                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Security & Compliance

### Fair Housing Act Compliance
- All queries are screened before processing
- Discriminatory patterns are blocked immediately
- Refusal messages don't reveal which pattern was matched

### Google Places API Compliance
- Results rendered only via official UI Kit
- No data extraction into custom UI
- Attributions always visible
- No caching of place data

### Rate Limiting
- Prevents API abuse
- Session-based limits (not persisted beyond 30 min)
- Graceful user messaging

---

## Testing Checklist

- [ ] Fair Housing: Try blocked queries (e.g., "safe neighborhood") → Should show refusal
- [ ] Type Search: Try "gym" → Should show nearby gyms with distances
- [ ] Text Search: Try "Starbucks" → Should do text-based search
- [ ] Rate Limit: Make 3 searches → 4th should be blocked
- [ ] Debounce: Search twice quickly → Second should show "wait" message
- [ ] Session Expiry: Wait 30+ minutes → Counter should reset
- [ ] Distance Units: Check distances show in miles/feet (not km)
- [ ] Multiple Cards: Add multiple searches → Previous cards shouldn't reload
