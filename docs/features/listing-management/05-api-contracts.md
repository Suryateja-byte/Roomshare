# 05 API Contracts

## `POST /api/listings`

| Contract item | Current behavior | Evidence |
| --- | --- | --- |
| Request auth/security | Requires CSRF pass, IP and per-user create rate limits, authenticated session, non-suspended account, verified email, existing user, and profile completion threshold. | LM-E005 |
| Request body | Validates with `createListingApiSchema`, including core listing fields, 1-10 image URLs, listing enum fields, languages, move-in date, and booking mode. | LM-E006, LM-E016 |
| Content policy | Checks title and description with listing language compliance and maps violations to field errors. | LM-E006 |
| Address | Geocodes address, returns 400 for not found and 503 with `Retry-After` for provider/service errors. | LM-E006 |
| Images | Rejects image URLs that do not belong under `listings/{userId}/`. | LM-E006 |
| Transaction | Uses a per-user advisory lock, enforces max 10 active/paused listings, detects collision candidates, writes listing/location/PostGIS, syncs canonical availability, and marks listing dirty. | LM-E007 |
| Idempotency | Accepts valid `X-Idempotency-Key`, wraps the transaction in `withIdempotency`, rejects invalid key format, and sets `X-Idempotency-Replayed` on cached success. | LM-E007 |
| Success | Returns `{ id }` with status 201 and `Cache-Control: no-store`. | LM-E007 |

## `PATCH /api/listings/[id]`

| Contract item | Current behavior | Evidence |
| --- | --- | --- |
| Shared gates | Requires CSRF, update rate limits, auth, non-suspended user, verified email, JSON payload, and listing ownership. | LM-E011 |
| Host-managed availability body | Detects availability patch shape, validates date-only fields, validates schema, row-locks listing, checks moderation lock, checks expected version, validates date order/past dates, updates slots/status/dates/min stay, syncs canonical availability, and marks dirty. | LM-E011 |
| Retired availability keys | Rejects retired availability fields with `HOST_MANAGED_WRITE_PATH_REQUIRED`. | LM-E012 |
| Profile body | Validates profile schema, languages, image ownership, title/description language policy, geocodes address changes, validates amenities/rules, row-locks listing, checks moderation lock and expected version, updates listing/location, marks dirty, and syncs canonical availability. | LM-E012 |
| Removed images | Computes removed image URLs and attempts storage deletion outside the transaction. | LM-E012 |
| Success | Returns the updated listing JSON with status 200. | LM-E012 |

## `DELETE /api/listings/[id]`

| Contract item | Current behavior | Evidence |
| --- | --- | --- |
| Request gates | Requires CSRF, delete rate limits, authenticated user, and either password confirmation or recent OAuth session. | LM-E013 |
| Ownership and write mode | Row-locks the listing and returns 404 for missing/non-owned listings. | LM-E013 |
| Reported listing | If reports exist, pauses the listing with `statusReason: "SUPPRESSED"`, increments version, marks dirty, and syncs lifecycle projection. | LM-E013 |
| Unreported listing | Tombstones canonical inventory and deletes the listing. | LM-E013 |
| Storage cleanup | Deletes listing images from Supabase storage best effort only after a hard delete. | LM-E013 |
| Success | Returns `{ success: true, notifiedTenants: 0 }` with status 200. | LM-E013 |

## `GET /api/listings/[id]/can-delete`

| Contract item | Current behavior | Evidence |
| --- | --- | --- |
| Request gates | Applies rate limit and requires authenticated owner. | LM-E014 |
| Response | Returns `canDelete: true`, `activeBookings: 0`, `pendingBookings: 0`, and `activeConversations`. | LM-E014 |

## `updateListingStatus`

| Contract item | Current behavior | Evidence |
| --- | --- | --- |
| Request gates | Validates listing ID, status, expected version, auth, and suspension. | LM-E015 |
| Transaction | Row-locks listing, checks owner, checks moderation lock and expected version, blocks freshness recovery reopen, updates status/reason/version, marks dirty, and syncs lifecycle. | LM-E015 |
| Success side effect | Revalidates listing detail, profile, and search paths. | LM-E015 |

Direct API route-handler/security tests passed for core status/header/security behavior; live Next server/curl checks for mutation cache/header behavior and route-level CSRF rejection were not run in this pass. See LM-E022 and LM-G002.
