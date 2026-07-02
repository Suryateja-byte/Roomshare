# Host-Managed Availability & Status Contract

**Last verified: 2026-07-02** (against current `main`). Uses stable anchors
(function / schema names) rather than line numbers — the route is under active
edit. If types / tests and this doc conflict, types win.

Post contact-first cutover, **every** listing is host-managed; there is no
`availabilitySource` dispatch and no legacy-booking write path. Availability and
status are edited through **two independent server surfaces**, each with its own
authorization, optimistic-lock, and validation rules:

| Surface | Entry point | Mutates | Auth model |
|---|---|---|---|
| **Availability PATCH** | `PATCH /api/listings/:id` — availability branch (`isHostManagedAvailabilityPatch`) | Inventory numbers (`openSlots`, `totalSlots`, `moveInDate`, `availableUntil`, `minStayMonths`) + a caller-supplied `status` | Owner-only, in-tx `FOR UPDATE` + version CAS |
| **Status server action** | `updateListingStatus` / `recoverHostManagedListing` in `src/app/actions/listing-status.ts` | `status` + `statusReason` only (recovery also refreshes freshness timestamps) | Owner-only, in-tx `FOR UPDATE` + version CAS |

Source of truth: `src/app/api/listings/[id]/route.ts` (PATCH dispatch + schema)
and `src/app/actions/listing-status.ts` (status transitions). There is **no**
`src/lib/listings/host-managed-write.ts` helper — it was removed; all logic is
inline in those two files.

---

## 1. PATCH dispatch — payload shape, not `availabilitySource`

`PATCH /api/listings/:id` picks a branch purely from the request body shape:

- **Availability branch** — `isHostManagedAvailabilityPatch(rawBody)` is true
  when the body is a plain object (not array/null) containing **`openSlots` or
  `status`**. Parsed by `hostManagedAvailabilityPatchSchema`.
- **Profile branch** — everything else. Parsed by `listingProfilePatchSchema`
  (title/description/price/amenities/location/etc.). Rejects any
  availability-adjacent key (see §4, mixed-write guard).

The two branches are mutually exclusive and both schemas are Zod `.strict()`, so
a body cannot straddle them: a `title` sent alongside `openSlots` lands in the
availability branch and is rejected as an unknown key (400); a bare inventory
key sent without `openSlots`/`status` lands in the profile branch and is
rejected by the mixed-write guard (409).

---

## 2. Availability branch — schema is a full snapshot, not a partial patch

`hostManagedAvailabilityPatchSchema` (Zod `.strict()` + `.superRefine`). Every
core field is **required** — this is a whole-availability replacement, not a
sparse merge:

| Field | Type | Required | Notes |
|---|---|---|---|
| `expectedVersion` | coerced int ≥ 1 | ✅ | Optimistic-lock CAS token. |
| `openSlots` | coerced int, 0–20 | ✅ | 0 is a valid "full" count. Also written to `availableSlots`. |
| `totalSlots` | coerced int, 1–20 | ✅ | Capacity. |
| `moveInDate` | `YYYY-MM-DD` \| null | ✅ (key required; value nullable) | Earliest accepted move-in. |
| `availableUntil` | `YYYY-MM-DD` \| null | — (optional key) | Omit ⇒ keep existing; `null` ⇒ clear. |
| `minStayMonths` | coerced int ≥ 1 | ✅ | |
| `status` | `"ACTIVE"` \| `"PAUSED"` \| `"RENTED"` | ✅ | Caller-supplied; **not** server-derived. |

Calendar-date strings are pre-validated (`getHostManagedDateOnlyErrors`) →
400 `{ error: "Validation failed", fields }` before Zod runs. Because the schema
is `.strict()`, unknown keys also produce 400 with `fields`.

### Invariants enforced (verified in code)

- **`openSlots ≤ totalSlots`** — `.superRefine`, field error on `openSlots`.
- **`ACTIVE ⇒ openSlots > 0` and `moveInDate` present** — `.superRefine`.
- **`availableUntil` not in the past, and `≥ moveInDate`** — enforced twice:
  in `.superRefine` on the request, and re-checked inside the transaction
  against the resolved `nextAvailableUntil`/`nextMoveInDate` (since `availableUntil`
  may be omitted and inherited from the row).
- **`availableSlots` is kept equal to `openSlots`** on write.
- On success the write also stamps `lastConfirmedAt = now` and clears the
  freshness timers (`freshnessReminderSentAt`, `freshnessWarningSentAt`,
  `autoPausedAt`) — an availability edit counts as a reconfirmation.

### `statusReason` handling on the availability branch

`status` is taken as given; only `statusReason` is derived: `PAUSED` ⇒
`HOST_PAUSED`; a currently host-cleared reason (`HOST_PAUSED`,
`STALE_AUTO_PAUSE`, `FRESHNESS_WARNING`) is cleared to `null`; otherwise the
existing `statusReason` is preserved. There is **no** server auto-derivation of
`RENTED` from `openSlots === 0` (that behavior was removed).

---

## 3. Status server action — transitions only

`updateListingStatus(listingId, status, expectedVersion)` changes `status` +
`statusReason` without touching inventory. `expectedVersion` here is validated as
int ≥ 0 (note: the PATCH branch requires ≥ 1). Ordering inside the `FOR UPDATE`
transaction:

1. Ownership (`ownerId` mismatch ⇒ "You can only update your own listings").
2. Moderation write-lock (§4).
3. Version CAS ⇒ `VERSION_CONFLICT`.
4. `ACTIVE` while `statusReason ∈ {STALE_AUTO_PAUSE, FRESHNESS_WARNING}` ⇒
   `LISTING_REQUIRES_RECONFIRMATION` (must reconfirm availability first).
5. `ACTIVE` requires effective open slots > 0
   (`openSlots ?? availableSlots ?? totalSlots`) ⇒ else
   `HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS`.
6. `resolveHostStatusReason`: `PAUSED` ⇒ `HOST_PAUSED`; `ACTIVE` clears a prior
   `HOST_PAUSED`; otherwise preserved.

Then `markListingDirtyInTx(..., "status_changed")` +
`syncListingLifecycleProjectionInTx` in the same tx.

`recoverHostManagedListing(listingId, expectedVersion, mode)` (`RECONFIRM` |
`REOPEN`) is the reconfirmation companion: same CAS/lock guards, refreshes
`lastConfirmedAt` and clears freshness timers, and on `REOPEN` flips to `ACTIVE`
(also gated by `HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS`).

`reviewListingMigration` is a **retired stub** — it now returns
`MIGRATION_REVIEW_RETIRED` unconditionally. The old migration-review gate
(`HOST_MANAGED_MIGRATION_REVIEW_REQUIRED`) no longer exists.

---

## 4. Surviving error codes

The old `HOST_MANAGED_INVALID_*` taxonomy is gone. Slot/date validation failures
now return generic `400 { error: "Validation failed", fields }` (Zod field
errors, **no machine `code`**). The codes that remain:

| Code | Surface | HTTP / return | Trigger | Recovery |
|---|---|---|---|---|
| `VERSION_CONFLICT` | both | 409 (PATCH) / action error | `expectedVersion !== listing.version` | Re-fetch, re-apply, retry. |
| `HOST_MANAGED_WRITE_PATH_REQUIRED` | PATCH profile branch | 409 | Profile PATCH carries a retired availability key (`totalSlots`, `moveInDate`, `availableUntil`, `minStayMonths`) with no `openSlots`/`status` | Reload; use the availability editor. |
| `LISTING_LOCKED` | both | 423 (PATCH) / action error | `statusReason ∈ {ADMIN_PAUSED, SUPPRESSED}` — computed **before** the `moderationWriteLocks` flag, so enforced regardless of flag state; includes `lockReason` | Locked under review; no host edit. |
| `HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS` | status action | action error | Transition to `ACTIVE` with effective open slots ≤ 0 | Add an open slot or don't go ACTIVE. |
| `LISTING_REQUIRES_RECONFIRMATION` | status action | action error | `ACTIVE` while stale/freshness-paused | Reconfirm via `recoverHostManagedListing`. |
| `MIGRATION_REVIEW_RETIRED` | status action | action error | `reviewListingMigration` (retired) | N/A — call removed. |
| `INVALID_VERSION` | status action | action error | `expectedVersion` fails int-≥0 parse | Send a valid version. |

Non-code failures: PATCH availability branch also returns `404 "Listing not
found"` (missing row or non-owner) and `409 "Listing location is missing"`.

The mixed-write guard, version CAS under `FOR UPDATE`, and the in-tx
`markListingDirtyInTx` mark were each verified present in the live code.

---

## 5. Tests

- `src/__tests__/api/listings-host-managed-patch.test.ts` — availability branch
  happy path, validation, and the in-tx dirty-mark assertion.
- `src/__tests__/api/listings-idor.test.ts` — ownership/IDOR + the
  `HOST_MANAGED_WRITE_PATH_REQUIRED` mixed-write rejection.
- `src/__tests__/actions/listing-status.test.ts` — `updateListingStatus` /
  `recoverHostManagedListing` transitions, CAS, and
  `HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS`.

---

## Related docs

- `docs/search-contract.md` — normalized search input/response contract;
  `PublicAvailability` is the reader counterpart to these writes.
- `docs/plans/cfm-migration-plan.md` — full contact-first migration plan.
