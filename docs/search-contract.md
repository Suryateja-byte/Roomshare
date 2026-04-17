# Roomshare Search Contract

Single source of truth: the TypeScript types referenced below. This document
explains them, how they compose, and what compatibility guarantees exist across
the CFM (contact-first migration) transition. If types and this doc conflict,
the types win — fix the doc.

Ticket history: CFM-002 (this contract), CFM-401 (input normalization),
CFM-402 (query building), CFM-403 (query-hash versioning), CFM-404 (response
shape), CFM-405 (dirty-doc pipeline). See `docs/plans/cfm-migration-plan.md`.

---

## 1. Normalized input contract

The search stack has two input layers:

1. **URL / raw params** — what the browser sends.
2. **Normalized filters / query** — the internal canonical shape every reader
   (list, map, facets, cards, detail) consumes.

The normalizer in `src/lib/search-params.ts` bridges them: it accepts the raw
shape, tolerates legacy aliases, and emits a canonical object that downstream
code treats as the single source of truth.

### 1.1 Canonical filter keys

`FILTER_QUERY_KEYS` (`src/lib/search-params.ts:161-178`) is the exhaustive
whitelist of filter URL params that affect the result set. Everything outside
this list is either location/pagination/sort metadata or a deprecated alias
that gets translated before reaching readers.

Currently 16 entries:

```
q, what, minPrice, maxPrice, amenities, moveInDate, endDate, leaseDuration,
houseRules, languages, roomType, genderPreference, householdGender,
bookingMode, minSlots, nearMatches
```

### 1.2 `NormalizedSearchFilters`

Defined at `src/lib/search-params.ts:123-125`, extends `FilterCriteria`
(`src/lib/search-types.ts:103`). This is the output of `parseSearchParams()`
+ `normalizeSearchFilters()`. Callers outside of URL parsing should prefer
this shape over `RawSearchParams`.

`FilterCriteria` fields (all optional; see `search-types.ts:66-96`):

| Field | Type | Purpose / range |
|---|---|---|
| `query` | `string` | Free-text search. Trimmed, truncated to `MAX_QUERY_LENGTH`. |
| `locationLabel` | `string` | Display-only; not a hard filter. |
| `vibeQuery` | `string` | Semantic/"vibe" query passed through to v2 ranker. |
| `minPrice` / `maxPrice` | `number` | USD. Clamped to `MAX_SAFE_PRICE`. |
| `amenities` | `string[]` | Validated against `VALID_AMENITIES`; unknowns dropped. |
| `moveInDate` | `string` (YYYY-MM-DD) | Earliest move-in the requester wants. |
| `endDate` | `string` (YYYY-MM-DD) | Latest move-in / lease-end window. |
| `leaseDuration` | `string` | From `VALID_LEASE_DURATIONS`. Aliases in `LEASE_DURATION_ALIASES`. |
| `houseRules` | `string[]` | From `VALID_HOUSE_RULES`. |
| `languages` | `string[]` | ISO-639 codes; normalized via `normalizeLanguages`. |
| `roomType` | `string` | From `VALID_ROOM_TYPES`. Aliases in `ROOM_TYPE_ALIASES`. |
| `genderPreference` | `string` | From `VALID_GENDER_PREFERENCES`. |
| `householdGender` | `string` | From `VALID_HOUSEHOLD_GENDERS`. |
| `bookingMode` | `string` | `"SHARED"` \| `"WHOLE_UNIT"`. |
| `bounds` | `{minLat,maxLat,minLng,maxLng}` | Map viewport. Each bound ∈ [-90,90] / [-180,180]. |
| `sort` | `SortOption` | From `VALID_SORT_OPTIONS`. |
| `minAvailableSlots` | `number` | Minimum seats needed (`minSlots` on the URL). |
| `nearMatches` | `boolean` | Opt-in near-match expansion. |

`NormalizedSearchFilters` adds one field:

| Field | Type | Purpose |
|---|---|---|
| `availabilityIntent` | `"availability" \| undefined` | **Internal transient flag.** Never round-trips to the URL; set by call sites that want to preserve the `moveInDate + endDate` pair through filter serialization. Not part of the URL vocabulary. |

`FilterParams` (`src/lib/search-types.ts:66-96`) is the same shape plus
pagination fields (`page`, `limit`). URL-parser-layer uses `FilterCriteria`
because `parseSearchParams()` returns page/sort separately
(`ParsedSearchParams`, `search-params.ts:102-121`).

### 1.3 `NormalizedSearchQuery`

Defined at `src/lib/search/search-query.ts:18-47`. This is the
consumption-layer shape: what list/map/facets services receive. It is a
superset of `FilterCriteria` with geography (`lat`, `lng`, `bounds`),
pagination (`page`, `cursor`), and `sort` rolled into one object.

A query goes through these stages:

```
URL  ──►  parseSearchParams()  ──►  NormalizedSearchFilters (+ page/sort)
URL  ──►  buildRawParamsFromSearchParams()  ──►  normalizeSearchFilters()  ──►  NormalizedSearchQuery (via search-query.ts)
```

The `natural-language-parser.ts` emits the same `NormalizedSearchQuery` shape
so vibe queries and URL-filter queries share one execution path.

### 1.4 Accepted, ignored, and translated URL params

`RawSearchParams` (`src/lib/search-params.ts:67-100`) is the **acceptance**
surface — the set of URL params the parser recognizes. Anything in the URL
that isn't in this list is silently ignored.

Translation rules (applied by `normalizeSearchFilters`):

| Legacy alias | Canonical form | Behavior |
|---|---|---|
| `startDate` | `moveInDate` | Both accepted; canonical form preferred when both are present. |
| `minBudget` | `minPrice` | Both accepted; canonical wins when both provided. |
| `maxBudget` | `maxPrice` | Same as above. |
| `minAvailableSlots` | `minSlots` | URL form is `minSlots`; internal object field remains `minAvailableSlots`. |
| `pageNumber` | `page` | Legacy pagination alias. |
| `cursorStack` | `cursor` | Legacy pagination alias. |
| `where` | `locationLabel` | Legacy URL; still parsed but no hard filter effect. |

Unknown param names (e.g., leftover legacy keys not listed above) are ignored
without error. This is intentional: old shared URLs should still open without
a 400.

---

## 2. Normalized response contract

### 2.1 `SearchResponseMeta`

Defined at `src/lib/search/search-response.ts:10-14`. Every list / map / facet
response carries this envelope so clients can detect backend + version drift:

```ts
interface SearchResponseMeta {
  queryHash: string;           // SHA-based; see §3
  backendSource: "v2" | "v1-fallback" | "map-api";
  responseVersion: string;     // SEARCH_RESPONSE_VERSION constant
}
```

`SEARCH_RESPONSE_VERSION` (`search-response.ts:5-6`) is the current contract
version string. Clients that cache search payloads must invalidate when this
changes. Current value: `"2026-04-15.phase2-public-availability.search-contract-v1"`.

### 2.2 Payloads

`SearchListPayload` (`search-response.ts:16-22`) and `SearchMapPayload`
(`search-response.ts:24-27`) are discriminated under `SearchState`
(`search-response.ts:31-41`) along with error/degraded variants:

- `ok` — normal happy path.
- `location-required` — browse mode without bounds; client must prompt.
- `rate-limited` — with optional `retryAfter`.
- `zero-results` — with optional UI suggestions.
- `degraded` — sourced from v1 fallback or a partial projection; still
  renderable, but clients may surface a warning.

### 2.3 `PublicAvailability` block

Defined at `src/lib/search/public-availability.ts:18-26`. This is the
normalized availability contract referenced from every search surface
(list cards, map markers, detail page, viewer-state).

```ts
interface PublicAvailability {
  availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
  openSlots: number;           // host-managed: openSlots column; legacy: effectiveAvailableSlots
  totalSlots: number;
  availableFrom: string | null;   // YYYY-MM-DD
  availableUntil: string | null;  // YYYY-MM-DD
  minStayMonths: number;
  lastConfirmedAt: string | null; // ISO-8601
}
```

At runtime, v2 list items (`src/lib/search/types.ts:47-64`) pass through
`ResolvedPublicAvailability` (`public-availability.ts:36-42`), which widens
`PublicAvailability` with the `FreshnessReadModel`:

```ts
interface FreshnessReadModel {
  freshnessBucket: "NOT_APPLICABLE" | "UNCONFIRMED" | "NORMAL" | "REMINDER" | "STALE" | "AUTO_PAUSE_DUE";
  searchEligible: boolean;
  staleAt: string | null;
  autoPauseAt: string | null;
  publicStatus: "AVAILABLE" | "FULL" | "CLOSED" | "PAUSED" | "NEEDS_RECONFIRMATION";
}
```

The additional fields are not declared on `SearchV2ListItem.publicAvailability`
(still typed as the narrower `PublicAvailability`) but are present in every
production payload because `transform.ts` threads the resolved object through.
UI consumers (CFM-603) read the resolved fields via a widened
`SlotBadgePublicAvailability` type and treat the freshness fields as optional
for defensive compatibility.

### 2.4 UI semantics — `publicStatus`

| `publicStatus` | Meaning | Where set |
|---|---|---|
| `AVAILABLE` | Listing is publishable and has capacity. | Default path in `resolvePublicStatus` (`public-availability.ts:149-161`). |
| `FULL` | All slots taken; listing still active. | `status=RENTED` + `statusReason=NO_OPEN_SLOTS`. |
| `CLOSED` | Host ended availability before RENTED path. | `status=RENTED` + any other `statusReason`. |
| `PAUSED` | Explicitly paused (host or admin). | `status=PAUSED` (not a freshness auto-pause). |
| `NEEDS_RECONFIRMATION` | Host-managed listing went stale past the reminder window. | `statusReason=STALE_AUTO_PAUSE`. |

`publicStatus` is the single field UI should read for the badge label. Card
surfaces (CFM-603) render freshness labels ("Needs reconfirmation") when
`freshnessBucket` is `STALE` or `AUTO_PAUSE_DUE` regardless of the
`publicStatus` value, because an overdue host-managed listing should not be
marketed as open while awaiting reconfirmation.

### 2.5 Compatibility aliases still emitted

`SearchV2ListItem` (`types.ts:47-64`) keeps the following legacy fields
alongside `publicAvailability` for readers that have not migrated:

| Alias | Canonical source | Removal target |
|---|---|---|
| `availableSlots` | `publicAvailability.openSlots` | After CFM-701 / 702 (all readers migrated). |
| `totalSlots` | `publicAvailability.totalSlots` | Same as above. |
| `availabilitySource` (on `ListingData`) | `publicAvailability.availabilitySource` | Same as above. |

New readers must consume `publicAvailability`. Legacy fields will be dropped
in a later phase once `grep` confirms no remaining consumers.

---

## 3. Query-hash versioning

The query hash is how clients cache search results and how the server detects
"same query different page" vs "query changed, invalidate."

### 3.1 Three version constants

| Constant | File:line | Bumps when |
|---|---|---|
| `SEARCH_QUERY_HASH_VERSION` | `src/lib/search/query-hash.ts:29-30` | The canonical filter shape or normalization changes (e.g., adding a new filter field, changing how `bounds` are quantized). Forces clients to recompute the hash for every cached query. |
| `SEARCH_RESPONSE_VERSION` | `src/lib/search/search-response.ts:5-6` | The response payload shape changes (e.g., adding a field to `PublicAvailability`, renaming `badges`). Forces clients to invalidate cached payloads. |
| `SEARCH_DOC_PROJECTION_VERSION` | `src/lib/search/search-doc-sync.ts` (CFM-405a) | The server-side projection from listing row → search doc changes. Causes every existing doc to be marked `version_skew` and resynchronized on the next cron pass. |

### 3.2 Bump rules

Bump `SEARCH_QUERY_HASH_VERSION` when:

- A new field is added to `HashableSearchQuery` (`query-hash.ts:4-27`).
- An existing field's normalization rule changes (e.g., `moveInDate` goes
  from `YYYY-MM-DD` to full ISO timestamp).
- `BOUNDS_EPSILON` changes, since bounds quantization is part of the hash.

Bump `SEARCH_RESPONSE_VERSION` when:

- A field is added / removed / renamed on `SearchResponseMeta`, a payload,
  or a nested item type like `PublicAvailability`.
- The semantics of an existing field change (e.g., `openSlots` starts
  counting differently).

Bump `SEARCH_DOC_PROJECTION_VERSION` when:

- `writeSearchDocument` in `search-doc-sync.ts` starts writing different
  values for the same source row.
- A new indexed column is added that affects search results.
- The projection function's eligibility filter changes (e.g., starts
  excluding a new status).

### 3.3 Downstream cache-invalidation effects

- Clients key browser caches on `queryHash + responseVersion`. A version bump
  triggers a refetch the next time the user loads the page.
- The server-side dirty-doc cron (CFM-405a's `getProjectionDivergenceReason`
  in `search-doc-sync.ts`) treats
  `doc.projectionVersion < SEARCH_DOC_PROJECTION_VERSION` as a
  `version_skew` divergence and reprojects the doc on its next pass.
- For coordinated bumps (e.g., filter field changes shape AND response shape):
  ship both bumps in the same commit so clients invalidate atomically.

---

## 4. Deprecation map

Legacy URL params accepted at `RawSearchParams` boundary, with planned
removal phases:

| Legacy param | Current behavior | Deprecated | Removal target |
|---|---|---|---|
| `startDate` | Translated to `moveInDate`. | Yes (since CFM-001). | After CFM-604 (SearchForm + FilterModal writes) canonicalizes URL on write. |
| `minBudget` / `maxBudget` | Translated to `minPrice` / `maxPrice`. | Yes. | Same as above. |
| `minAvailableSlots` (URL-side) | Alias of `minSlots`. Internal filter field remains `minAvailableSlots`. | Soft-deprecated. | Keep URL alias indefinitely for link compatibility; normalize on write. |
| `where` | Parsed as `locationLabel`; no hard filter. | Yes. | Can be removed after CFM-603 confirms no UI emits it. |
| `pageNumber` | Alias of `page`. | Yes. | Can be removed when no shared links carry it. |
| `cursorStack` | Alias of `cursor`. | Yes. | Same as above. |

Unknown URL params (including old keys not in this table) are silently
ignored. Old shared URLs parse cleanly and produce a best-effort search.

Removal checklist before dropping any alias:

1. `grep -r "<alias>"` across `src/` to confirm no write path emits it.
2. Add a deprecation warning in `normalizeSearchFilters` (one release).
3. Drop the alias from `RawSearchParams` and the normalizer in the next
   release. Old URLs now produce the default for that filter.

---

## 5. Backward-compat rules

- **Invariant**: every URL that parsed cleanly before a contract bump must
  still parse cleanly after the bump. Result semantics may change, but no
  HTTP error is acceptable.
- **Aliases are write-once**: the `normalizeSearchFilters` path always
  translates aliases to canonical form before returning. Readers never see
  aliases.
- **Unknown params ignored**: `RawSearchParams` is the acceptance whitelist;
  typos and removed fields drop silently.
- **Contract version compat window**: when `SEARCH_RESPONSE_VERSION` bumps,
  the previous version string must keep parsing on the client for one
  release so deploys overlap gracefully.
- **Query-hash stability**: two semantically-equivalent queries must hash to
  the same value. `normalizeHashableSearchQuery` in `query-hash.ts:36-60`
  reuses `normalizeSearchFilters` to enforce this. CFM-403 adds a
  regression test asserting the invariant.

---

## 6. Changelog

Future additions should append here and bump the relevant version constant.

| Date | Version | Change |
|---|---|---|
| 2026-04-15 | `cfm-search-contract-v1` | Initial contract — CFM-002 documents existing implementation. `SEARCH_QUERY_HASH_VERSION = "2026-04-15.cfm-search-contract-v1"`, `SEARCH_RESPONSE_VERSION = "2026-04-15.phase2-public-availability.search-contract-v1"`, `SEARCH_DOC_PROJECTION_VERSION = 1`. |

---

## 7. Related docs

- `docs/plans/cfm-migration-plan.md` — full migration plan. CFM-002 section
  at line ~258.
- `docs/host-managed-patch-contract.md` — writer counterpart: the
  authoritative contract for `PATCH /api/listings/:id` on host-managed
  listings (CFM-302).
- `.claude/CLAUDE.md` — project-wide operating rules (architecture
  boundaries, reliability rules).
- Source-of-truth types: `src/lib/search-params.ts`,
  `src/lib/search-types.ts`, `src/lib/search/search-query.ts`,
  `src/lib/search/search-response.ts`,
  `src/lib/search/public-availability.ts`, `src/lib/search/query-hash.ts`,
  `src/lib/search/types.ts`, `src/lib/search/transform.ts`.
