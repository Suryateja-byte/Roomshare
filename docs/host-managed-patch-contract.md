# Host-Managed Listing PATCH Contract

Authoritative reference for `PATCH /api/listings/:id` when the listing's
`availabilitySource` is `HOST_MANAGED`. The route has **two** branches under
one endpoint:

1. **Dedicated host-managed branch** — narrow schema, optimistic CAS,
   server-derived status transitions. Triggered when the listing is
   `HOST_MANAGED` **and** the payload is "pure" (only host-managed keys).
2. **Generic PATCH branch** — used for legacy listings, and for content-only
   edits (title/description/images) on host-managed listings. Refuses to
   touch inventory fields on host-managed rows.

Source of truth: `src/app/api/listings/[id]/route.ts` and the helper at
`src/lib/listings/host-managed-write.ts`. If types / tests and this doc
conflict, types win.

Ticket history: CFM-301 (helper), CFM-302 (this contract), CFM-504 (extended
mixed-state guard). See `docs/plans/cfm-migration-plan.md`.

---

## 1. Dispatch

### 1.1 `isPureHostManagedPatchPayload`

Defined at `src/app/api/listings/[id]/route.ts:198-210`. Returns true when:

- The body is a plain object (not an array, not null).
- It contains `expectedVersion`.
- Every key is in `HOST_MANAGED_PATCH_KEYS` (`route.ts:184-192`):
  `expectedVersion`, `openSlots`, `totalSlots`, `moveInDate`, `availableUntil`,
  `minStayMonths`, `status`.

Any extra key (e.g., `title`, `amenities`) falls to the generic branch.

### 1.2 Branch selection

`route.ts:469-471`:

```ts
const useDedicatedHostManagedPatch =
  listing.availabilitySource === "HOST_MANAGED" &&
  isPureHostManagedPatchPayload(rawBody);
```

Both conditions required. A legacy listing that happens to send a pure
host-managed payload falls through to `prepareHostManagedListingWrite`, which
rejects at `host-managed-write.ts:194-196` with
`HOST_MANAGED_WRITE_PATH_REQUIRED`.

---

## 2. Request schema — dedicated branch

`hostManagedPatchSchema` at `src/app/api/listings/[id]/route.ts:167-177` (Zod
`.strict()`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `expectedVersion` | non-negative integer | ✅ | Optimistic-lock CAS token. |
| `openSlots` | integer \| null | — | `null` clears; 0 is a valid "full" count. |
| `totalSlots` | positive integer | — | Capacity. Helper requires ≥ 1. |
| `moveInDate` | `YYYY-MM-DD` \| null | — | Earliest accepted move-in. |
| `availableUntil` | `YYYY-MM-DD` \| null | — | Last day marketed. Must not be before `moveInDate`. |
| `minStayMonths` | positive integer | — | Helper requires ≥ 1. |
| `status` | `"ACTIVE"` \| `"PAUSED"` \| `"RENTED"` | — | Explicit override; omit to let the server auto-derive. |

Because the schema is `.strict()`, extra keys produce a 400 with Zod errors
in `{ fields: ... }`.

### 2.1 "Empty" payload

A payload containing only `{ expectedVersion }` passes the gate
(`isPureHostManagedPatchPayload`) and runs the helper. The helper computes
`availabilityAffecting = false` (see `host-managed-write.ts:277-282`) and the
only data mutation is `version` + `status` (unchanged) + `statusReason`
(recomputed from the existing row). This is effectively a no-op version bump
and is harmless.

---

## 3. Optimistic locking (version CAS)

Callers read `listing.version`, send it as `expectedVersion`, and the helper
compares at `host-managed-write.ts:198-200`:

```ts
if (input.expectedVersion !== current.version) {
  return makeWriteError("VERSION_CONFLICT", 409);
}
```

On success the helper sets `nextVersion = current.version + 1` and includes
it in the update payload (`host-managed-write.ts:288-293`). Clients must
refresh their cached version after each successful PATCH.

Test coverage for the CAS path:

- Unit: `src/__tests__/lib/listings/host-managed-write.test.ts`.
- API integration: the host-managed PATCH tests at
  `src/__tests__/api/listings-host-managed-patch.test.ts` cover the happy
  path; the mixed-write test at `src/__tests__/api/listings-idor.test.ts`
  covers `HOST_MANAGED_WRITE_PATH_REQUIRED` dispatches.

---

## 4. Machine error codes

All codes defined at `src/lib/listings/host-managed-write.ts:19-36`. HTTP
status is returned via `WriteError.httpStatus`.

| Code | HTTP | Trigger | Caller recovery |
|---|---|---|---|
| `VERSION_CONFLICT` | 409 | `expectedVersion !== listing.version` | Re-fetch the listing, re-apply the edit, retry. |
| `HOST_MANAGED_WRITE_PATH_REQUIRED` | 409 | Legacy listing received a host-managed payload (helper rejects at L194-196) **OR** host-managed listing received a mixed payload via the generic path (CFM-504 guard at `route.ts:803-822`). | Reload the listing and use the dedicated availability editor. |
| `HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS` | 400 | Explicit `status=ACTIVE` with `openSlots` null or `<= 0`. | Set a positive `openSlots` or drop the explicit `status`. |
| `HOST_MANAGED_INVALID_DATE_RANGE` | 400 | `availableUntil < moveInDate` (day-only comparison); or `ACTIVE` status with missing `moveInDate` / past `availableUntil`. | Fix the date pair before retrying. |
| `HOST_MANAGED_INVALID_MIN_STAY` | 400 | `minStayMonths < 1`. | Use an integer ≥ 1. |
| `HOST_MANAGED_INVALID_TOTAL_SLOTS` | 400 | `totalSlots < 1`. | Use a positive total. |
| `HOST_MANAGED_INVALID_OPEN_SLOTS` | 400 | `openSlots < 0`, `openSlots > totalSlots`, or `openSlots=null` on an availability-affecting write. | Clamp to `[0, totalSlots]`. |
| `HOST_MANAGED_MIGRATION_REVIEW_REQUIRED` | 400 | Explicit `status=ACTIVE` while `needsMigrationReview = true`. | Complete the migration-review workflow (CFM-503) first. |

Codes are surfaced in the JSON body as `{ error, code }`. The host-managed
PATCH branch does NOT include Zod `fields` on helper errors — field-level
errors are only returned on the upstream Zod step (schema parse) where the
shape is well-defined.

---

## 5. Server-derived status transitions

When `input.status` is **omitted**, the helper picks the next status from
row state (`host-managed-write.ts:243-250`):

| Condition | Resulting status | `statusReason` |
|---|---|---|
| `nextOpenSlots === 0` | `RENTED` | `NO_OPEN_SLOTS` |
| `availableUntilPast` (today past `availableUntil`) | `RENTED` | `AVAILABLE_UNTIL_PASSED` |
| Otherwise | keep `current.status` | keep `current.statusReason` |

When `input.status` is **explicit**, the helper validates and normalizes the
reason via `statusReasonForExplicitStatus` (`host-managed-write.ts:252-255`).
Explicit `ACTIVE` additionally:

- Rejects if `needsMigrationReview` — see `HOST_MANAGED_MIGRATION_REVIEW_REQUIRED`.
- Requires `openSlots > 0` and a valid date window.
- Clears `statusReason` to `null`.

Allowed `statusReason` values (`host-managed-write.ts:6-17`):
`NO_OPEN_SLOTS`, `AVAILABLE_UNTIL_PASSED`, `HOST_PAUSED`, `ADMIN_PAUSED`,
`MIGRATION_REVIEW`, `STALE_AUTO_PAUSE`, `MANUAL_CLOSED`.

---

## 6. Invalid field combinations rejected deterministically

| Case | Code | Where enforced |
|---|---|---|
| Extra key in payload (e.g., `title`) | 400 (Zod) | `hostManagedPatchSchema.strict()` |
| `availableUntil < moveInDate` | `HOST_MANAGED_INVALID_DATE_RANGE` | `host-managed-write.ts:232-238` |
| `ACTIVE` + `openSlots == null` | `HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS` | `host-managed-write.ts:263-268` |
| `ACTIVE` + missing `moveInDate` / past `availableUntil` | `HOST_MANAGED_INVALID_DATE_RANGE` | `host-managed-write.ts:270-272` |
| Availability-affecting write with `openSlots=null` | `HOST_MANAGED_INVALID_OPEN_SLOTS` | `host-managed-write.ts:284-286` |
| Host-managed row receives mixed payload on generic path (touches `moveInDate` / `bookingMode` / `totalSlots` / `availableUntil` / `minStayMonths`) | `HOST_MANAGED_WRITE_PATH_REQUIRED` | `route.ts:803-822` (CFM-504) |
| Legacy row receives pure host-managed payload | `HOST_MANAGED_WRITE_PATH_REQUIRED` | `host-managed-write.ts:194-196` |
| `expectedVersion` stale | `VERSION_CONFLICT` | `host-managed-write.ts:198-200` |

---

## 7. What the generic PATCH branch can do to host-managed rows

The generic branch (L566-924) covers content-only edits. On host-managed
rows it can safely change: `title`, `description`, `price`, `amenities`,
`houseRules`, `householdLanguages`, `genderPreference`, `householdGender`,
`primaryHomeLanguage`, `leaseDuration`, `roomType`, `images`, and location
fields (`address`, `city`, `state`, `zip`).

Inventory / availability fields are gated by the CFM-504 extended
mixed-state guard at `route.ts:803-822`: `moveInDateChanged`,
`bookingModeChanged`, `totalSlotsChanged`, `availableUntilChanged`,
`minStayMonthsChanged` — any one on a `HOST_MANAGED` row throws
`HOST_MANAGED_WRITE_PATH_REQUIRED`.

---

## 8. UI payload audit — `EditListingForm.tsx`

Audited at `src/app/listings/[id]/edit/EditListingForm.tsx` during CFM-302.
Findings:

- The top-level `EditListingForm` component at `L1681-1687` dispatches by
  `availabilitySource`:
  ```ts
  if (props.listing.availabilitySource === "HOST_MANAGED") {
    return <HostManagedEditListingForm {...props} />;
  }
  return <LegacyEditListingForm {...props} />;
  ```
- `HostManagedEditListingForm`'s PATCH body at `L298-307`:
  ```ts
  body: JSON.stringify({
    expectedVersion: version,
    openSlots: Number(openSlots),
    totalSlots: Number(totalSlots),
    moveInDate: moveInDate || null,
    availableUntil: availableUntil || null,
    minStayMonths: Number(minStayMonths),
    status,
  })
  ```
  — every key is in `HOST_MANAGED_PATCH_KEYS`; payload is "pure" so the
  server dispatches to the dedicated branch.
- `LegacyEditListingForm`'s PATCH body at `L979` does not include any of the
  dedicated-only keys; it flows through the generic schema which allows
  `moveInDate` / `availableUntil` / `minStayMonths` on LEGACY_BOOKING rows.
- Client error handling: the form surfaces `code === "VERSION_CONFLICT"` as
  a reload-required state at `L316-320`, matching the server contract.

**No drift.** The UI is consistent with the server contract as of this
audit. If the edit form is ever extended with new fields, update both this
doc and `HOST_MANAGED_PATCH_KEYS`.

---

## 9. Testing

- Unit tests for the helper: `src/__tests__/lib/listings/host-managed-write.test.ts`
  — covers version CAS, invalid slots/dates, mixed-payload rejection, and
  the CFM-504 extended guard (availableUntil/minStayMonths change detection).
- Host-managed route integration:
  `src/__tests__/api/listings-host-managed-patch.test.ts`
  — dedicated branch happy path + `markListingDirtyInTx` assertion.
- Mixed-write rejection:
  `src/__tests__/api/listings-idor.test.ts`
  — 409 + `HOST_MANAGED_WRITE_PATH_REQUIRED` for every tracked inventory
  field on a `HOST_MANAGED` listing.

---

## 10. Changelog

| Date | Change |
|---|---|
| 2026-04-16 | Initial doc (CFM-302). Captures the contract as of CFM-504. |
| 2026-04-16 | CFM-004: cross-link to `docs/migration/cfm-observability.md` for runtime monitoring of non-negotiable invariants #2 and #9. No contract change. |

---

## 11. Related docs

- `docs/search-contract.md` — normalized search input + response contract
  (CFM-002). `PublicAvailability` is the reader counterpart to these writes.
- `docs/plans/cfm-migration-plan.md` — full migration plan.
- `docs/migration/cfm-observability.md` — migration observability spec
  (CFM-004). Defines the host-managed invariant tripwires
  (`cfm.listing.host_managed_invariant_violation_count`) and the
  repair-loop clobber guard (`cfm.cron.host_managed_clobber_count`) that
  enforce non-negotiable invariants #2 and #9 at runtime.
- Source of truth:
  `src/app/api/listings/[id]/route.ts` (schema + dispatch),
  `src/lib/listings/host-managed-write.ts` (helper + error codes).
