# CFM Historical Retention Policy

> **Ticket**: CFM-1003 (Phase 10 docs-only).
>
> **Purpose**: separate "dead code cleanup" (allowed during CFM phases 9/10) from "destructive data removal" (NOT allowed as part of CFM). This doc is the guardrail that prevents a future "cleanup" migration from dropping historical booking evidence that Invariant #4 depends on.
>
> **Non-negotiable invariant honored**: #4 — "historical accepted booking evidence remains valid for public review eligibility." This doc is the guarantor.
>
> **Cross-links**:
> - [`docs/plans/cfm-migration-plan.md`](../plans/cfm-migration-plan.md) — Phase 10 CFM-1003 section (~line 874).
> - [`docs/plans/cfm-migration-plan.md#rollback-model`](../plans/cfm-migration-plan.md) — "rollback is reader/UI/operational only" reinforcement.
> - [`docs/migration/cfm-inventory.md`](./cfm-inventory.md) §2.5 Bookings history + §2.7 legacy cron routes.
> - [`docs/DATABASE.md`](../DATABASE.md) — models reference.
> - [`prisma/schema.prisma`](../../prisma/schema.prisma) — source of truth for cascade rules cited below.

---

## 1. Retention Intent (plain language)

The contact-first migration deprecates the public booking **creation** path. It does NOT deprecate the booking **history**. Every row written before freeze — and every row still written via the legacy drain after freeze (per CFM-101's compatibility behavior) — must remain queryable indefinitely so that:

- users who had an accepted booking can still leave a public review (Invariant #4),
- admins can investigate abuse reports that reference historical holds, bookings, or expiries,
- support can answer questions about past stays,
- audit logs remain available for incident forensics.

"Indefinitely" means no CFM phase schedules a `DROP TABLE`, `DROP COLUMN`, `DROP TYPE`, or `DROP VALUE` against the tables, columns, and enum values listed in §2. Future deletion (if ever) would require a separate legal/compliance-driven ticket outside CFM, not a cleanup migration.

---

## 2. Retained Structures (No-Drop List)

### 2.1 Tables retained indefinitely

| Table | Reason retained | Primary reader post-migration |
|---|---|---|
| `Booking` (`prisma/schema.prisma:208`) | Invariant #4 review eligibility + admin audit + support lookups. | CFM-901 `/bookings` history-first page; admin tools; review eligibility check in `viewer-state`. |
| `BookingAuditLog` (`prisma/schema.prisma:434`) | Incident forensics; invariant #4 evidence chain. | Admin booking audit API (`/api/bookings/[id]/audit/route.ts`); incident-response tooling. |
| `ListingDayInventory` (`prisma/schema.prisma:236`) | Historical reporting; legacy listings that are still on `LEGACY_BOOKING` during drain. | Legacy-drain admin views. On `HOST_MANAGED` listings this table is read-only per Invariant #2 but the table itself is retained. |
| `Report` (both `ABUSE_REPORT` and `PRIVATE_FEEDBACK`) | Abuse forensics + retained private-feedback history for admin investigation. | `/admin/reports` and trust/safety workflows. |
| `ConversationDeletion`, `TypingStatus` | Not booking-related; listed only because CFM touches messaging (CFM-003). Unchanged. | Messaging server actions. |

### 2.2 Enums retained (including values that look like "legacy" values)

| Enum / value | Location | Reason retained |
|---|---|---|
| `BookingStatus.HELD` | `prisma/schema.prisma:193` | Every expired hold row references this value via `previousStatus` in `BookingAuditLog`. Dropping the value would break historical queries. |
| `BookingStatus.EXPIRED` | `prisma/schema.prisma:194` | Same: `BookingAuditLog.action = 'EXPIRED'` rows refer to it. |
| `BookingStatus.PENDING` / `ACCEPTED` / `REJECTED` / `CANCELLED` | `prisma/schema.prisma:188-195` | Review-eligibility rules reference `ACCEPTED`. Admin rejection-trail references `REJECTED`/`CANCELLED`. |
| `NotificationType.BOOKING_EXPIRED`, `BOOKING_HOLD_EXPIRED` | `prisma/schema.prisma:354-355` | Notification-history rows reference these types. |

### 2.3 Columns on `Listing` retained for compatibility

| Column | Why retained |
|---|---|
| `availableSlots` (`prisma/schema.prisma:118`) | Compatibility shadow per CFM-202. Dual-written on `LEGACY_BOOKING` listings; legacy SDK clients may still read it. |
| `bookingMode` (`prisma/schema.prisma:133`) | Structural translation layer; some legacy filters still reference it. Open-question #3 in the plan defers deprecation past CFM-1002. |
| `holdTtlMinutes` (`prisma/schema.prisma:134`) | Used by the `sweep-expired-holds` cron during drain (CFM-904 retires the cron, not the column). |
| `version` | Optimistic locking across both availability models. Not a CFM-removal candidate. |

### 2.4 Indexes + constraints retained

- Every index on the retained tables stays. Partial unique index on `Booking(listingId, startDate, endDate) WHERE status IN ('PENDING', 'HELD', 'ACCEPTED')` — referenced in `prisma/schema.prisma:228-229` — stays.
- The `status_heldUntil` index (`prisma/schema.prisma:233`) stays even after CFM-904 retires the sweep cron, because ad-hoc admin queries against `status='HELD'` still benefit.

### 2.5 Cascade-rule preservation (load-bearing)

The existing delete cascades enforce history preservation at the schema level:

| Relation | Cascade | What this means for retention |
|---|---|---|
| `Booking.listing` → `Listing` | `onDelete: Restrict` (`prisma/schema.prisma:224`) | A listing CANNOT be hard-deleted while any booking references it. CFM MUST NOT change this to Cascade. |
| `Booking.tenant` → `User` | `onDelete: SetNull` (`prisma/schema.prisma:225`) | Deleting a user orphans `tenantId` but KEEPS the `Booking` row. Invariant #4 survives account deletion. |
| `BookingAuditLog.booking` → `Booking` | `onDelete: SetNull` (`prisma/schema.prisma:446`) | Even if a booking were deleted, audit entries survive with `bookingId = NULL` (H-2 fix). |
| `BookingAuditLog.actor` → `User` | `onDelete: SetNull` (`prisma/schema.prisma:447`) | Audit survives actor deletion. |

**CFM must not change any of the four cascade rules above.** Any proposal to change them requires a separate ticket with legal/compliance review.

---

## 3. What IS Allowed to be Removed Under CFM

CFM Phase 10 (CFM-1001, CFM-1002) removes **code**, not **data**:

- Dead UI component files after CFM-1001: `src/components/BookingForm.tsx`, `src/components/SlotSelector.tsx`, any legacy-only children.
- Client-facing booking CTAs on listing detail (CFM-1001).
- Deprecated search-URL compatibility aliases (CFM-1002) — only after CFM-004 telemetry shows zero supported clients use them.
- Booking-only notifications and emails wired up by `src/lib/notifications.ts` / `src/lib/email-templates.ts` (CFM-903). The notification templates are code; the `Notification` rows already sent remain in the DB unaffected.
- The `sweep-expired-holds` and `reconcile-slots` crons (CFM-904), once it is proven safe that no new `HELD`/unreconciled rows are being written. The cron files are code; the rows they would have operated on remain.

None of these operations touch the schema.

---

## 4. What is NEVER Allowed to be Removed as Part of CFM

The following actions are **forbidden** inside any CFM phase ticket. Any proposal to perform them requires a separate, legal/compliance-reviewed ticket outside CFM:

- `DELETE FROM "Booking"` — any rows, including `EXPIRED`, `CANCELLED`, `REJECTED`.
- `DELETE FROM "BookingAuditLog"` — any rows.
- `DROP TABLE Booking`, `DROP TABLE BookingAuditLog`, `DROP TABLE ListingDayInventory`.
- `ALTER TYPE BookingStatus DROP VALUE 'HELD'` or `'EXPIRED'` (Postgres does not support this natively, but a rename-and-swap migration would achieve the same effect and is equally forbidden).
- `DROP INDEX` on any index referenced in §2.4.
- Mass `UPDATE "Booking" SET status = 'OBSOLETE'` or similar semantic erasure.
- Mass `UPDATE "BookingAuditLog" SET ipAddress = NULL` — except through the GDPR pathway in §5 which operates on a per-user basis.
- Truncating `listing_day_inventory` rows that reference `HOST_MANAGED` listings, even though those listings no longer read the table. The rows are historical, not live state.

**Any migration introducing statements matching these patterns inside `prisma/migrations/` MUST fail reviewer checks until it is reclassified as a non-CFM ticket with its own review chain.**

Suggested reviewer grep (verification per plan §Tests required):

```
grep -rE "DROP TABLE (\"?Booking|\"?BookingAuditLog|\"?listing_day_inventory)|DROP TYPE \"?BookingStatus|DELETE FROM \"?Booking" prisma/migrations/
```

A match inside a CFM-phase migration is a blocking defect.

---

## 5. Read-Only Transition (Phase 9 → Phase 10)

Two surfaces formally become read-only without the underlying tables going anywhere:

### 5.1 `/bookings` → history-first (CFM-901)

- Route retained. Component tree switches from mixed create/edit/cancel UX to a read-only list of past participations.
- Underlying `Booking` / `BookingAuditLog` reads unchanged.
- `CFM-901` retired the last interactive `/bookings` path, leaving the page as a pure history view for both host and renter perspectives.
- **Forbidden**: deleting `Booking` rows in response to CFM-901 rollout.

### 5.2 `ListingDayInventory` → host-managed-only read (CFM-904)

- The `sweep-expired-holds` and `reconcile-slots` crons are retired by CFM-904.
- On `HOST_MANAGED` listings, `ListingDayInventory` becomes read-only per Invariant #2 (host-managed listings never derive public availability from bookings or `ListingDayInventory`).
- On `LEGACY_BOOKING` listings still in drain, `ListingDayInventory` continues to accept writes until each listing is migrated. Do NOT attempt a global read-only flip — CFM does not force all listings to `HOST_MANAGED` by Phase 10.
- **Forbidden**: truncating the table, dropping the FK, or changing the cascade rule.

---

## 6. GDPR / CCPA Posture

Roomshare does not have a dedicated `docs/privacy/` directory as of 2026-04-16; this doc therefore summarizes the posture rather than replacing an authoritative policy:

- **Account deletion** goes through `deleteAccount` (`src/app/actions/settings.ts:245`), which ultimately calls `prisma.user.delete()` (line 303). The schema's cascade rules handle the consequences:
  - `Booking.tenant` → `SetNull`: booking rows survive with `tenantId = NULL`. This is **correct** for Invariant #4: historical accepted bookings remain queryable for review-eligibility checks of the OTHER participant (the host), which does not require the tenant's identity.
  - `BookingAuditLog.actor` → `SetNull`: audit rows survive with `actorId = NULL`.
  - `BookingAuditLog.bookingId` → `SetNull`: if a booking row is hard-deleted (not via CFM — some other path), the audit survives orphaned.
- **PII scrubbing on audit logs**: `BookingAuditLog.ipAddress` is annotated in the schema (`prisma/schema.prisma:443`): "GDPR: if populated in future, must be scrubbed in `deleteAccount()`." That note is authoritative; any CFM ticket that begins populating `ipAddress` MUST update `deleteAccount()` to scrub it.
- **CFM does not introduce a new deletion pathway.** No CFM ticket adds, changes, or removes a GDPR/CCPA deletion channel. The existing `deleteAccount` flow remains the single source of lawful user-initiated erasure.
- **If a platform-wide retention policy is introduced later** (e.g., "purge bookings older than 7 years"), it MUST be implemented outside CFM and MUST update this doc. Until then, the default is "retained indefinitely."

---

## 7. Migration Author Guidance

If you are writing a migration under `prisma/migrations/` and it touches any table, enum, or column in §2:

1. **Check this doc first.** Ensure your change is classified as "allowed" (§3) and not "forbidden" (§4).
2. **If it's forbidden**, stop. File a separate non-CFM ticket with legal/compliance review. A `DROP`-style change is not a CFM deliverable and will not pass reviewer checks.
3. **If it's ambiguous** (e.g., adding a nullable column to `Booking`), it is PROBABLY allowed since additive schema changes preserve history. Document the rationale in the migration SQL header and in the ticket.
4. **ADR-style review cadence**: Roomshare does not currently have a formal `docs/adr/` directory. Until one exists, use the critic-agent / code-reviewer lane documented in the `docs/migration/cfm-inventory.md` owner convention as the ADR-equivalent review. The reviewer MUST confirm this doc was read before approving.
5. **Every cross-cutting CFM migration PR must update the "Last verified" date on `docs/migration/cfm-inventory.md` § header.**

---

## 8. Rollback Model Reinforcement

The plan doc's Rollback Model (`docs/plans/cfm-migration-plan.md` §Rollback Model) already states: "rollback is reader/UI/operational only after host-managed listings go live; it is not a full semantic rollback to booking-derived truth." This retention policy is consistent with that: we keep the booking tables alive for reads but we do NOT restore booking-derived availability as authoritative for listings that have migrated to `HOST_MANAGED`. Rollback operates on readers and feature flags, not on data.

Specifically:

- Rolling back CFM-601 (search cutover): restore the pre-CFM predicate in the reader; do NOT mutate `ListingDayInventory` rows.
- Rolling back CFM-603 (card / detail readers): restore the pre-CFM slot display; do NOT mutate `Listing.availableSlots` or write fake `Booking` rows.
- Rolling back CFM-101 (freeze): re-enable the write path in `createBooking`/`createHold`; the tables are still present, so no data migration is needed.

---

## 9. Review Checklist (for reviewers of CFM-phase PRs)

- [ ] Migration SQL contains no `DROP TABLE|DROP COLUMN|DROP TYPE|DROP VALUE|DELETE FROM` against any structure in §2.
- [ ] No code change silently mutates the cascade rules at §2.5.
- [ ] If the PR touches `deleteAccount()`, `ipAddress` scrubbing still fires when/if the column is populated.
- [ ] `docs/migration/cfm-inventory.md` "Last verified" is bumped and affected rows updated.

A failing row here is blocking.

---

## 10. Changelog

| Date | Change |
|---|---|
| 2026-04-16 | Initial retention policy (CFM-1003). Codifies no-drop list, cascade-rule preservation, GDPR posture, and reviewer checklist. |
