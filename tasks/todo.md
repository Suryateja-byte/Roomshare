# P1 Fix: Listing PATCH bypasses create-time trusted-address validation

## Goal + acceptance criteria

`PATCH /api/listings/[id]` must enforce the **same** trusted-address validation as
create (`POST /api/listings`) whenever the address changes. Direct-API address
changes that only pass Nominatim forward-geocoding (best-guess) must be rejected.

- Acceptance: a PATCH that changes address WITHOUT a valid `addressSuggestionToken`
  and with Google Address Validation disabled is **blocked (503)** — never silently
  geocoded.
- Acceptance: with a valid server-signed `addressSuggestionToken` matching the
  submitted fields → 200, coords come from the token (no geocode).
- Acceptance: with `googleAddressValidation` enabled, an unverifiable address →
  400; a verified address → 200 with validated coords; upstream outage → 503.
- Acceptance: address-unchanged PATCH path is unaffected.

## Root cause

- Create path (`src/app/api/listings/route.ts:328-391`): verifies a signed
  `addressSuggestionToken` (PREMISE precision, user+fields bound) OR calls
  `validateAddressForPublish` (Google Address Validation); blocks otherwise.
- PATCH path (`src/app/api/listings/[id]/route.ts:933-976`): on address change only
  calls `geocodeAddress` (Nominatim forward-geocode), which returns coords for any
  plausible/fake address — **no trust/precision gate**. The official EditListingForm
  doesn't even expose address editing, so this is an API-level abuse bypass.

## Scope (files/modules)

- `src/app/api/listings/[id]/route.ts`
  - imports: add `verifyAddressSuggestionToken`, `validateAddressForPublish` +
    `GooglePlacesUnavailableError`; remove now-unused `geocodeAddress` and
    `isCircuitOpenError`.
  - `listingProfilePatchSchema`: add optional `addressSuggestionToken` (mirror create
    schema: trim, max 4096, empty→undefined).
  - destructure `addressSuggestionToken`.
  - replace the `geocodeAddress` block with create-mirroring token → Google
    validation → block logic, wrapped in `if (addressChanged && listing.location)`.
- `src/__tests__/api/listings-host-managed-patch.test.ts`
  - add mocks: `address-suggestion-token` (verify), `google-places`
    (validateAddressForPublish + GooglePlacesUnavailableError); add
    `googleAddressValidation` getter to the `@/lib/env` mock.
  - update the 2 existing address-change tests to pass a valid token.
  - add security regression tests (bypass blocked; token path; google path; 400).

## Risks (auth/PII/state/DB/cost)

- Security-critical path; coords persist to PostGIS `Location.coords`. No DB schema
  change. No PII in logs (only userId-prefix + city/state, matching create).
- Behavior change: direct-API address edits now require a verified address. The
  first-party edit form never changed address, so no first-party UX regression.

## Verification

- `pnpm typecheck`
- `pnpm test src/__tests__/api/listings-host-managed-patch.test.ts`
- `pnpm test src/__tests__/api/listings-post.test.ts` (create path unaffected)
- `pnpm lint` (confirm no orphaned imports)

## Rollback notes

- Pure code change, reversible by `git revert`. No migration/backfill.

## Results + verification story

Implemented on branch `fix/listing-patch-address-validation`.

- `src/app/api/listings/[id]/route.ts`: PATCH now requires a valid server-signed
  `addressSuggestionToken` OR Google Address Validation whenever the address
  changes, mirroring create. Removed the Nominatim `geocodeAddress` fallback and
  its now-orphaned imports (`geocodeAddress`, `isCircuitOpenError`).
- `src/__tests__/api/listings-host-managed-patch.test.ts`: added validator mocks +
  `googleAddressValidation` env getter; updated the 2 address-edit tests to the
  token path; added a 5-test "P1 bypass guard" describe block.

Verification (all green):
- `pnpm typecheck` → EXIT 0
- `npx jest listings-host-managed-patch.test.ts` → 17 passed (5 new)
- `npx jest listings-post.test.ts` → 56 passed (create path unaffected)
- `npx jest listings-idor.test.ts` → 32 passed ([id] route unaffected)
- `npx eslint` on changed route → 0 errors (pre-existing `LockedListingRow`
  warning only)

Behavior: a direct-API address change without a verified token and with Google
validation disabled now returns 503 (blocked) instead of silently geocoding. The
first-party EditListingForm never edits the address, so no UX regression.
