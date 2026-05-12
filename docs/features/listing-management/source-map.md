# Listing Management Source Map

| Area | Source evidence | Current claim |
| --- | --- | --- |
| Create route page | LM-E001 | `/listings/create` is auth-only and renders `CreateListingForm` after profile-completion lookup and optional warning. |
| Create client state | LM-E002, LM-E003 | The create form owns draft persistence, navigation guard, submit preconditions, field errors, collision modal state, success clearing, and redirect. |
| Image uploads | LM-E004 | Listing images are uploaded through `/api/upload`, filtered by MIME type and 5 MB client limit, capped at 10, and removed with best-effort storage delete. |
| Create API | LM-E005, LM-E006, LM-E007 | `POST /api/listings` is the authoritative create path with CSRF/rate/auth/profile gates, validation, geocode, image ownership, collision/idempotency, canonical availability, dirty/search side effects, and no-store success response. |
| Edit page and client | LM-E008, LM-E009, LM-E010 | `/listings/[id]/edit` is owner-only and the edit form has separate host-managed availability and listing profile submit paths. |
| Update API | LM-E011, LM-E012 | `PATCH /api/listings/[id]` handles host-managed availability and profile updates with ownership, locks, version checks, validation, canonical sync, dirty marker, and image cleanup. |
| Delete API | LM-E013, LM-E014 | Delete requires auth, CSRF, rate limit, confirmation, row lock, ownership, and suppresses reported listings instead of hard-deleting them. |
| Status server action | LM-E015 | Host status updates are row-locked, version-checked, moderation-lock-aware, dirty-marked, and revalidated. |
| Validation schemas | LM-E016 | Shared Zod schemas define create field limits, image URL restrictions, image count requirement, listing enums, and client/API validation split. |
| Data model | LM-E017 | Prisma models define listing status, listing fields, saved listing relation, location, idempotency keys, and canonical listing inventory projection. |
| Moderation locks | LM-E018 | Host writes can be blocked for moderation reasons with a `LISTING_LOCKED` 423 response shape. |
| Tests | LM-E019, LM-E021, LM-E022, LM-E026, LM-E034, LM-E038, LM-E039, LM-E040, LM-E045, LM-E046, LM-E047, LM-E048, LM-E049 | Existing tests were discovered for create listing, listing edit, status, API, image/collision, dedupe, and schema behavior; focused API/security and selected browser commands have pass/fail evidence, the selected create/listing-edit/dedupe Chromium gate is green, and remaining component/schema paths are still tracked as gaps. |
| Migrations | LM-E020 | Relevant listing/inventory/search/migration files were discovered; migration content line audit remains a P2 gap. |
