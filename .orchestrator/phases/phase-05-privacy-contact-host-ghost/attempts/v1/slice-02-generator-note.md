# Phase 05 Slice 02 Generator Note

## Slice Completed

Privacy and public autocomplete leak guards.

## Files Changed

- `src/lib/privacy/public-read-contract.ts`
- `src/__tests__/lib/privacy/public-read-contract.test.ts`
- `src/__tests__/lib/geocoding/public-autocomplete.test.ts`

## Implementation Summary

- Added reusable forbidden public payload key detection for exact location, raw address,
  unit-number, and phone fields.
- Added tests pinning public listing detail selection to city/state only and no owner email.
- Added tests pinning projection search and public autocomplete away from private fields.
- Added regression coverage for unsafe address-like autocomplete labels returned from projection rows.

## Checks Run

- `pnpm test -- --runTestsByPath src/__tests__/lib/privacy/public-read-contract.test.ts --runInBand`
- `pnpm test -- --runTestsByPath src/__tests__/lib/geocoding/public-autocomplete.test.ts src/__tests__/api/geocoding/autocomplete/route.test.ts --runInBand`

## Assumptions Followed

- Phase 04 projection search is allowed to use public geometry fields but must never select exact/raw address fields.

## Remaining Risks

- Contact-host and phone-reveal runtime paths are covered in later slices.
