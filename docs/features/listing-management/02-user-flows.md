# 02 User Flows

## Create Listing

| Step | Current behavior | Evidence |
| --- | --- | --- |
| Entry | Anonymous users are redirected to `/login`; authenticated users continue to profile lookup. | LM-E001 |
| Profile warning | The page calculates profile completion and shows `ProfileWarningBanner` when completion is below 60 percent. | LM-E001 |
| Draft setup | The form initializes persistent draft state and a navigation guard. | LM-E002 |
| Image upload | The uploader accepts image files, skips oversized files, uploads each file to `/api/upload`, and records per-image success or error state. | LM-E004 |
| Submit preconditions | The submit path blocks duplicate submits, waits for uploads, requires at least one successful image, and prompts before proceeding with partial upload failures. | LM-E003 |
| Client validation | The form builds JSON from controlled state, validates with `createListingClientSchema`, validates title/description language policy, and focuses first field errors. | LM-E003, LM-E016 |
| Server create | The API validates auth, account state, profile completion, schema, language, geocode, image ownership, listing count, collisions, idempotency, canonical availability, and search side effects. | LM-E005, LM-E006, LM-E007 |
| Collision | A `409 COLLISION_CANDIDATES` response stores sibling data and opens the collision path; acknowledged creation reposts with `x-collision-ack: 1`. | LM-E003, LM-E007 |
| Success | The client clears persisted draft, disables guard, resets idempotency key, shows a success toast, and redirects to `/listings/{id}`. | LM-E003 |

## Edit Listing

| Step | Current behavior | Evidence |
| --- | --- | --- |
| Entry | The edit page requires auth, fetches the listing with location, returns not-found for a missing listing, and redirects non-owners to public listing detail. | LM-E008 |
| Availability update | The host-managed form sends versioned availability/status fields to `PATCH /api/listings/[id]`, handles `LISTING_LOCKED` and `VERSION_CONFLICT`, and redirects on success. | LM-E009 |
| Profile update | The profile form sends listing profile fields and uploaded image URLs to the same PATCH endpoint, handles lock/field errors, clears draft on success, and saves draft on error. | LM-E010 |
| Server update | The PATCH route checks CSRF, rate, auth, suspension, email, ownership, schema, row lock, moderation lock, version, date invariants, canonical sync, dirty marker, and optional embedding. | LM-E011, LM-E012 |

## Status And Delete

| Flow | Current behavior | Evidence |
| --- | --- | --- |
| Status change | `updateListingStatus` validates input, requires auth, checks suspension, locks the listing, checks ownership and expected version, blocks moderation-locked listings, writes status/reason/version, marks search dirty, syncs lifecycle projection, and revalidates paths. | LM-E015 |
| Delete eligibility | The can-delete endpoint requires auth/owner and returns active conversation count plus zero booking counts. | LM-E014 |
| Delete | The delete endpoint requires CSRF/rate/auth, password or fresh OAuth confirmation, row lock and ownership; it suppresses reported listings and tombstones/deletes unreported listings. | LM-E013 |
