# Listing Management

Status: COMPLETE with P2 verification gaps.

Evidence base: this package is source-audited from `src/app/listings/create/page.tsx`, `src/app/listings/create/CreateListingForm.tsx`, `src/components/listings/ImageUploader.tsx`, `src/app/api/listings/route.ts`, `src/app/listings/[id]/edit/page.tsx`, `src/app/listings/[id]/edit/EditListingForm.tsx`, `src/app/api/listings/[id]/route.ts`, `src/app/api/listings/[id]/can-delete/route.ts`, `src/app/actions/listing-status.ts`, `src/lib/schemas.ts`, `src/lib/listings/moderation-write-lock.ts`, `prisma/schema.prisma`, and discovered listing tests. Exact line ranges are in `evidence-register.md`.

## Package Files

| File | Purpose |
| --- | --- |
| `00-feature-boundary.md` | Evidence-backed feature scope. |
| `source-map.md` and `01-source-map.md` | Source, schema, migration, and test evidence map. |
| `evidence-register.md` | Claim evidence IDs and exact source ranges. |
| `interaction-census.md` and `03-interaction-census.md` | Host-facing interactions and system responses. |
| `02-user-flows.md` | Current create, edit, status, delete, and collision flows. |
| `04-runtime-sequences.md` | Runtime sequences documented from source evidence. |
| `05-api-contracts.md` | API and server action contracts. |
| `06-data-model-and-invariants.md` | Listing, location, idempotency, and inventory invariants. |
| `07-state-management.md` | Client and server state ownership. |
| `08-auth-security-permissions.md` | Auth, CSRF, ownership, suspension, profile, image, and moderation locks. |
| `09-errors-empty-loading-edge-cases.md` | User-visible and API error states. |
| `10-performance-observability.md` | Rate limits, transactions, async side effects, logging, and Sentry. |
| `11-test-traceability-matrix.md` | Existing tests discovered and recommended verification. |
| `12-gaps-unknowns-and-questions.md` | P1/P2 gaps and unknowns. |

## Verification

Current-behavior claims are source-backed. Focused API/security commands passed, the local E2E DB readiness blocker was repaired, and listing-edit/status/delete browser coverage now passes for the current host-managed UI. The latest selected create/listing-edit/dedupe Chromium command is green: it passed with 117 passed and 2 skipped after the LM-G006 dedupe rate-limit isolation fix and expired-draft focused rerun. Remaining P2 verification gaps are tracked in `verification.json` and `runtime-verification.md`.
