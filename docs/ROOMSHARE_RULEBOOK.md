# Roomshare Rulebook

- **Status:** Proposal and canonical target model
- **Product model:** Contact-first room-sharing marketplace
- **Release posture:** NotReady until open P1 release blockers are cleared
- **Last reviewed against repo:** 2026-05-29

This rulebook is the project-specific operating model for Roomshare v1. It
supersedes booking-first state-machine thinking for public discovery, listing
availability, Contact Host, Phone Reveal, payments, and recovery work.

It is also an implementation guide, not proof that every rule is already fully
implemented. Sections marked `UNKNOWN`, `Small Change`, or `Migration Required`
must be verified or implemented before they are used as release evidence.

## Fit Labels

| Label | Meaning |
| --- | --- |
| Immediate | Fits the current schema and known implementation. Can be enforced through existing fields, helpers, tests, jobs, or config. |
| Small Change | No Prisma schema/state-machine migration expected, but likely needs centralized code, tests, flags, logs, admin UI, cron, or CI additions. |
| Migration Required | Requires new enum values, columns, tables, durable job states, or formal state-machine persistence. |
| UNKNOWN | Not confirmed in the repo. Verify before claiming it exists. |

## Verified Repo Baseline

These facts were verified locally before this rulebook was added.

| Area | Current repo evidence | Rulebook implication |
| --- | --- | --- |
| Listing state | `Listing.status` is `ACTIVE`, `PAUSED`, `RENTED`; `statusReason` is a string field. | Do not design v1 around `DRAFT`, `ARCHIVED`, or `NEEDS_CONFIRMATION` without a migration. |
| Contact-first fields | `Listing` has `openSlots`, `moveInDate`, `availableUntil`, `minStayMonths`, `lastConfirmedAt`, `physicalUnitId`. | Public eligibility should be derived, not read from `status` alone. |
| Public availability | `src/lib/search/public-availability.ts` defines 14/21/30 day freshness buckets and host-managed availability validity. | Freshness is part of public search/contact eligibility. |
| Public visibility/contact | `resolvePublicListingVisibilityState` and `evaluateListingContactable` exist. | Central rules exist, but their current result shape is less granular than this target rulebook. |
| Public payload sanitizer | `toPublicSearchListing` and `toPublicMapListing` sanitize search/map payloads and coarsen coordinates. | Public payload privacy is already a first-class release gate. |
| Contact attempts | `ContactAttempt` exists with idempotency on `userId + clientIdempotencyKey + contactKind`; metadata rejects obvious PII-like keys. | Contact attempts are the audit trail for contact/reveal attempts. |
| Contact ledger | `ContactConsumption` is unique by `userId + unitId + unitIdentityEpoch + contactKind`. | Credits and paid unlocks must be ledger-backed and idempotent. |
| Phone reveal | `HostContactChannel` and `PhoneRevealAudit` exist; `/api/phone-reveal` is POST-only and CSRF-protected. | Phone Reveal is separate from Message Start. |
| Search V2 | `/api/search/v2` returns list/map data with `queryHash` and optional snapshot/projection metadata. | Search V2 should remain the canonical list/map response path. |
| Release state | `docs/review/review_ledger.md` records `NotReady` with 3 open P1s. | Do not claim production readiness until release gates pass or are formally triaged. |

## Current Implementation Differences

These are deliberate corrections to the uploaded report before making it a
repo-specific rulebook.

1. `docs/ROOMSHARE_RULEBOOK.md` did not exist before this change.
2. `docs/STATE_MACHINES.md` was still booking-first and must be treated as
   legacy/drain-only for v1 public flows.
3. `getListingPublicSearchabilityDecision()` and
   `getListingContactabilityDecision()` are target names/contracts, not current
   function names. Current helpers are `resolvePublicAvailability`,
   `resolvePublicListingVisibilityState`, and `evaluateListingContactable`.
4. Phone Reveal currently decrypts the phone after host-phone availability is
   confirmed and before entitlement consumption. The target policy in this
   rulebook is stricter: return a phone only after all checks and entitlement
   consumption. If the order changes, update code and tests together.
5. `/api/search/v2` is the canonical list/map model, but compatibility routes
   still exist. Every public search/list/map route must share the same public
   eligibility and sanitizer until legacy routes are retired.
6. `statusReason` values are policy strings, not schema enum values.
7. Broken-image checker, orphan-upload cleaner, and legacy-booking-isolation
   checks are desired hardening work unless verified otherwise.

## Executive Verdict

Roomshare v1 is a contact-first trust marketplace, not primarily a booking
inventory product. The biggest failures are stale availability, inconsistent
search/map/list/detail/contact behavior, host spam, privacy leakage, fake or bad
listings, broken images/geocoding/search projections, duplicate retries, and
legacy booking state leaking into the v1 contact model.

The correct operating model is:

> Rules decide what is allowed. Limits control abuse and cost. Fallbacks protect
> user experience when something fails. Recovery jobs repair partial failures.

## Immediate Adoption Rules

| Rule | Why |
| --- | --- |
| Central public visibility decision | Search, map, list, detail, cache, saved search, and alerts need the same eligibility model. |
| Central contactability decision | Contact Host, Phone Reveal, checkout, and message send must not drift. |
| Central public payload sanitizer | Public payloads must never expose private address, exact coordinates, phone, email, private moderation reason, or raw grouping keys. |
| Use current listing state model | Current schema is `ACTIVE`, `PAUSED`, `RENTED` plus `statusReason`; new lifecycle states require migrations. |
| Stale listings are not normal search/contact candidates | Freshness is already part of host-managed public availability. |
| Legacy booking is drain-only | Booking state must not control contact-first public availability. |
| Search V2 is canonical for list/map | List and map should represent the same query snapshot. |
| Phone Reveal is separate from Message Start | Phone is higher privacy risk and has separate audit/entitlement behavior. |
| Contact/reveal/payment/job idempotency is mandatory | Prevent duplicate conversations, credits, grants, refunds, and job side effects. |
| Release gates block production readiness | Current release posture is NotReady. |

## Canonical Entities

| Entity | Responsibility | Fit |
| --- | --- | --- |
| `Listing` | Source object for public visibility and contactability. | Immediate |
| `PhysicalUnit` / `physicalUnitId` | Prevent stale listing/detail pages from contacting a changed unit. | Immediate |
| `User` | Guest/host suspension, verification, ownership, admin, and block checks. | Immediate |
| `ContactAttempt` | Audit every contact/reveal attempt without storing PII in metadata. | Immediate |
| `Conversation` | Durable guest-host communication channel. | Immediate |
| `ContactConsumption` | Authoritative credit/payment consumption ledger. | Immediate |
| `HostContactChannel` | Encrypted, verified, host-controlled phone reveal source. | Immediate |
| `PhoneRevealAudit` | Audit `REVEALED`, `DENIED`, `UNAVAILABLE`, and `ERROR` outcomes. | Immediate |
| Search V2 projection | Canonical public discovery response and projection metadata. | Immediate |
| Supabase listing images | Store listing images safely and prevent foreign URL attachment. | Immediate |
| Stripe session/webhook | Grant paid entitlements only from verified server-side payment state. | Immediate |
| Admin/moderation surface | Remove risky listings/users from public/actionable flows. | Immediate / Small Change |
| Recovery jobs | Repair stale, dirty, partial, delayed, or inconsistent system state. | Small Change |

## Listing Visibility Model

`Listing.status` alone is not the public state. The public state is derived from
status, status reason, host state, slots, dates, freshness, location, image, and
privacy checks.

| Derived state | Current fields / conditions | Search | Detail | Contact | Phone Reveal | Fit |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `PUBLIC_SEARCHABLE` | `ACTIVE`, allowed reason, fresh, valid slots/dates/location/images, active owner. | Yes | Yes | Yes | Yes, if phone checks pass | Immediate |
| `UNCONFIRMED` | `lastConfirmedAt = null`. | No | Limited | No | No | Small Change |
| `STALE_HIDDEN` | `lastConfirmedAt` older than stale threshold, currently 21 days. | No | Limited stale notice | No | No | Immediate |
| `AUTO_PAUSE_DUE` | `lastConfirmedAt` older than auto-pause threshold, currently 30 days. | No | Limited stale notice | No | No | Immediate |
| `AUTO_PAUSED_STALE` | `PAUSED + STALE_AUTO_PAUSE`. | No | Limited unavailable | No | No | Immediate |
| `HOST_PAUSED` | `PAUSED + HOST_PAUSED`. | No | Limited unavailable | No | No | Immediate |
| `ADMIN_LOCKED` | `ADMIN_PAUSED` or `SUPPRESSED`. | No | Generic unavailable or 404 | No | No | Immediate |
| `MIGRATION_REVIEW_LOCKED` | `MIGRATION_REVIEW`. | No | Generic unavailable or 404 | No | No | Immediate |
| `RENTED` | `status = RENTED`. | No | Generic unavailable | No | No | Immediate |
| `DATA_INVALID` | Bad slots, dates, public location, coordinates, images, or totals. | No | Limited/unavailable | No | No | Immediate / Small Change |

### Required Listing Transitions

| Event | From | To | Required behavior |
| --- | --- | --- | --- |
| Host creates listing | N/A | `ACTIVE` today | Listing must still pass derived visibility before public exposure. |
| Host pauses | `ACTIVE` | `PAUSED + HOST_PAUSED` | Remove from search/contact/reveal. |
| Host confirms freshness | stale/unconfirmed `ACTIVE` | `ACTIVE`, update `lastConfirmedAt` | Re-enter public search only if all other checks pass. |
| Freshness reminder | `ACTIVE`, age >= 14 days | No status change | Notify host; do not expose reminder state publicly. |
| Stale threshold | `ACTIVE`, age >= 21 days | Derived `STALE_HIDDEN` | Exclude from normal search/contact. |
| Auto-pause | `ACTIVE`, age >= 30 days | `PAUSED + STALE_AUTO_PAUSE` | Job-driven durable pause. |
| Admin suppresses | Any | moderation lock | Public/actionable flows blocked. |
| Host marks rented | `ACTIVE` or `PAUSED` | `RENTED` | Public/actionable flows blocked. |
| Migration review | Any | `statusReason = MIGRATION_REVIEW` | Public/actionable flows blocked until reviewed. |

### Future Listing Migration Path

Do not implement these states without an explicit migration plan:

| Future state | Why add it | Migration required |
| --- | --- | --- |
| `DRAFT` | Prevent incomplete listings from becoming `ACTIVE`. | Yes |
| `NEEDS_CONFIRMATION` | Make stale/unconfirmed state explicit. | Yes |
| `ARCHIVED` | Separate old/rented/deleted inventory. | Yes |
| `PENDING_REVIEW` | Image/listing moderation lifecycle. | Yes or moderation table |
| `REJECTED` | Moderation decision lifecycle. | Yes or moderation table |

## Public Visibility Decision Contract

The current repo has central helpers, but the target contract should eventually
return a decision object instead of a bare boolean.

```ts
type PublicSearchabilityCode =
  | "PUBLIC_SEARCHABLE"
  | "STATUS_NOT_ACTIVE"
  | "MIGRATION_REVIEW"
  | "ADMIN_PAUSED"
  | "SUPPRESSED"
  | "OWNER_SUSPENDED"
  | "NO_OPEN_SLOTS"
  | "INVALID_SLOT_COUNTS"
  | "MISSING_MOVE_IN_DATE"
  | "AVAILABLE_UNTIL_EXPIRED"
  | "AVAILABLE_UNTIL_BEFORE_MOVE_IN"
  | "MIN_STAY_INVALID"
  | "UNCONFIRMED"
  | "LISTING_STALE"
  | "AUTO_PAUSE_DUE"
  | "MISSING_PUBLIC_LOCATION"
  | "INVALID_PUBLIC_COORDINATES"
  | "PUBLIC_COORDINATES_NOT_COARSENED"
  | "NO_VALID_IMAGES"
  | "UNKNOWN_DATA_INVALID";

type PublicSearchabilityDecision = {
  ok: boolean;
  code: PublicSearchabilityCode;
  publicReason?: string;
  internalReason?: string;
  fit: "Immediate" | "Small Change" | "Migration Required";
};
```

Target function names:

- `getListingPublicSearchabilityDecision()`
- `getListingContactabilityDecision()`
- `sanitizePublicListingPayload()`
- `assertNoPrivatePublicPayloadFields()`

Current function names:

- `resolvePublicAvailability()`
- `resolvePublicListingVisibilityState()`
- `evaluateListingContactable()`
- `toPublicSearchListing()`
- `toPublicMapListing()`

## Contact Host State Machine

```txt
START
  -> Validate input
  -> Require logged-in user
  -> Require non-suspended guest
  -> Require verified email
  -> Rate-limit early
  -> Load listing
  -> Compute listing contactability
  -> Reject owner self-contact
  -> Check host not suspended
  -> Check unitIdentityEpoch if provided
  -> Check block relation
  -> Check spam/contact policy
  -> Check entitlement/contact credit if paywall enabled
  -> Open serializable transaction
  -> Acquire advisory duplicate-conversation lock
  -> Reuse/resurrect existing conversation OR create new conversation
  -> Consume entitlement before new conversation creation
  -> Record contact attempt
  -> Return stable response
END
```

Terminal success states:

| State | Meaning |
| --- | --- |
| `CONVERSATION_REUSED` | Existing guest-host/listing conversation returned. |
| `CONVERSATION_RESURRECTED` | Previously user-deleted conversation restored. |
| `CONVERSATION_CREATED` | New conversation created after checks and entitlement consumption. |

Terminal failure states:

| State | User result |
| --- | --- |
| `AUTH_REQUIRED` | Ask user to log in. |
| `EMAIL_UNVERIFIED` | Ask user to verify email. |
| `USER_SUSPENDED` | Block action. |
| `LISTING_UNAVAILABLE` | Generic unavailable message. |
| `LISTING_STALE` | Host must reconfirm. |
| `OWNER_VIEW` | Owner cannot contact own listing. |
| `BLOCKED_RELATION` | Generic blocked-safe message. |
| `PAYWALL_REQUIRED` | Show pack/pass purchase. |
| `RATE_LIMITED` | Ask user to try later. |
| `DUPLICATE_RETRY_SAFE` | Return stable prior result. |

## Phone Reveal State Machine

```txt
POST /api/phone-reveal
  -> CSRF check
  -> Require auth
  -> Rate limit
  -> Guest suspension check
  -> Email verification check
  -> Validate listingId/clientIdempotencyKey/unitIdentityEpochObserved
  -> Compute listing contactability
  -> Reject owner reveal
  -> Check unit epoch
  -> Check host not suspended
  -> Check block relation
  -> Require host verified phone
  -> Require host reveal-enabled
  -> Consume REVEAL_PHONE entitlement
  -> Decrypt phone server-side
  -> Audit REVEALED / DENIED / UNAVAILABLE / ERROR
  -> Return phoneNumber only on success
```

Hard rule:

> The phone number must never appear in public listing payloads, public search
> payloads, public cache, Sentry breadcrumbs, ordinary server logs, client logs,
> analytics events, or contact attempt metadata.

Current implementation note: the repo currently verifies/decrypts phone
availability before entitlement consumption. If the target order above is
adopted, update `src/lib/contact/phone-reveal.ts` and its tests in the same
slice.

## Search/List/Map State Model

```txt
User changes search/filter/map viewport
  -> Validate input
  -> Reject unbounded or oversized search
  -> Validate/cap map bounds
  -> Call /api/search/v2 or a compatibility route that shares the same rules
  -> Receive list + map + queryHash + optional querySnapshotId/projection metadata
  -> Drop stale response if it no longer matches current query
  -> Apply list and map together
  -> Keep previous safe results during stale-while-revalidate loading
  -> On failure, show fallback without wiping safe previous state
```

Canonical states:

| State | Meaning |
| --- | --- |
| `IDLE` | No active request. |
| `QUERY_PENDING` | User changed query/filter/bounds. |
| `LOADING_WITH_PREVIOUS_RESULTS` | Stale-while-revalidate map/list behavior. |
| `FRESH_RESULTS` | Current query and projection/version metadata match UI state. |
| `STALE_RESPONSE_DROPPED` | Old response ignored because a newer query exists. |
| `EMPTY_RESULTS` | Valid query but no available listings. |
| `QUERY_REJECTED` | Unbounded, oversized, or invalid query. |
| `SEARCH_ERROR` | API/projection/cache failure. |

## Payments and Contact Entitlements

```txt
Free contacts available
  OR user selects CONTACT_PACK_3 / MOVERS_PASS_30D
  -> Stripe checkout/session created
  -> Frontend redirect occurs
  -> Server waits for verified Stripe webhook/payment state
  -> Entitlement grant/ledger state created
  -> Contact/reveal consumes entitlement through server transaction
  -> Duplicate webhook is idempotent
  -> Failed/duplicate/refund states handled by recovery jobs
```

Rules:

| Rule | Fit |
| --- | --- |
| Frontend redirect never grants entitlement by itself. | Immediate |
| Verified Stripe webhook/server state is the source of truth. | Immediate |
| Contact/reveal consumption must be ledger-based. | Immediate |
| Duplicate webhooks must not duplicate credits. | Immediate |
| Payment succeeds but entitlement pending must show a pending fallback. | Small Change |

Current known product defaults:

| Area | Current value |
| --- | --- |
| Free message starts | 2 `MESSAGE_START` contacts |
| Contact pack | `CONTACT_PACK_3` |
| Mover pass | `MOVERS_PASS_30D` |
| Phone reveal kind | `REVEAL_PHONE` |

## Images and Uploads

Current model:

```txt
Client selects image
  -> Validate count <= 10
  -> Validate size <= 5MB
  -> Validate MIME: JPEG, PNG, WebP, GIF
  -> Upload to Supabase
  -> Server validates storage behavior and listing image URLs
  -> Attach to listing images[]
  -> Listing can become public only if at least 1 valid image remains
```

Desired hardening:

| Missing/weak state | Risk | Fit |
| --- | --- | --- |
| `UPLOADED_UNATTACHED` sweeper | Orphan Supabase files accumulate. | Small Change |
| Broken image checker | Listing shows dead images. | Small Change |
| Image moderation approval | Unsafe/spam images can appear. | Migration Required if persisted formally |
| Image processing state | GIFs/large files may be expensive or poor UX. | Small Change / Migration Required |

## Moderation and Admin Locks

Current-schema moderation uses `statusReason`.

| Moderation state | Current representation | Public behavior |
| --- | --- | --- |
| `NORMAL` | `statusReason` not in blocking list | Eligible if all other checks pass |
| `MIGRATION_REVIEW` | `statusReason = MIGRATION_REVIEW` | Hidden/action-blocked |
| `ADMIN_PAUSED` | `statusReason = ADMIN_PAUSED` | Hidden/action-blocked |
| `SUPPRESSED` | `statusReason = SUPPRESSED` | Hidden/action-blocked |
| `HOST_PAUSED` | `PAUSED + HOST_PAUSED` | Hidden/action-blocked |
| Review queue | UNKNOWN if fully modeled | Verify in repo |

Moderation reasons should not leak to public users. Public errors collapse to
generic unavailable states unless the viewer is authorized to know the reason.

## Recovery Job Model

Every recovery job should follow this model:

```txt
DISCOVER
  -> CLAIM with lease/advisory lock
  -> PROCESS idempotently
  -> WRITE durable result
  -> EMIT metric
  -> RETRY with backoff if temporary failure
  -> DLQ if repeated failure
```

Canonical job item states:

| State | Meaning |
| --- | --- |
| `PENDING` | Work discovered but not claimed. |
| `IN_PROGRESS` | Claimed with lease. |
| `SUCCEEDED` | Completed idempotently. |
| `RETRYABLE_FAILED` | Temporary failure; can retry. |
| `DLQ` | Repeated failure; needs manual review. |
| `SKIPPED_SAFE` | Skipped due to safety guard. |

Recovery jobs:

| Job | Purpose | Current fit |
| --- | --- | --- |
| `stale-auto-pause` | Move 30-day stale listings to `PAUSED + STALE_AUTO_PAUSE`. | Existing / verify release status |
| `freshness-reminders` | Remind hosts before stale. | Existing / verify release status |
| `search-doc refresh/rebuilder` | Rebuild public projection from dirty listings. | Existing |
| `outbox-drain` | Send queued events with retry/DLQ. | Existing |
| `contact-restoration` | Repair partial contact/conversation/ledger states. | Existing |
| `refund queue` | Process refunds idempotently. | Existing |
| `cleanup-idempotency-keys` | Remove old idempotency rows after retention. | Existing |
| `cleanup-rate-limits` | Remove expired rate-limit counters. | Existing |
| `cleanup-typing-status` | Remove stale typing state. | Existing |
| `embeddings maintenance` | Refresh embeddings for changed content. | Existing |
| `search-alerts` | Notify saved-search users about public-eligible listings. | Existing |
| `broken-image-checker` | Detect dead listing images. | Desired |
| `orphan-upload-cleaner` | Remove unattached Supabase uploads after a grace window. | Desired |
| `public-payload privacy scanner/capture` | Detect private fields in public payloads/projections/cache. | Scanner exists; capture wrapper is follow-up |
| `legacy-booking-isolation-check` | Ensure legacy booking cannot control contact-first flows. | Desired |

## Canonical Invariants

Treat `P0` items as release-blocking unless there is explicit accepted-risk
documentation in `docs/review`.

1. P0 - Public search payloads never expose exact address, phone, email, or exact coordinates.
2. P0 - Public listing detail never exposes phone, email, exact address, or exact coordinates.
3. P0 - Phone Reveal is the only path that can return a host phone number.
4. P0 - Phone Reveal requires POST, CSRF, auth, verified email, non-suspended guest, contactable listing, non-owner viewer, non-suspended host, unblocked relation, verified/reveal-enabled host phone, entitlement handling, and audit.
5. P0 - Non-`ACTIVE` listings cannot be newly contacted.
6. P0 - `MIGRATION_REVIEW`, `ADMIN_PAUSED`, and `SUPPRESSED` listings cannot be publicly searched, contacted, or phone-revealed.
7. P0 - Stale listings cannot be contacted without reconfirmation or explicit safe handling.
8. P0 - `RENTED` listings cannot be newly contacted or phone-revealed.
9. P0 - `openSlots` must exist, be greater than 0, and be less than or equal to `totalSlots` for public search/contact.
10. P0 - `totalSlots` must be at least 1 for public search/contact.
11. P0 - `moveInDate` must exist for public search/contact.
12. P0 - `availableUntil`, when present, must not be expired and must be greater than or equal to `moveInDate`.
13. P0 - `minStayMonths` must be at least 1.
14. P0 - Owner-suspended listings disappear from public/actionable flows.
15. P0 - Guest-suspended users cannot contact hosts or reveal phone numbers.
16. P0 - Blocked user relationships prevent contact and reveal.
17. P0 - A user cannot contact their own listing or reveal their own listing phone.
18. P0 - Contact Host is idempotent by client key and duplicate-conversation locking.
19. P0 - Phone Reveal is idempotent by client key and entitlement ledger behavior.
20. P0 - Payment/contact credit is ledger/webhook based, not frontend-redirect based.
21. P0 - Duplicate Stripe webhooks cannot grant duplicate entitlements.
22. P0 - Contact attempt metadata rejects obvious PII-like keys.
23. P0 - Search/list/map/detail/contact must use the same visibility/contactability rules.
24. P0 - Search V2 list and map data must represent the same query snapshot.
25. P0 - Old search responses cannot overwrite newer map/list state.
26. P0 - Legacy booking data must not control contact-first availability.
27. P1 - Stale auto-pause must eventually move 30-day stale host-managed listings to `PAUSED + STALE_AUTO_PAUSE`.
28. P1 - Freshness reminders must fire before stale/auto-pause thresholds.
29. P1 - Search projection rebuild must eventually reflect listing changes.
30. P1 - Broken or orphaned images must be detected and repaired/cleaned.
31. P1 - Service worker/public cache must not serve older private or stale public payloads after version mismatch.
32. P1 - Admin/moderation actions require reasoned audit records.

## Limits Matrix

| Area | Current known value | Recommended v1 default | Fit |
| --- | ---: | ---: | --- |
| Search page size | UNKNOWN | 20 default, 50 max | Small Change if missing |
| Search result hard cap | UNKNOWN | 500 max returned IDs per query | Small Change |
| Map marker cap | Cap exists, value UNKNOWN | 500 desktop, 250 mobile | Small Change |
| Map bounds max | Bounds validation exists, value UNKNOWN | Reject oversized boxes | Immediate / Small Change |
| Map fetch debounce | UNKNOWN | 300-500ms | Small Change |
| Free message contacts | 2 `MESSAGE_START` | Keep 2 | Immediate |
| Contact pack | `CONTACT_PACK_3` | Keep pack of 3 | Immediate |
| Mover pass | `MOVERS_PASS_30D` | Keep 30-day pass | Immediate |
| Chat/contact start rate | 20/hour | Keep hard cap; add risk soft cap | Small Change |
| Chat send rate | 100/hour | Keep hard cap; add risk soft cap | Small Change |
| Phone reveal rate | 10/hour | Keep hard cap; add stricter daily soft caps | Small Change |
| Listing images | 10 max | Keep 10 | Immediate |
| Minimum listing images | At least 1 | Keep 1; add broken-image checks | Immediate / Small Change |
| Image upload size | 5MB | Keep 5MB | Immediate |
| Image MIME types | JPEG, PNG, WebP, GIF | Keep; revisit animated GIF policy later | Immediate |
| Auth/login/reset limits | Partially known in `RATE_LIMITS` | Verify against policy | Small Change |
| Geocoding calls | UNKNOWN | Add account/IP/listing caps | Small Change |
| Job batch size | Varies by job | 100-500 records depending on job | Small Change |

## Fallback Matrix

| Failure case | User fallback | Server/system behavior | Recovery |
| --- | --- | --- | --- |
| Search API failure | Keep previous safe results if compatible. | Do not wipe map/list to misleading empty state. | Sentry + search health check. |
| Map failure | List-only browsing with map unavailable state. | Do not block browsing if list works. | Map retry/error metrics. |
| Stale listing while viewing | Disable Contact Host and Phone Reveal. | Server denies contact/reveal. | Freshness reminder + auto-pause. |
| Contact Host failure | Safe code-specific message. | No new conversation or credit consumption unless prior idempotent success exists. | Contact restoration. |
| Phone unavailable | Message host instead. | No phone decrypted/returned. Audit unavailable/denied. | Host phone verification/reveal setting. |
| Upload failure | Preserve form, show failed file, allow retry. | Do not attach unsafe/foreign image URLs. | Orphan upload cleaner. |
| Geocoding failure | Host retries/edits address; listing stays hidden until safe public location exists. | Do not expose exact location. | Geocode repair/backoff. |
| Payment succeeds but entitlement pending | Show pending activation. | Do not grant from redirect alone. | Webhook replay/reconciliation. |
| Search projection stale | Show previous safe projection or unavailable state. | Compare version/snapshot. | Requeue dirty listing. |
| Public cache stale | Refresh/invalidate stale cache. | Version/hash guard prevents old payload overwrite. | Cache purge/version bump. |
| Suspended/deleted listing | Generic unavailable. | Collapse details to avoid enumeration. | Admin restore if mistake. |
| Broken listing image | Placeholder or hidden image. | Do not expose private storage errors. | Broken-image checker. |
| Legacy booking conflict | Contact-first rule decides availability. | Ignore booking state for public contact flow. | Legacy isolation check. |

## Production Test Plan

Minimum release-blocking coverage:

| Test area | Required examples |
| --- | --- |
| Public visibility unit tests | Valid active listing, paused/rented, blocking statusReason, invalid slots/dates, stale, auto-pause due, null `lastConfirmedAt`. |
| Payload privacy tests | Search/list/map/detail payloads contain no phone/email/exact address/exact coordinates/private moderation reason. |
| Search API tests | V2 list/map same query hash/snapshot, rejects unbounded/oversized search, old responses dropped. |
| Contact Host tests | Auth, email, suspension, owner, stale/inactive/suppressed, blocked relation, paywall, idempotent duplicate. |
| Phone Reveal tests | POST/CSRF/auth, verified/reveal-enabled phone, no owner reveal, correct `REVEAL_PHONE` consumption, audit, no leak. |
| Payment webhook tests | Redirect does not grant; verified webhook grants once; duplicate webhook safe; invalid signature rejected. |
| Recovery job tests | Auto-pause idempotent, reminders once per window, projection privacy safe, outbox retry/DLQ, orphan/broken image hardening when added. |
| Legacy booking isolation tests | Booking state cannot make invalid listing searchable or hide a valid contact-first listing. |
| E2E tests | Search/detail/contact happy path, stale listing disables contact, rapid filter list/map sync, payment pending fallback, phone unavailable fallback. |

## Release Gates

Do not claim production readiness until these are passing or formally triaged in
`docs/review/review_ledger.md`.

| Gate | Required result |
| --- | --- |
| Jest baseline | Passing. |
| Dependency audit | No open release-blocking vulnerabilities. |
| E2E smoke | Passing without timeout. |
| Search/list/map sync tests | Passing. |
| Contact Host E2E/API tests | Passing. |
| Phone Reveal privacy/API tests | Passing. |
| Payment webhook tests | Passing. |
| Public payload privacy tests | Passing. |
| Legacy booking isolation tests | Passing or explicitly scoped as a follow-up before release. |

## Implementation Order

### Phase 1 - Adopt the Rulebook

- Add this file as `docs/ROOMSHARE_RULEBOOK.md`.
- Add a legacy warning to `docs/STATE_MACHINES.md`.
- Link future public availability/contact work to this file.

### Phase 2 - Centralize / Verify Rule Functions

- Introduce or adapt target decision-object contracts.
- Ensure search, map, detail, contact, reveal, checkout, cache, and alerts use
  the same rules.
- Add decision-code tests for status, statusReason, slots, dates, freshness,
  owner suspension, and public payload privacy.

### Phase 3 - Privacy and Public Payload Gates

- Expand public payload snapshot tests.
- Add coordinate precision tests.
- Keep scanner/capture release gates current.
- Verify Sentry/log redaction around contact/reveal errors.

### Phase 4 - Contact / Phone / Paywall Hardening

- Align Contact Host and Phone Reveal decision contracts.
- Resolve the Phone Reveal entitlement/decrypt order policy.
- Expand idempotency, owner/block/suspension, and pending-entitlement tests.

### Phase 5 - Recovery Jobs

- Review existing jobs for leases, idempotency, metrics, retry, and DLQ.
- Add broken-image checker.
- Add orphan-upload cleaner.
- Add public-payload privacy capture wrapper.
- Add legacy-booking-isolation check.

### Phase 6 - E2E and Release Gates

- Stabilize Jest baseline.
- Clear or triage dependency audit.
- Fix E2E smoke timeout.
- Run search/contact/phone/payment/privacy/legacy gates.

### Phase 7 - Optional Schema / State Migration

Only after current-schema hardening is stable:

- Add `DRAFT`.
- Add `NEEDS_CONFIRMATION`.
- Add `ARCHIVED`.
- Add image moderation lifecycle.
- Add formal moderation/reporting tables if missing.

Migration safety requirements:

1. Add new states in backward-compatible code.
2. Backfill existing listings.
3. Add dual-read/dual-write if needed.
4. Verify public visibility does not change unexpectedly.
5. Run privacy and legacy-isolation tests.
6. Add rollback plan before deploy.

## UNKNOWNs Needing Verification

| Item | Status |
| --- | --- |
| Actual search page size | UNKNOWN |
| Actual map marker cap value | UNKNOWN |
| Actual map debounce/hysteresis values | UNKNOWN |
| Actual geocoding rate limits | UNKNOWN |
| Actual admin audit completeness | UNKNOWN |
| Whether moderation/report queues are complete | UNKNOWN |
| Whether host phone verification UX is complete | UNKNOWN |
| Whether all recovery jobs have leases, metrics, and DLQ behavior | UNKNOWN |
| Whether all legacy search/list/map routes are fully aligned with Search V2 | UNKNOWN |
| Whether public cache/service worker invalidation is strong enough | UNKNOWN |
| How many current `ACTIVE` listings have `lastConfirmedAt = null` | UNKNOWN |
| Whether any `ACTIVE` listings carry host/admin/stale status reasons due to bugs or migrations | UNKNOWN |
| Whether legacy booking routes are publicly reachable in production | UNKNOWN |

## Final Rulebook Principle

> A listing is not contactable because it appears on a page. A listing is
> contactable only when the central server-side contactability decision says it
> is contactable at the moment of action.

That rule prevents most high-risk Roomshare failures: stale availability,
search/detail/contact mismatch, privacy leakage, duplicate retries, paywall
bypass, host spam, and legacy booking interference.
