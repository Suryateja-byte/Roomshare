# Slice 2: Canonical Saved-Search Contract

## Slice Completed

Saved-search writes now persist Phase 07 canonical metadata and create an EMAIL
alert subscription. Alert toggles mirror the legacy `SavedSearch` fields into
the subscription row through an upsert so legacy rows are repaired lazily.

## Files Changed

- `src/lib/search/saved-search-canonical.ts`
- `src/app/actions/saved-search.ts`
- `src/__tests__/actions/saved-search.test.ts`

## Checks Run

- `pnpm test -- --runTestsByPath src/__tests__/actions/saved-search.test.ts --runInBand` - passed, 1 suite / 20 tests.

## Assumptions Followed

- The saved-search public action return shapes remain unchanged.
- Existing rows without subscriptions are repaired when a user toggles alerts.
- The Phase 07 saved-search hash uses the existing query-hash helper plus the
  selected embedding/ranker/identity version tokens.

## Remaining Risks Or Blockers

- Alert matching still reads legacy fields and sends directly; durable match and
  delivery workers are covered by the next slice.
