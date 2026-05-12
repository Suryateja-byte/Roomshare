# 12 Gaps, Unknowns, And Questions

| ID | Severity | Status | Gap or unknown | Evidence |
| --- | --- | --- | --- | --- |
| LM-G001 | P1 | CLOSED | Listing-edit/status/delete browser coverage gap is closed. Listing-edit legacy skip-only coverage was rewritten or removed for the current host-managed availability edit surface, dedicated owner status-management and non-destructive delete-listing browser specs were added, and the focused listing-edit folder passed 12 with 1 retained dev-server redirect skip. The latest broad Chromium gate is green, and LM-G006 is closed separately. | LM-E019, LM-E024, LM-E031, LM-E040, LM-E041, LM-E042, LM-E043, LM-E044, LM-E049 |
| LM-G002 | P2 | PARTIAL | Direct API route-handler/security tests passed on 2026-05-10 for status codes, status cache header, auth/ownership, CSRF helper rejection, idempotency, and duplicate-submit/collision behavior; live Next server/curl checks for mutation cache/header behavior and route-level CSRF rejection were not run. | LM-E005, LM-E007, LM-E011, LM-E013, LM-E014, LM-E015, LM-E022 |
| LM-G003 | P2 | PARTIAL | Focused API/action, broader direct API/security, and selected browser regression coverage has pass/fail evidence, but component, schema, and other non-browser tests outside those commands still have no pass/fail result from this pass. The selected broad browser gate is green as of LM-E049. | LM-E003, LM-E004, LM-E007, LM-E018, LM-E019, LM-E021, LM-E022, LM-E026, LM-E049 |
| LM-G004 | P2 | PARTIAL | Relevant migrations were discovered by path, but migration SQL was not line-audited for every listing/canonical-inventory invariant. | LM-E020 |
| LM-G005 | P2 | NOT VERIFIED | Storage cleanup is source-observed as best effort; provider-level cleanup success/failure was not runtime verified. | LM-E004, LM-E012, LM-E013 |
| LM-G006 | P1 | CLOSED | Latest full create/listing-edit/dedupe Chromium gate is green after focused diagnosis. The dedupe failures were generic create-listing rate-limit masking from persistent `RateLimitEntry` state and were fixed with non-production dedupe-suite rate-limit isolation; the expired-draft failure did not reproduce in a focused rerun. Final selected Chromium gate passed with 117 passed and 2 skipped. | LM-E044, LM-E045, LM-E046, LM-E047, LM-E048, LM-E049 |

## Browser Failure Taxonomy

| Cluster | Severity | Status | Classification | Evidence |
| --- | --- | --- | --- | --- |
| Create-listing move-in date remains placeholder after clicking `Today` | P1 | FIXED/VERIFIED | Product bug with test-helper exposure fixed. The form and schema now use local date-only boundaries, the page object asserts the browser-local `Today` label, `create-listing.spec.ts` passed 20/20, and later broad gates no longer report the 41-test date/minDate cluster. | LM-E027, LM-E028, LM-E034, LM-E035, LM-E037, LM-E040, LM-E044 |
| Create-listing post-publish create/redirect cleanup | P2 | UNKNOWN/INTERMITTENT | Prior non-date image URL failure from LM-E035 was not reproduced. During visual-fix verification, the full create-listing-folder command twice saw `POST /api/listings` return 201 but no redirect before `expectCreatedListingId()` timed out; targeted post-publish and later broad-gate reruns did not report this cluster after local orphan cleanup. | LM-E035, LM-E037, LM-E039, LM-E040, LM-E044 |
| Dedupe create-collision helper 404 | P2 | FIXED/VERIFIED | Seed/setup issue fixed for Playwright-managed server runs. The config now enables helpers for dedupe runs and supplies the same non-production fallback secret to the Playwright worker process and managed Next server. Focused create-collision and dedupe-folder reruns passed, and later broad gates had no dedupe helper 404 failures. | LM-E029, LM-E036, LM-E037, LM-E040, LM-E044 |
| Dedupe canonical card body click | P2 | UNKNOWN/PRIOR | Prior focused product/test interaction issue. The canonical href was correct and the detail route returned 200 in LM-E030; the failure was not reproduced in the dedupe-folder rerun or later broad gates. | LM-E030, LM-E036, LM-E037, LM-E040, LM-E044 |
| Create-listing visual mismatches | P2 | FIXED/VERIFIED | Test artifact/stale baseline plus one scroll-state issue. V-002/V-002m/V-005 baselines were refreshed to current UI behavior; V-003 now scrolls back to the title field after `fillRequiredFields()` scrolls to move-in date. Focused visual verification passed 7/7 and later broad gates did not report visual mismatches. | LM-E032, LM-E035, LM-E037, LM-E038, LM-E039, LM-E040, LM-E044 |
| Create-listing expired draft clearing | P1 | CLOSED/NOT REPRODUCED | Prior broad-gate failure. The focused expired-draft rerun passed 1/1, and the final broad Chromium gate passed. No product-code fix was made for this path in this slice. | LM-E044, LM-E048, LM-E049, LM-G006 |
| Dedupe create-collision rate limit | P1 | CLOSED/VERIFIED | Broad-suite test-environment issue fixed. Five collision modal specs expected 409 collision responses but received generic 429 rate-limit responses because persistent `RateLimitEntry` state for `/api/listings` had reached the active-window limit. Dedupe runs now use the existing non-production generic limiter bypass so collision-specific 409 and moderation 429 behavior remains visible. | LM-E044, LM-E045, LM-E046, LM-E047, LM-E049, LM-G006 |
| Listing-edit skipped coverage | P2 | CLOSED/VERIFIED | Coverage gap closed for current behavior. The spec was rewritten for host-managed availability, legacy retired-surface skip-only checks were removed or rewritten, and the listing-edit folder passed 12 with 1 retained LE-01 dev-server redirect skip. | LM-E027, LM-E031, LM-E041, LM-E043 |
| Listing status/delete browser coverage | P2 | CLOSED/VERIFIED | Dedicated browser coverage added and passed 2/2 for owner status changes plus non-destructive delete preflight, warning, password-modal, and cancel behavior. | LM-E024, LM-E042, LM-E043 |
| Runtime warning/page-error noise | P3 | UNKNOWN | Non-blocking for current failure classification; warnings and one performance.measure page error were observed but not tied to focused failures. | LM-E033 |

## Recommended Fix Order

1. Keep the full create/listing-edit/dedupe Chromium command in the release gate; it is green as of LM-E049.
2. Revisit LE-01 if the Next dev-server unauthenticated redirect behavior can be made deterministic in E2E.
3. Keep the post-publish search redirect/cleanup path on watch with a targeted rerun if the full create-listing-folder command flakes again.
4. Run the remaining live HTTP/curl, broader component/schema, migration SQL, and storage-provider checks when those P2 gaps are in scope.

## Product Questions

| Question | Why it matters | Evidence |
| --- | --- | --- |
| Should `can-delete` continue returning `activeBookings: 0` and `pendingBookings: 0` while booking execution is out of scope? | The endpoint shape exposes booking counts even though this package found only zero constants for those fields. | LM-E014 |
| Should migration SQL line audit be required before release sign-off for canonical inventory invariants? | Source code syncs canonical availability, but this pass did not prove every database invariant from migrations. | LM-E007, LM-E020 |
