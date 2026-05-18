# /listings/create E2E Test Matrix And Setup Plan

Status: setup artifact only. Do not add broad scenario tests until this matrix is
reviewed and the harness gaps are closed in small slices.

## Goal

Create a production-grade Playwright E2E harness for the host listing creation
experience. The suite must cover auth/profile gates, client and server
validation, optional host metadata, image uploads, draft persistence,
navigation guards, publish success, API failures, duplicate-listing collision
resolution, and search visibility after publish without turning the flow into
one long browser script.

## Success Criteria

- Every requested host scenario has exactly one primary coverage owner.
- Secondary coverage is cross-referenced but does not become duplicate primary
  coverage.
- Anonymous, authenticated host, incomplete-profile, suspended/unverified,
  upload, draft/guard, mocked-failure, API/security, and collision flows are
  separated unless they share setup naturally.
- Image upload/storage, geocoding, rate-limit, CSRF, and network failures are
  mocked in E2E unless the goal is explicitly to exercise the API contract.
- Tests assert user-visible behavior, preserved form data, redirects, storage
  state, and absence of page crashes/unhandled page errors.
- Real listing creation tests use deterministic data and cleanup.
- No real third-party storage, payment, or geocoding provider is required in CI.

## Current Repo Audit

- `playwright.config.ts` already uses Playwright Test, global E2E seeding,
  authenticated storage setup, traces on first retry, screenshots on failure,
  and videos on first retry.
- `tests/e2e/auth.setup.ts` creates storage states for the default user,
  `user2`, and reviewer users.
- Existing create-listing specs live in `tests/e2e/create-listing`.
- Existing collision/dedupe specs live in `tests/e2e/dedupe`.
- `tests/e2e/page-objects/create-listing.page.ts` already centralizes the main
  create form locators, happy-path helpers, image upload mocking, draft helpers,
  and listing API mocks.
- `src/app/listings/create/page.tsx` redirects anonymous users to `/login` and
  shows a soft profile-completion warning when the profile is below 60%.
- `src/app/listings/create/CreateListingForm.tsx` owns client validation,
  upload blocking, partial upload confirmation, draft autosave/restore/discard,
  cross-tab draft warning, navigation guard, idempotency key submission,
  collision modal wiring, success toast, draft clearing, and redirect.
- `src/components/listings/ImageUploader.tsx` owns file picker, drag/drop,
  invalid type filtering, 5MB error, max 10 enforcement, per-image error,
  retry single, retry all, cancel uploads, remove image with best-effort storage
  delete, and set-main ordering.
- `src/app/api/listings/route.ts` owns server gates for CSRF, rate limit, auth,
  suspension, email verification, profile threshold, schema validation,
  language compliance, geocoding not-found/unavailable, image URL ownership,
  max 10 active/paused listings, collision warnings, idempotency, creation, and
  immediate search sync.

## Existing Coverage Summary

| Area             | Existing primary coverage                            | Remaining setup gap                                                                       |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Required publish | `create-listing.spec.ts` F-001                       | Uses mocked listing API; add one cleaned-up real publish/search-visibility path.          |
| Optional publish | `create-listing.spec.ts` F-002/F-009-F-013           | Does not yet cover booking mode, gender fields, or household languages.                   |
| Basic validation | `create-listing.spec.ts` F-003-F-008                 | Add invalid slots and missing move-in date as explicit client cases.                      |
| Image basics     | `create-listing-images.spec.ts` IMG-001-IMG-008      | Add drag/drop, 5MB, retry-all, cancel, storage delete, set-main, partial-failure dialog.  |
| Draft basics     | `create-listing-draft.spec.ts` D-001-D-006           | Advanced expiry, cross-tab, beforeunload, back, pushState, and submission guards covered. |
| Resilience       | `create-listing.resilience.spec.ts` R-001-R-011      | Add CSRF, unverified host, geocoding unavailable, image ownership, server field focus.    |
| Collision modal  | `dedupe/create-collision-*.dedupe.spec.ts` T-16-T-19 | Add collision cancel and explicit post-add-date grouped search confirmation if needed.    |

## Planned File Structure

Use the existing structure instead of creating a parallel host folder:

```txt
tests/e2e/create-listing/
  create-listing.spec.ts
  create-listing-auth-gates.spec.ts
  create-listing-booking-languages.spec.ts
  create-listing-images.spec.ts
  create-listing-image-advanced.spec.ts
  create-listing-draft.spec.ts
  create-listing-draft-guard.spec.ts
  create-listing.resilience.spec.ts
  create-listing-api-security.spec.ts
  create-listing-post-publish-search.spec.ts

tests/e2e/dedupe/
  create-collision-modal-update.dedupe.spec.ts
  create-collision-modal-add-date.dedupe.spec.ts
  create-collision-modal-create-separate.dedupe.spec.ts
  create-collision-modal-cancel.dedupe.spec.ts
  create-collision-fourth-gated.dedupe.spec.ts

tests/e2e/page-objects/
  create-listing.page.ts

tests/e2e/fixtures/
  create-listing-data.fixture.ts
  upload.fixture.ts
  host-state.fixture.ts
  geocoding.fixture.ts
  console-errors.fixture.ts

tests/e2e/utils/
  createListingAssertions.ts
  createListingSeed.ts
  uploadMocks.ts
```

Existing files should be extended before adding new files when that keeps the
slice smaller and clearer.

## Logical Projects

| Logical project              | Current mapping                                   | User state                              | Viewport       | Purpose                                                         |
| ---------------------------- | ------------------------------------------------- | --------------------------------------- | -------------- | --------------------------------------------------------------- |
| `host-create-anonymous`      | `chromium-anon` or spec-local empty storage state | Anonymous                               | Desktop Chrome | `/listings/create` redirect to login.                           |
| `host-create-authenticated`  | `chromium`                                        | `playwright/.auth/user.json`            | Desktop Chrome | Main form, uploads, drafts, publish, API mocks.                 |
| `host-create-mobile`         | `Mobile Chrome`                                   | `playwright/.auth/user.json`            | Pixel 7        | Mobile layout sanity for create form, uploads, guard dialogs.   |
| `host-create-failure-mocked` | `chromium` with spec-local route mocks            | Authenticated host                      | Desktop Chrome | API/server/geocoding/upload failure states.                     |
| `host-create-dedupe`         | Existing `tests/e2e/dedupe` invocation            | Authenticated host plus seeded listings | Desktop Chrome | Collision modal and grouped-result behavior with feature flags. |

Do not add new Playwright projects until the implementation slice needs them.
The current config already runs create-listing specs through authenticated
desktop/mobile projects and has special dedupe feature-flag handling.

## Deterministic Seed Inventory

| Seed item                      | Current status                                            | Purpose                                                   |
| ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| `anon`                         | Empty browser context or `chromium-anon`                  | Anonymous redirect.                                       |
| `host_basic`                   | `playwright/.auth/user.json`                              | Normal create form, uploads, draft, publish.              |
| `host_incomplete_soft_warning` | Covered in `ProfileWarningBanner.test.tsx`                | Deterministic soft profile warning below 60%.             |
| `host_below_create_threshold`  | Covered in `listings-post.test.ts`                        | API blocks submit below server threshold.                 |
| `host_suspended`               | Mocked UI/API plus existing API unit                      | Server/API block.                                         |
| `host_unverified`              | Covered in `listings.test.ts` plus mocked E2E UI path     | Server/API block.                                         |
| `host_at_max_listings`         | Mocked today; real helper candidate                       | Max 10 active/paused listings.                            |
| `collision_existing_listing`   | Present in `tests/e2e/dedupe/create-collision-helpers.ts` | Duplicate address modal.                                  |
| `collision_three_recent`       | Present in `create-collision-fourth-gated.dedupe.spec.ts` | Fourth repeated listing gate.                             |
| `search_visible_listing`       | Covered in API contract and publish-to-search E2E         | Newly published listing appears in search after creation. |

## External Mocks

| Dependency       | Mock plan                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Image upload     | Use `page.route("**/api/upload")` helpers for success, per-image failure, slow upload, retry, retry-all, delete, and abort states. |
| Storage delete   | Intercept `DELETE /api/upload` and assert the expected storage path is attempted.                                                  |
| File size        | Use Playwright `FilePayload` with a generated 5MB+ buffer; do not commit a large binary fixture.                                   |
| Geocoding        | Prefer API route response mocks for UI messaging; use API/contract tests for route-level not-found/unavailable branches.           |
| CSRF/rate limits | Use API mocks for UI behavior and route-level integration/unit tests for enforcement.                                              |
| Search sync      | For post-publish search visibility, create one real listing with cleanup and poll `/search`/API for the new title.                 |

## Primary Coverage Matrix

### Group A - Auth And Profile Gates

| ID  | Scenario                                                                                             | User/project                                         | Seed/mocks                                                    | Actions                                                    | Assertions                                                                   | Primary owner                                                                                  | Current status | Priority |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------- | -------- |
| A1  | Anonymous host visits `/listings/create` and is redirected to login                                  | Anonymous, `host-create-anonymous`                   | Empty storage state                                           | Go to `/listings/create`                                   | URL is `/login`; no create form; no page crash                               | `create-listing-auth-gates.spec.ts`                                                            | Covered        | P0       |
| A2  | Authenticated host with incomplete profile sees warning; below server threshold is blocked on submit | Authenticated host plus profile fixtures             | `host_incomplete_soft_warning`, `host_below_create_threshold` | Visit form, then submit valid form as below-threshold host | Warning visible/dismissible; API block shows usable error and preserves form | `create-listing-auth-gates.spec.ts`, `ProfileWarningBanner.test.tsx`, `listings-post.test.ts`  | Covered        | P0       |
| A3  | Suspended or unverified host is blocked by API                                                       | Authenticated suspended/unverified or mocked failure | Host state helper or route mock                               | Submit valid form                                          | 403 message is usable; form preserved; no redirect loop                      | `create-listing-auth-gates.spec.ts`, `create-listing-api-security.spec.ts`, `listings.test.ts` | Covered        | P0       |

### Group B - Publish And Client Validation

| ID  | Scenario                                                                                                                                 | User/project       | Seed/mocks                            | Actions                                            | Assertions                                                                                     | Primary owner                                                                                      | Current status          | Priority |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------- | -------- |
| B1  | Host fills required fields only and publishes successfully                                                                               | Authenticated host | Mock upload and listing API           | Fill required fields, upload one photo, submit     | 201, success toast, redirect to `/listings/{id}`                                               | `create-listing.spec.ts` F-001                                                                     | Covered with mocked API | P0       |
| B2  | Host fills all optional fields and publishes successfully                                                                                | Authenticated host | Mock upload and listing API           | Fill all optional controls and submit              | Request body includes optional values; success toast; redirect                                 | `create-listing.spec.ts`, `create-listing-booking-languages.spec.ts`, `CreateListingForm.test.tsx` | Covered                 | P0       |
| B3  | Client validation catches empty title, short description, invalid price, invalid slots, bad zip, missing move-in date, and missing photo | Authenticated host | Mock upload only where needed         | Submit invalid variants                            | Field/native error visible; no POST for client failures; focus/aria-invalid where owned by app | `create-listing.spec.ts`                                                                           | Covered                 | P0       |
| B4  | Language/content compliance blocks disallowed title or description                                                                       | Authenticated host | Mock upload; route or real API branch | Submit disallowed title and disallowed description | Error maps to title/description; form preserved; no publish redirect                           | `create-listing-api-security.spec.ts`                                                              | Covered                 | P0       |

### Group C - Booking Mode And Household Languages

| ID  | Scenario                                                                             | User/project                         | Seed/mocks                   | Actions                                       | Assertions                                                                                               | Primary owner                              | Current status | Priority |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------ | ---------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------- | -------- |
| C1  | Host selects booking mode when whole-unit mode is enabled                            | Authenticated host with feature flag | Component-level feature prop | Select shared and whole-unit radio buttons    | Selected radio is visible; submitted body contains expected `bookingMode`                                | `CreateListingForm.test.tsx`               | Covered        | P1       |
| C2  | Room type `Entire Place` auto-switches booking mode when feature flag is on          | Same as C1                           | Component-level feature prop | Select room type `Entire Place`               | Whole-unit radio becomes selected; submitted body uses `WHOLE_UNIT`                                      | `CreateListingForm.test.tsx`               | Covered        | P1       |
| C3  | Host selects household languages, searches language list, removes selected languages | Authenticated host                   | No external dependency       | Search language, select languages, remove one | Selected chips visible/removed; language count updates; submitted body contains remaining language codes | `create-listing-booking-languages.spec.ts` | Covered        | P1       |

### Group D - Image Uploads

| ID  | Scenario                                                                   | User/project       | Seed/mocks                                               | Actions                                          | Assertions                                                                   | Primary owner                                   | Current status | Priority |
| --- | -------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------- | -------------- | -------- |
| D1  | Host uploads images by file picker                                         | Authenticated host | Mock upload success                                      | Set input files                                  | Preview, main badge, success summary                                         | `create-listing-images.spec.ts` IMG-001/IMG-002 | Covered        | P0       |
| D2  | Host uploads images by drag/drop                                           | Authenticated host | Mock upload success                                      | Dispatch drop with image file payload            | Preview and success summary; no crash                                        | `create-listing-image-advanced.spec.ts`         | Covered        | P1       |
| D3  | Invalid file type is ignored or handled cleanly                            | Authenticated host | No upload call expected                                  | Set `.txt` fixture                               | No preview; no count summary; no crash                                       | `create-listing-images.spec.ts` IMG-004         | Covered        | P0       |
| D4  | File over 5MB shows error                                                  | Authenticated host | Generated oversized file payload                         | Add 5MB+ image                                   | Visible 5MB skipped error; no upload POST for that file                      | `create-listing-image-advanced.spec.ts`         | Covered        | P0       |
| D5  | Max 10 images enforced                                                     | Authenticated host | Mock upload success                                      | Add 10 then attempt more                         | Count remains 10; add/drop control hidden or blocked                         | `create-listing-images.spec.ts` IMG-007         | Covered        | P0       |
| D6  | Upload failure shows per-image error                                       | Authenticated host | First upload 500                                         | Upload image                                     | Error overlay and failed summary visible                                     | `create-listing-images.spec.ts` IMG-006         | Covered        | P0       |
| D7  | Retry single failed upload and retry all failed uploads work               | Authenticated host | Multiple failures then success                           | Click single retry; click retry all              | Failed overlays clear; success summary updates                               | `create-listing-image-advanced.spec.ts`         | Covered        | P0       |
| D8  | Cancel upload removes pending uploads safely                               | Authenticated host | Slow upload                                              | Start upload, click cancel                       | Pending preview removed; submit state recovers; no uncaught abort error      | `create-listing-image-advanced.spec.ts`         | Covered        | P0       |
| D9  | Remove image works and storage delete is attempted                         | Authenticated host | Mock upload success, intercept DELETE                    | Remove uploaded image                            | Preview count updates; `DELETE /api/upload` called with storage path         | `create-listing-image-advanced.spec.ts`         | Covered        | P1       |
| D10 | Set image as main reorders correctly                                       | Authenticated host | Mock upload success                                      | Upload two images, click `Set as main` on second | Second preview becomes first; one Main badge; submitted images order matches | `create-listing-image-advanced.spec.ts`         | Covered        | P1       |
| D11 | Submit while uploads are pending is disabled/blocked                       | Authenticated host | Slow upload                                              | Fill form, start upload                          | Submit disabled and says uploading; no listing POST                          | `create-listing-images.spec.ts` IMG-008         | Covered        | P0       |
| D12 | Submit with partial failed uploads opens confirmation dialog               | Authenticated host | One success, one failed upload                           | Submit valid form                                | Dialog `Some Images Failed to Upload` appears; no listing POST yet           | `create-listing-image-advanced.spec.ts`         | Covered        | P0       |
| D13 | `Go back to fix` returns to form; `publish with successful photos` submits | Authenticated host | One success, one failed upload; mock listing API success | Use both dialog paths in isolated tests          | Cancel closes dialog preserving form; confirm submits only successful photos | `create-listing-image-advanced.spec.ts`         | Covered        | P0       |

### Group E - Drafts And Navigation Guard

| ID  | Scenario                                                                                          | User/project                               | Seed/mocks                          | Actions                                                      | Assertions                                                                                  | Primary owner                                                        | Current status | Priority |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------- | -------- |
| E1  | Draft autosaves, shows saved status, restores, discards, and expires after storage window         | Authenticated host                         | LocalStorage seed and clock control | Fill fields, reload, resume, start fresh, seed expired draft | Saved status visible; values restore; discard clears; expired draft removed                 | `create-listing-draft.spec.ts`, `create-listing-draft-guard.spec.ts` | Covered        | P0       |
| E2  | Cross-tab draft conflict warning appears and dismisses                                            | Authenticated host, two pages same context | LocalStorage storage event          | Modify draft in second tab                                   | Warning appears in first tab and dismisses                                                  | `create-listing-draft-guard.spec.ts`                                 | Covered        | P1       |
| E3  | Navigation guard catches link navigation, browser back, refresh/close, and submission-in-progress | Authenticated host                         | Form with unsaved data; slow API    | Click link, browser back, dispatch beforeunload, submit slow | Guard dialog for link/back; beforeunload prevented; submission cannot navigate accidentally | `create-listing-draft-guard.spec.ts`                                 | Covered        | P0       |

### Group F - Submit Success And Idempotency

| ID  | Scenario                                                                                        | User/project       | Seed/mocks                                              | Actions                                                | Assertions                                                                           | Primary owner                                                                       | Current status | Priority |
| --- | ----------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------- | -------- |
| F1  | Successful publish clears draft, disables guard, shows toast, and redirects to `/listings/{id}` | Authenticated host | Mock upload and listing API; seeded draft               | Submit valid form                                      | Draft localStorage cleared; no guard on redirect; toast visible; URL detail page     | `create-listing-draft-guard.spec.ts`, `create-listing.spec.ts`                      | Covered        | P0       |
| F2  | Double submit/double click is idempotent and does not create duplicates                         | Authenticated host | Mock API for UI; API contract with real idempotency key | Double-click submit                                    | One client POST; API idempotency returns one listing for duplicate key               | `create-listing.resilience.spec.ts`, `listings-post.test.ts`, `idempotency.test.ts` | Covered        | P0       |
| F3  | Server validation errors map to field errors and focus first invalid field                      | Authenticated host | Mock 400 `{ fields }` response                          | Submit valid-looking form, server returns field errors | Field errors visible; first invalid field focused; banner does not hide field errors | `create-listing-api-security.spec.ts`                                               | Covered        | P0       |

### Group G - API Failures, Geocoding, And Abuse Protections

| ID  | Scenario                                                                                     | User/project                       | Seed/mocks                                 | Actions                          | Assertions                                                      | Primary owner                                                              | Current status | Priority |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------ | -------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------- | -------- |
| G1  | API rate limit, CSRF failure, network failure, and generic server failure show usable errors | Authenticated host                 | Mock 429, 403 CSRF, aborted request, 500   | Submit valid form for each error | Usable error visible; form preserved; no crash                  | `create-listing.resilience.spec.ts`, `create-listing-api-security.spec.ts` | Covered        | P0       |
| G2  | Geocoding address not found and geocoding unavailable show correct messages                  | Authenticated host                 | Mock 400 not found and 503 unavailable     | Submit address variants          | Address-specific error visible; form preserved                  | `create-listing-api-security.spec.ts`                                      | Covered        | P0       |
| G3  | Invalid image ownership URL is rejected                                                      | API/contract plus UI-mocked error  | Direct POST with foreign image URL         | POST invalid image payload       | API returns 400; UI shows usable error if surfaced through form | `create-listing-api-security.spec.ts`, `listings-post.test.ts`             | Covered        | P0       |
| G4  | Max 10 active/paused listings per host is blocked                                            | Authenticated host or API/contract | Seed 10 active/paused listings or mock 400 | Submit valid form                | Max-listing message visible; no create                          | `create-listing.resilience.spec.ts`, `listings-post.test.ts`               | Covered        | P0       |

### Group H - Duplicate Listing Collision

| ID  | Scenario                                                                         | User/project         | Seed/mocks                                | Actions                                            | Assertions                                                               | Primary owner                                                             | Current status                                            | Priority |
| --- | -------------------------------------------------------------------------------- | -------------------- | ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------- | -------- |
| H1  | Duplicate same-address listing opens collision modal                             | `host-create-dedupe` | Existing collision seed helper            | Submit duplicate address                           | 409; modal visible with sibling details                                  | `create-collision-modal-update.dedupe.spec.ts`                            | Covered as part of T-16                                   | P0       |
| H2  | Collision `update existing` routes to edit page                                  | `host-create-dedupe` | Existing collision seed helper            | Choose update and continue                         | Navigates to `/listings/{id}/edit`                                       | `create-collision-modal-update.dedupe.spec.ts`                            | Covered                                                   | P0       |
| H3  | Collision `post additional start date` resubmits and publishes/grouping works    | `host-create-dedupe` | Existing collision seed helper            | Choose add-date and continue                       | Ack header sent; 201; created listing grouped/search-visible if asserted | `create-collision-modal-add-date.dedupe.spec.ts` plus grouped search spec | Covered: ack/create plus grouped search/list dedupe specs | P0       |
| H4  | Collision `create separate` requires 10-500 char reason and publishes when valid | `host-create-dedupe` | Existing collision seed helper            | Choose create separate, try short and valid reason | Continue disabled for short reason; valid ack publishes                  | `create-collision-modal-create-separate.dedupe.spec.ts`                   | Covered                                                   | P0       |
| H5  | Collision cancel returns to form without losing data                             | `host-create-dedupe` | Existing collision seed helper            | Open modal, cancel                                 | Modal closes; form values preserved; no ack POST                         | `create-collision-modal-cancel.dedupe.spec.ts`                            | Covered                                                   | P0       |
| H6  | Fourth/repeated similar listing is moderation/rate-limit gated                   | `host-create-dedupe` | Existing three-listing recent seed helper | Submit fourth and ack                              | 429 with `LISTING_CREATE_COLLISION_RATE_LIMITED`; no create              | `create-collision-fourth-gated.dedupe.spec.ts`                            | Covered                                                   | P0       |

### Group I - Post-Publish Search Visibility

| ID  | Scenario                                                      | User/project                        | Seed/mocks                                                                        | Actions                                                   | Assertions                                                                                | Primary owner                                                         | Current status                                                       | Priority |
| --- | ------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| I1  | Newly published listing appears in search soon after creation | Authenticated host plus search page | Real listing create with cleanup; mock upload only if ownership URL remains valid | Publish unique listing, navigate/search by title/location | Listing appears in `/search` or search API within polling window; cleanup removes listing | `listings-post.test.ts`, `create-listing-post-publish-search.spec.ts` | Covered: API triggers search sync and full search polling E2E passes | P0       |

## Implementation Slices

1. **Matrix and rules**: add this document and AGENTS rules. No production code.
2. **Harness hardening**: extend `CreateListingPage` with booking, language,
   advanced upload, collision, draft, and guard helpers.
3. **P0 gaps**: auth gates, invalid slots/missing move-in, content title guard,
   advanced upload partial/cancel/retry-all, stronger draft/guard, server field
   errors, CSRF/geocoding unavailable/image ownership, collision cancel.
4. **Real API/cleanup paths**: max listings, real idempotency duplicate guard,
   post-publish search visibility.
5. **Reviewer pass**: compare tests against this matrix, remove duplication,
   check selectors, run narrow specs and CI-split-friendly suite commands.

## Recommended Commands

Run narrow tests while implementing, then let GitHub Actions run the full split:

```bash
pnpm exec playwright test tests/e2e/create-listing/create-listing.spec.ts --project=chromium
pnpm exec playwright test tests/e2e/create-listing/create-listing-images.spec.ts --project=chromium
pnpm exec playwright test tests/e2e/create-listing/create-listing-draft.spec.ts --project=chromium
pnpm exec playwright test tests/e2e/create-listing/create-listing.resilience.spec.ts --project=chromium
FEATURE_LISTING_CREATE_COLLISION_WARN=true pnpm exec playwright test tests/e2e/dedupe/create-collision-*.dedupe.spec.ts --project=chromium
pnpm exec tsc --noEmit --pretty false
pnpm exec prettier --check AGENTS.md docs/create-listing-e2e-test-matrix.md tests/e2e/create-listing tests/e2e/dedupe tests/e2e/page-objects/create-listing.page.ts
```

For PR workflow, do not require a full local E2E sweep before opening the PR.
Run the narrow spec touched by each slice and type/format checks locally; allow
the 20-way GitHub Actions split to carry the broad Playwright run.
