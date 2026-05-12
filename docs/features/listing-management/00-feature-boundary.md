# Listing Management Feature Boundary

Status: source-audited boundary.

| Scope area | Included current behavior | Evidence |
| --- | --- | --- |
| Create listing entry | Authenticated users reach `/listings/create`; anonymous users redirect to `/login`; profile completion below the configured threshold shows a soft warning before rendering the form. | LM-E001 |
| Create listing form | The client preserves draft state, guards navigation while work is unsaved or submitting, validates before submit, requires a successful image, posts to `/api/listings`, handles collision candidates, clears drafts on success, disables the guard, and redirects to `/listings/{id}`. | LM-E002, LM-E003 |
| Image upload | Listing images use the shared uploader with max 10 images, cloud upload to `/api/upload`, image MIME filtering, 5 MB client filtering, abort handling, retry/error state, and best-effort deletion on removal. | LM-E004 |
| Create API | `POST /api/listings` enforces CSRF, rate limit, auth, suspension, email verification, profile completion, Zod validation, language compliance, geocoding, image URL ownership, max active listings, collision warning/rate-limit logic, idempotency, canonical inventory sync, search dirty marking, search sync, optional embedding, and instant-alert side effects. | LM-E005, LM-E006, LM-E007 |
| Edit listing | The edit page is auth-only, fetches the listing with location, returns not-found for missing listings, redirects non-owners, and passes feature flags to `EditListingForm`. | LM-E008 |
| Update listing | `PATCH /api/listings/[id]` supports host-managed availability updates and listing profile updates with ownership checks, suspension/email gates, optimistic version checks, moderation write locks, validation, canonical inventory sync, dirty marking, and best-effort image cleanup. | LM-E011, LM-E012 |
| Status changes | `updateListingStatus` validates ID/status/version, requires auth, blocks suspended users, locks the row, checks ownership, applies moderation lock and version checks, updates status/reason/version, marks search dirty, syncs lifecycle projection, and revalidates listing/profile/search paths. | LM-E015 |
| Delete listing | `DELETE /api/listings/[id]` requires CSRF, rate limit, auth, password or fresh OAuth session, ownership, and row lock; listings with reports are suppressed, listings without reports are tombstoned/deleted, and image storage cleanup is best effort. | LM-E013 |
| Delete eligibility | `GET /api/listings/[id]/can-delete` requires auth, ownership, and returns active conversation count plus zero active/pending booking counts. | LM-E014 |
| Schema and data model | Listing creation uses Zod schemas for core fields, images, enums, languages, and date fields; Prisma defines listing, location, status, saved-listing relation, idempotency keys, and listing inventory projection. | LM-E016, LM-E017 |

## Out Of Scope

| Area | Reason | Evidence |
| --- | --- | --- |
| Search and map discovery behavior | Public search/list/map behavior is covered by `docs/features/search-map/`, and this package only cites create/edit/status/delete surfaces. | `docs/features/search-map/README.md`; LM-E019 |
| Contact-host messaging and viewer-state behavior | Contact CTA, paywall, messaging, and viewer-state behavior are covered by `docs/features/contact-host/`. | `docs/features/contact-host/README.md`; LM-E019 |
| Real payment or booking execution | This package documents listing availability/status fields only; `can-delete` currently returns active/pending booking counts as `0`, and no payment API is part of the listing-management evidence set. | LM-E014 |

## Unknowns

| Unknown | Severity | Evidence |
| --- | --- | --- |
| Listing-edit/status/delete browser coverage is now present and passes, and the latest selected create/listing-edit/dedupe Chromium gate is green after LM-G006 focused diagnosis. | CLOSED | LM-G006, LM-E049 |
| Direct API route-handler/security tests passed, but live Next server/curl checks for mutation cache/header behavior and route-level CSRF rejection were not run in this documentation pass. | P2 | LM-G002 |
| Broader discovered tests outside the direct API/security and browser commands, including additional component/schema paths, still have no pass/fail result from this pass. | P2 | LM-G003 |
