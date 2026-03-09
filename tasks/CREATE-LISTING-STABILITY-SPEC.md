# CREATE-LISTING-STABILITY-SPEC.md

## Objective

Systematically audit the Roomshare create listing page for **runtime stability risks** — conditions that could cause data corruption, orphaned resources, duplicate listings, abuse vectors, or unrecoverable error states in production. This audit covers the full stack: React component state, image upload pipeline, form validation chain, API route authorization, database transactions, and external service integrations.

**Why now:** The create listing page is the primary write path (~5,300 LOC across 23+ production files). Unlike the search page (read-only), failures here have **permanent side effects**: orphaned images in Supabase Storage, duplicate listings from retries, corrupt geocoded data, or bypassed abuse controls. The form uses ~20 `useState` hooks with no form library, manual validation that diverges from the server schema, and external dependencies on Supabase Storage, Nominatim geocoding, and PostGIS — each of which can fail independently.

**What "stable" means:** The create listing page can handle any form interaction sequence — rapid submission, upload cancellation, draft restoration, concurrent tabs, service failures, abuse attempts — without creating duplicate/orphaned/corrupt data or leaving the UI in an unrecoverable state. Every state transition must be validated server-side. Every external call must have a timeout, a catch, and a degradation path.

---

## Priority Tiers

Not all risks are equal. This audit is organized by blast radius and likelihood.

| Tier | Blast Radius | Likelihood | Audit Depth | Examples |
|------|-------------|------------|-------------|----------|
| **P0 — Ship-blockers** | Duplicate/corrupt data, security bypass | Medium-High | Full trace + test | Optional idempotency (3f), TOCTOU max listings (4f), double-submit (3a), navigation guard vs redirect (6c) |
| **P1 — User-visible degradation** | Feature broken or confusing UX, resource leak | Medium | Code trace + boundary test | Upload race (2a), orphaned images (2b), stale draft (1d), geocoding timeout (5a), draft save lost (6a) |
| **P2 — Defense-in-depth** | Latent risk, would compound under load | Low-Medium | Code trace | Validation divergence (1a), blob URL lifecycle (2e), EXIF PII (5e), concurrent tabs (6e) |
| **P3 — Papercuts** | Minor or already-mitigated | Low | Quick verify | Character counter sync (1e), missing CAPTCHA (4e), structured logging gaps (8f) |

Items marked **[P3-SKIP]** are provably safe from code reading and should be verified in <5 minutes, then moved on.

---

## Data Consistency Invariants (define BEFORE auditing)

Every audit needs a clear contract. If you don't define "correct," you can't find "wrong."

| ID | Invariant | Source of Truth |
|----|-----------|-----------------|
| **INV-1** | Server is sole validation authority | `createListingApiSchema` in `schemas.ts:133` |
| **INV-2** | No duplicate listings from same intent | `withIdempotency()` + `isSubmittingRef` client guard |
| **INV-3** | Image URLs must be Supabase-verified | `supabaseImageUrlSchema` host-pinned regex at `schemas.ts:61–80` |
| **INV-4** | Auth chain is fail-closed | Rate limit `route.ts:88` → auth `:94` → suspension `:113` → email `:119` → user `:125` → profile `:137` → Zod `:164` → language `:183` → geocode `:207` → max listings `:244` |
| **INV-5** | Draft state is ephemeral | localStorage with 24h expiry in `useFormPersistence.ts:27` |
| **INV-6** | Upload state independent of form state | Images uploaded via `/api/upload`, referenced by URL in form |
| **INV-7** | Every listing has geocoded coordinates | `geocodeAddress()` returns null → 400 at `route.ts:209–217` |
| **INV-8** | availableSlots = totalSlots on creation | Hardcoded at `route.ts:236` — no separate input |
| **INV-9** | Image URLs must belong to submitting user's namespace | `supabaseImageUrlSchema` validates URL shape but NOT user ownership — **audit gap** |

---

## Scope

### Page Routes & Layout
- `src/app/listings/create/page.tsx` — SSR entry
- `src/app/listings/create/CreateListingForm.tsx` (947 lines) — main form, 20+ useState hooks, draft persistence, navigation guard, submit pipeline
- `src/app/listings/create/error.tsx` (52 lines) — error boundary with Sentry capture

### API Routes
- `src/app/api/listings/route.ts` (389 lines) — POST handler: auth chain, Zod validation, language compliance, geocoding, transaction with FOR UPDATE, side effects
- `src/app/api/upload/route.ts` (250 lines) — POST: file upload to Supabase Storage; DELETE: image removal with path traversal fix

### Core Components
- `src/components/listings/ImageUploader.tsx` (446 lines) — drag-drop, sequential upload, AbortController, blob URL lifecycle, retry failed uploads
- `src/components/CharacterCounter.tsx` — character count display for text fields

### Hooks
- `src/hooks/useFormPersistence.ts` (155 lines) — localStorage draft save with 500ms debounce, 24h expiry
- `src/hooks/useNavigationGuard.ts` (152 lines) — beforeunload + pushState monkey-patch + popstate sentinel

### Validation & Schemas
- `src/lib/schemas.ts` (173 lines) — `createListingApiSchema`, `supabaseImageUrlSchema`, `moveInDateSchema`, `noHtmlTags`

### Business Logic
- `src/lib/idempotency.ts` — `withIdempotency()`: SHA-256 body hash, 3 retries with exponential backoff
- `src/lib/listing-language-guard.ts` — `checkListingLanguageCompliance()` for title/description
- `src/lib/profile-completion.ts` — `calculateProfileCompletion()`, minimum 60% threshold
- `src/lib/geocoding.ts` — `geocodeAddress()` with circuit breaker
- `src/lib/geocoding/nominatim.ts` — Nominatim API integration
- `src/lib/search/search-doc-sync.ts` — `upsertSearchDocSync()` for immediate search visibility
- `src/lib/search/search-doc-dirty.ts` — `markListingDirty()` for cron-based backup sync
- `src/lib/search-alerts.ts` — `triggerInstantAlerts()` for saved search notifications

### External Services
- Supabase Storage — image upload/delete/public URL
- Nominatim — address geocoding via circuit breaker
- PostGIS — `ST_SetSRID(ST_MakePoint(...))` spatial data

---

## Stability Risk Categories

### 1. Form State & Validation Integrity

#### 1a. [P2] Client-Server Validation Divergence

**Risk:** Client validates in `executeSubmit` (CreateListingForm.tsx:283–297) with ad-hoc checks. Server validates with `createListingApiSchema` (schemas.ts:133). If client is more permissive, user sees server errors after waiting for upload+geocoding round-trip.

**Specific concerns:**
- Client checks `title` presence implicitly via FormData but not 100-char max. HTML `maxLength={100}` attribute constrains input but isn't a validation check — user can bypass via DevTools.
- Client checks `successfulImages.length === 0` (line 294) but not max 10. Server checks `.max(10)` at schemas.ts:83.
- Client has no price max (50000) or totalSlots max (20) check — these are server-only via Zod (schemas.ts:116, 119).
- `noHtmlTags` regex (schemas.ts:110) runs only on server. Client accepts `<script>alert(1)</script>` in title.
- `moveInDateSchema` refine at schemas.ts:94–98 rejects past dates — client has no equivalent date validation.

**Audit method:**
1. Diff client validation in `executeSubmit` (lines 283–297) against Zod schema (schemas.ts:113–142)
2. List all server-only validations that could surprise the user after a long submit round-trip
3. Assess UX impact: user fills form → uploads images (30s) → geocoding (2s) → server rejects for HTML tag in title → user frustrated

#### 1b. [P2] Field Error Propagation Mismatch

**Risk:** Server returns `{ fields: { "title": "..." } }` (route.ts:166–172). Client maps to `document.getElementById(firstErrorKey)` (CreateListingForm.tsx:349). If server field name differs from HTML `id`, focus fails silently.

**Specific concerns:**
- Zod uses `issue.path[0].toString()` (route.ts:169). Current schema uses array-level `.refine()` for amenities/houseRules (schemas.ts:117–118), so `path[0]` is `"amenities"` not `"0"`. This is correct for the current schema — per-item array errors would produce numeric paths, but the current schema only validates the array as a whole.
- Verify all `path[0]` values from Zod (`title`, `description`, `price`, `amenities`, `houseRules`, `totalSlots`, `address`, `city`, `state`, `zip`, `images`, `leaseDuration`, `roomType`, `genderPreference`, `householdGender`, `householdLanguages`, `primaryHomeLanguage`, `moveInDate`) match HTML element `id` attributes in the JSX.
- Extended schema fields (`leaseDuration`, `roomType`, etc.) may not have matching element IDs if they use Select components without explicit `id` props.

**Audit method:**
1. List all Zod schema field names from `createListingApiSchema`
2. Search CreateListingForm.tsx for each field name as an HTML `id` attribute
3. Identify mismatches where `document.getElementById(fieldName)` would return null → focus fails silently

#### 1c. [P2] Array Normalization Round-Trip

**Risk:** Client sends `amenities` as a string value from controlled state (CreateListingForm.tsx:327). Server pre-normalizes arrays to strings (route.ts:156–161). Zod splits on comma (schemas.ts:117). Double-join if client sends array AND server joins it.

**Specific concerns:**
- `body.amenities` could be string (from `JSON.stringify`) or array. The `if (Array.isArray(body.amenities))` guard (route.ts:156) handles arrays, but what if body contains `"amenities": "wifi,parking,"` with trailing comma? Zod `.filter((s) => s.length > 0)` (schemas.ts:117) handles this.
- Client sends `amenities: amenitiesValue || undefined` (line 327). If `amenitiesValue` is empty string, `||` converts to `undefined`. Server schema has no `.optional()` on amenities — Zod would fail with "required" error. Verify: does an empty `amenitiesValue` cause validation failure?
- `houseRules` has `.optional().default("")` (schemas.ts:118) so empty string is safe. But `amenities` does not — asymmetric handling.

**Audit method:**
1. Trace full path: client `amenitiesValue` → `JSON.stringify` → server body parse → `Array.isArray` guard → Zod transform
2. Test edge cases: trailing commas, empty strings, single items, `undefined` vs empty string
3. Verify amenities vs houseRules optionality symmetry

#### 1d. [P1] Draft Restoration with Stale Values

**Risk:** Draft saved with valid data becomes invalid after time passes (moveInDate expires, amenity removed from allowlist, image URLs expired or deleted).

**Specific concerns:**
- `restoreDraft()` (CreateListingForm.tsx:170–210) sets state without re-validation. Restored `moveInDate` in the past passes client check (no client date validation) but fails server `moveInDateSchema` refine (schemas.ts:94–98). User discovers error only after full submit round-trip.
- Restored `amenities` no longer in `VALID_AMENITIES` — fails server validation with cryptic error.
- Restored image URLs (line 192–200) reference Supabase URLs that may have been manually deleted or expired. `previewUrl` is set to `uploadedUrl` — no validity check.
- 24h expiry (useFormPersistence.ts:27) limits staleness window but doesn't prevent it within that window.

**Audit method:**
1. Read `restoreDraft()` — verify no validation occurs on restored data
2. List fields that become stale within 24h: `moveInDate` (today+1 becomes past tomorrow), amenities (if server-side list changes), image URLs (if manually deleted)
3. Assess: should `restoreDraft()` validate and warn, or is server-side rejection acceptable UX?

#### 1e. [P3] Character Counter vs Zod Limits Sync

**Risk:** `CharacterCounter` component shows max length. If max doesn't match Zod schema, user may over-type and see confusing error.

**Specific concerns:**
- `DESCRIPTION_MAX_LENGTH = 1000` (CreateListingForm.tsx:124) matches `schemas.ts:115` `.max(1000)` — currently in sync.
- Title has no `MAX_LENGTH` constant — relies on `maxLength={100}` HTML attribute. Zod max is also 100 (schemas.ts:114). Currently in sync but no single source of truth.
- If either side changes without the other, user sees `maxLength` enforced client-side but different limit server-side.

**Audit method:** Compare all client max-length constants/attributes against Zod schema limits. Verify they reference the same values or are provably in sync.

#### 1f. [P2] FormData vs JSON Body Mismatch

**Risk:** `executeSubmit` reads form via `new FormData(formRef.current)` (line 312) then overlays with state variables (lines 327–336). If a controlled component's state diverges from the underlying `<input>` value, the FormData read gets stale/wrong data.

**Specific concerns:**
- `Object.fromEntries(formData.entries())` (line 313) flattens — duplicate keys lose values. Multi-value fields (checkboxes with same name) would lose all but the last value.
- Select components (`roomType`, `leaseDuration`) use controlled state but may not have matching hidden inputs in the DOM. The `...data` spread from FormData is overridden by explicit state vars anyway (lines 327–336), so FormData read may be unnecessary/misleading.
- The pattern reads FormData (possibly stale/incomplete) then overwrites with state — the FormData read is effectively dead code for fields that have explicit state overrides.

**Audit method:**
1. Trace what `formData.entries()` actually captures vs what the explicit state vars override
2. Determine if FormData read is redundant (all critical fields overridden by state)
3. Identify any fields that rely solely on FormData and have no state override — these are vulnerable to stale data

#### 1g. [P2] Price Decimal Precision Edge Case

**Risk:** Zod `z.coerce.number()` (schemas.ts:116) accepts `99.999` → stored as `Decimal(10,2)` in Prisma → rounded to `100.00`. User sees different price than entered.

**Specific concerns:**
- Client `<input type="number">` allows any decimal precision. Server Zod has `.positive().max(50000)` but no `.multipleOf(0.01)` constraint.
- Prisma `Decimal(10,2)` silently rounds — no validation error, just unexpected stored value.
- Edge case: `price: "50000.001"` passes Zod `.max(50000)` check (50000.001 > 50000 — actually this WOULD fail). But `price: "49999.999"` passes Zod, stored as `50000.00`.

**Audit method:**
1. Test: submit `price: "99.999"`. Verify what Prisma stores and what user sees on listing page.
2. Check if Zod `.max(50000)` comparison happens before or after rounding.
3. Verify `z.coerce.number()` behavior with strings like `"99.999"`.

---

### 2. Image Upload Pipeline

#### 2a. [P1] Concurrent Upload Race

**Risk:** User selects 5 files (batch A starts uploading sequentially). Before batch A completes, user selects 3 more files (batch B). `processFiles` (ImageUploader.tsx:92) creates new `AbortController` (line 135) that overwrites `uploadControllerRef` — silently orphans batch A's controller.

**Specific concerns:**
- `uploadControllerRef.current = controller` (line 136) replaces without aborting previous. Batch A's `for...of` loop (line 138) continues with old controller reference. Batch A images may complete uploading with the old controller, or batch A may be mid-upload when batch B's controller is set.
- No mutex/queue prevents concurrent `processFiles` execution. Both batches run their `for...of` loops concurrently.
- If user later calls `cancelUploads()` (line 237–239), only batch B's controller is aborted — batch A continues silently.
- After batch A finishes, `uploadControllerRef.current = null` (line 160) clears batch B's controller — batch B can no longer be cancelled.

**Audit method:**
1. Read `processFiles` lines 92–162. Trace what happens when called twice rapidly.
2. Verify: is the old controller aborted before replacement at line 136?
3. Simulate: select 5 files → wait 1s → select 3 more. How many controllers exist? Can all uploads be cancelled?

#### 2b. [P1] Orphaned Images in Supabase Storage

**Risk:** User uploads images to Supabase, then abandons the form via: (a) voluntary navigation away, (b) tab close, (c) account suspension after upload. In all cases, images persist in storage indefinitely with no cleanup.

**Specific concerns:**
- `removeImage` (ImageUploader.tsx:171–178) revokes blob URL but does NOT call DELETE `/api/upload` to remove from Supabase. Removing an image from the form leaves the file in storage.
- Navigation guard warns on tab close but can't prevent it. `beforeunload` (useNavigationGuard.ts:81–85) shows browser dialog but user can still leave.
- No server-side cleanup job for orphaned images. No cron or lifecycle hook scans for images not referenced by any listing.
- Suspended users' uploads persist indefinitely — suspension check (route.ts:113–116) prevents listing creation but doesn't trigger image cleanup.
- If listing creation fails after images are uploaded, those images are orphaned.

**Audit method:**
1. Trace `removeImage` function — does it call server DELETE? Search for Supabase delete calls in ImageUploader.
2. Search codebase for any cron/cleanup job for orphaned images.
3. Verify: when listing creation fails at any point in the auth chain, are uploaded images cleaned up?
4. Estimate storage cost: if 100 abandoned forms/month × 3 images × 2MB average = 600MB/month cumulative leak.

#### 2c. [P2] Image URL Validation Bypass

**Risk:** `supabaseImageUrlSchema` regex (schemas.ts:61) validates URL structure. An attacker could craft a URL matching the pattern but pointing to a different Supabase project.

**Specific concerns:**
- Host pinning via `getExpectedSupabaseHost()` (schemas.ts:64–68) reads `NEXT_PUBLIC_SUPABASE_URL`. If env var is missing or empty, `return true` at line 75 **skips host validation entirely**.
- Path regex `[\w./-]+` (schemas.ts:61) includes `/` which technically allows path segments like `/../other-bucket/`, but `new URL(url)` parsing (line 77) normalizes path traversal — verify this normalization prevents bypass.
- The regex is case-insensitive (`/i` flag) — `HTTPS://` prefix accepted.

**Audit method:**
1. Test regex with edge cases: `../` in path, different project ref, non-standard port
2. Verify: what happens when `NEXT_PUBLIC_SUPABASE_URL` is empty in test/staging environments?
3. Confirm `new URL(url).host` comparison (line 78) correctly pins to the expected Supabase project

#### 2d. [P2] Upload Abort Partial File

**Risk:** Client aborts upload mid-stream. Supabase may have already received and stored partial data, or completed the upload server-side after client abort.

**Specific concerns:**
- `uploadFile` passes `signal` to `fetch` (ImageUploader.tsx:77). Abort cancels the fetch but the `/api/upload` route may have already called `supabase.storage.upload()` (upload/route.ts:132–137). Server-side abort of Supabase call is not implemented — no signal passed to `supabase.storage.upload()`.
- Supabase `upsert: false` (upload/route.ts:136) means partial uploads are either fully stored or rejected — no partial files. But a completed upload whose client-side response was aborted is an orphaned file.

**Audit method:**
1. Read upload route — does it pass any abort signal to `supabase.storage.upload()`?
2. Verify: if client aborts after server starts `supabase.storage.upload()`, is the file stored?
3. If yes, this is an orphan (same as 2b) — client never receives the URL.

#### 2e. [P2] Blob URL Lifecycle & Unmount Race

**Risk:** `URL.createObjectURL(file)` (ImageUploader.tsx:122) creates blob URLs. If not revoked on remove or unmount, they leak memory. Additionally, `imageUrlsRef` is updated in a `useEffect([images])` (line 232) — if unmount happens between render and effect, ref has stale URLs.

**Specific concerns:**
- `removeImage` (line 171–178) revokes if `!imageToRemove.uploadedUrl?.startsWith('http')` — correct. Restored images have Supabase URLs (http), not blob URLs.
- Unmount cleanup (lines 242–252) revokes all blob URLs via `imageUrlsRef.current` filtered by `url.startsWith('blob:')`. This covers the normal case.
- Concurrent mode risk: if unmount happens after render but before the `useEffect([images])` at line 232 updates `imageUrlsRef.current`, the ref misses the last batch of URLs. Those blob URLs leak.
- `sizeErrorTimerRef` IS cleared in unmount cleanup (line 250) — no leak there.

**Audit method:**
1. Trace blob URL lifecycle: creation (line 122) → ref tracking (lines 231–234) → revocation on remove (line 174) and unmount (lines 245–248)
2. Verify: can `useEffect([images])` at line 232 be replaced with synchronous ref update to eliminate the race?
3. Count: in the worst case (10 images × 5MB each = 50MB), how significant is the blob URL leak?

#### 2f. [P1] Partial Upload on Submit

**Risk:** User has 3 images uploading, clicks submit. `executeSubmit` checks `stillUploading` (CreateListingForm.tsx:289–292) and shows error. But the dialog flow for failed images could allow submission with incomplete data.

**Specific concerns:**
- `stillUploading = uploadedImages.some(img => img.isUploading)` (line 280) is derived from render-time state. This is correct — React re-renders with updated state.
- `showPartialUploadDialog` (line 299–301) shows dialog when `failedImages.length > 0 && !forceSubmit`. User can click confirm to proceed via `handleConfirmPartialSubmit` (line 387–390) which calls `executeSubmit(true)`.
- When `forceSubmit = true`, `successfulImages` (line 278) filters to only images with `uploadedUrl && !error`. Verify this correctly excludes failed images from the submitted payload.
- Verify `imageUrls` at line 329 only includes successful images: `successfulImages.map(img => img.uploadedUrl as string)`.

**Audit method:**
1. Read `executeSubmit` flow for the partial upload dialog path
2. Verify `handleConfirmPartialSubmit` (line 387–390) correctly includes only successful images
3. Test: 5 images, 2 fail → confirm partial submit → verify only 3 URLs sent to server

#### 2g. [P2] Magic Bytes Validation Completeness

**Risk:** `validateMagicBytes` (upload/route.ts:24–35) checks 4 image types. SVG files are not checked (SVG is text/xml — different attack surface, but SVG is also not in `allowedTypes`).

**Specific concerns:**
- `allowedTypes` (upload/route.ts:100) is `['image/jpeg', 'image/png', 'image/webp', 'image/gif']`. SVG excluded — correct.
- WebP magic bytes check: RIFF header at offset 0 + WEBP at offset 8 (upload/route.ts:18–21). 12-byte validation.
- GIF checks `GIF8` (4 bytes at offset 0) — covers both GIF87a and GIF89a since both start with `GIF8`.
- JPEG checks `FF D8 FF` (3 bytes). PNG checks `89 50 4E 47` (4 bytes). Standard.
- Polyglot attack surface: a file can pass magic bytes for JPEG but contain embedded HTML/JS after the header. `contentType` is set from declared MIME type (line 135) — Supabase serves with this content type, so browsers shouldn't execute embedded scripts.

**Audit method:**
1. Review magic bytes constants (lines 14–22). Verify WebP 12-byte check covers offset 0 AND offset 8.
2. Verify: if magic bytes pass but file contains embedded scripts after header, does Supabase serve with `Content-Type: image/*` (safe) or does it sniff content type (unsafe)?
3. Check `X-Content-Type-Options: nosniff` header on Supabase responses — prevents MIME sniffing.

#### 2h. [P2] Image Ordering Not Persisted Correctly

**Risk:** User drags images to reorder, but order may not survive draft restoration or state synchronization between ImageUploader and CreateListingForm.

**Specific concerns:**
- `collectFormData` (CreateListingForm.tsx:220–242) serializes images in current `uploadedImages` array order (line 238–240).
- `restoreDraft` (line 192–200) restores in serialized order. Draft round-trip preserves order.
- But: ImageUploader's `images` state and CreateListingForm's `uploadedImages` state are synchronized via `onImagesChange` callback (ImageUploader.tsx:165–169). If ImageUploader reorders internally and calls `onImagesChange`, parent state updates correctly.
- Risk: if the drag-drop reorder doesn't call `setImages` with new order, `onImagesChange` never fires. Verify the drag-drop implementation actually exists and updates state.

**Audit method:**
1. Search ImageUploader.tsx for drag-drop reorder implementation. Does it exist or is it planned?
2. If it exists, verify `setImages` is called with reordered array → triggers `onImagesChange` → parent state updates
3. If it doesn't exist, this item is N/A (images are in upload order only)

#### 2i. [P1] Storage Bucket Public Access & Cross-User URL Injection

**Risk:** Supabase `images` bucket is public (upload/route.ts:161–163 calls `getPublicUrl()`). User B could submit a listing referencing User A's uploaded image URL. `supabaseImageUrlSchema` validates URL structure + host pin but NOT that the image path belongs to the submitting user.

**Specific concerns:**
- Image path is `listings/{userId}/{filename}` (upload/route.ts:129). The `supabaseImageUrlSchema` regex `[\w./-]+` (schemas.ts:61) doesn't verify `userId` matches the submitting user.
- An attacker could: (1) upload one image, (2) extract the URL pattern, (3) guess another user's image URL (timestamps are sequential at line 121, random strings are 13 chars at line 122), (4) submit a listing with the guessed URL.
- The URL pattern includes `listings/` prefix in the regex — but any path under `listings/` is accepted, not just the submitting user's path.
- DELETE handler path traversal fix (upload/route.ts:224–231, comment `P0-01 FIX`) uses strict `startsWith(expectedPrefix)` — this correctly prevents deleting other users' images via DELETE. But the CREATE path doesn't validate ownership.
- Also: can unauthenticated users enumerate/download images from `listings/` paths? If the bucket is public, yes.

**Audit method:**
1. Read `supabaseImageUrlSchema` regex — does it validate the userId segment?
2. Check Supabase bucket RLS policies — is the bucket public-read?
3. Test: submit listing with another user's valid Supabase image URL. Does it succeed?
4. Verify: does the DELETE handler's path traversal regression test exist?

---

### 3. Submission & Idempotency

#### 3f. [P0] Idempotency Key is Optional

**Risk:** If client doesn't send `X-Idempotency-Key` header, the non-idempotent path (route.ts:354–356) is used. A network retry or browser back-then-resubmit could create duplicates.

**Specific concerns:**
- `isSubmittingRef` (CreateListingForm.tsx:100, 284) prevents client-side double-submit. But browser back + resubmit, or network timeout + browser auto-retry, bypasses the client guard.
- The `if (idempotencyKey)` check at route.ts:333 means no server-side duplicate protection without the header. The non-idempotent path at line 356 is `prisma.$transaction(createListingInTx)` — no dedup, no retries.
- Client always sends header (line 322–323: `'X-Idempotency-Key': idempotencyKey`). But: can middleware/proxy strip custom headers? CDN/reverse proxy stripping `X-` headers is uncommon but possible.
- A new `crypto.randomUUID()` is generated per submit (line 316) — each retry generates a new key, so idempotency only protects against concurrent duplicate requests with the SAME key, not sequential retries with different keys.

**Audit method:**
1. Verify client always sends header (CreateListingForm.tsx:322–323)
2. Check if any code path skips the header
3. Verify: does browser native retry (e.g., after timeout) reuse the same fetch request and therefore the same key? Or does it re-execute the JS and generate a new key?
4. Assess: should the non-idempotent path be removed entirely (always require the header)?

#### 3a. [P0] Double-Submit Protection

**Risk:** User clicks submit twice rapidly. Without protection, two listings could be created.

**Specific concerns:**
- `isSubmittingRef.current` guard (CreateListingForm.tsx:284) is a ref, not state — synchronous check prevents double-entry. The guard is the FIRST line of `executeSubmit`: `if (isSubmittingRef.current) return;`.
- `isSubmittingRef.current = true` is set at line 304, AFTER the `stillUploading` and `successfulImages.length` checks (lines 289–302). If both clicks pass those checks before either sets the ref, both could proceed.
- BUT: `executeSubmit` is called synchronously from React event handler. JavaScript is single-threaded — the first call enters `executeSubmit`, hits the checks, sets `isSubmittingRef.current = true` at line 304, all before the second call enters. The second call hits the guard at line 284 and returns.
- `finally` block (line 376–378) resets `isSubmittingRef.current = false` — correct cleanup.

**Audit method:**
1. Verify `isSubmittingRef.current` check (line 284) is before ALL async operations (first `await` is at line 319)
2. Verify `finally` block (line 376–378) resets it
3. Confirm: single-threaded execution means the first synchronous call sets the ref before the second call enters

#### 3b. [P1] Idempotency Key Reuse with Changed Payload

**Risk:** Client generates `crypto.randomUUID()` per submit (CreateListingForm.tsx:316). If user edits form after a failed submit and retries, a NEW UUID is generated — correct. If somehow the same UUID is reused with different payload, `withIdempotency` checks body hash.

**Specific concerns:**
- `withIdempotency` stores SHA-256 hash of request body (`idempotency.ts`). Same key + different hash → returns error. This is correct idempotency semantics.
- The key is generated fresh each submit (`crypto.randomUUID()` at line 316), so reuse is impossible unless UUID collides. UUID v4 collision probability is ~1 in 2^122 — negligible.
- Verify: `withIdempotency` TTL — how long does the idempotency record persist? If it expires, a replayed request with the same key would be treated as new.

**Audit method:**
1. Verify UUID is generated inside `executeSubmit` (not memoized or reused across renders)
2. Read `withIdempotency` — verify hash comparison behavior on key+hash mismatch
3. Check idempotency record TTL and cleanup strategy

#### 3c. [P1] Transaction Timeout Budget

**Risk:** The total request time includes: auth checks → body parsing → suspension check → email check → user lookup → profile check → Zod validation → language compliance → geocoding (EXTERNAL!) → DB transaction (with FOR UPDATE lock + 3 inserts + 1 raw SQL). If geocoding is slow, the overall request may timeout.

**Specific concerns:**
- Geocoding is OUTSIDE the transaction (route.ts:207) — good design. This means geocoding latency doesn't hold DB locks.
- But if geocoding takes 10s and then the transaction takes 5s, total request is 15s+. Vercel serverless has 10s default timeout (60s on Pro plan). No `withTimeout` wrapper on geocoding call.
- Circuit breaker in `geocoding.ts` trips AFTER failures — it doesn't prevent the first slow request. `nominatim.ts` may or may not have fetch timeout.
- No overall request timeout wrapper on the POST handler.

**Audit method:**
1. Read `geocoding.ts` and `nominatim.ts` — verify fetch timeout exists
2. Check Vercel function timeout config (vercel.json or project settings)
3. Verify geocoding is outside transaction boundary (line 207 vs transaction start at line 242)
4. Calculate worst-case request time: auth (~100ms) + body parse (~10ms) + suspension (~50ms) + email (~50ms) + user lookup (~50ms) + profile (~10ms) + Zod (~5ms) + language (~10ms) + geocoding (up to ?s) + transaction (~200ms)

#### 3d. [P1] Post-Transaction Side Effect Isolation

**Risk:** `fireSideEffects` (route.ts:276–322) runs AFTER transaction commit. If an unhandled exception escapes `fireSideEffects`, the listing creation response may not be sent — client receives 500 instead of 201 despite listing being committed.

**Specific concerns:**
- `upsertSearchDocSync` is wrapped in try/catch (lines 279–291) — exception isolated.
- `triggerInstantAlerts` uses `.catch()` (lines 305–311) — fire-and-forget, exception isolated.
- `markListingDirty` uses `.catch()` (lines 314–321) — fire-and-forget, exception isolated.
- `fireSideEffects` itself is `await`ed at lines 352 and 359. If it throws despite individual catches, the exception propagates to the OUTER catch at line 385 (`captureApiError`) — NOT the `txError` catch at line 361.
- Result: listing is committed in DB, but client receives 500 and may retry with a new idempotency key → duplicate listing.

**Audit method:**
1. Verify each side effect has independent error isolation (try/catch or .catch())
2. Verify: can any code path in `fireSideEffects` throw past all the catches? (e.g., `Number(result.price)` at lines 352/359 — could throw if price is not coercible, but it comes from Zod-validated data)
3. Check: if `fireSideEffects` throws, is the listing ID still returned to the client?
4. Assess: should `fireSideEffects` be wrapped in its own try/catch at the call site?

#### 3e. [P2] FOR UPDATE Lock Contention

**Risk:** `SELECT COUNT(*) FOR UPDATE` on all user's listings (route.ts:244–248) holds row locks during the transaction. Under concurrent requests, the second transaction waits.

**Specific concerns:**
- The idempotent path uses `withIdempotency` with 3-retry logic and exponential backoff — handles serialization failures.
- The non-idempotent path (line 356) uses regular `prisma.$transaction` without retries — serialization failures bubble up as 500s.
- `FOR UPDATE` locks ALL the user's ACTIVE/PAUSED listings during the transaction. If user has 9 listings and two concurrent creates, one succeeds and one waits. When the first commits, the second re-reads count (now 10) and throws `MAX_LISTINGS_EXCEEDED`.
- Prisma's default transaction isolation level is READ COMMITTED, not SERIALIZABLE. `FOR UPDATE` provides sufficient protection at this level.

**Audit method:**
1. Compare idempotent path (withIdempotency, 3 retries) vs non-idempotent path (prisma.$transaction, no retries)
2. Verify non-idempotent path handles serialization errors gracefully (does it return a user-friendly error?)
3. Confirm Prisma default isolation level and FOR UPDATE behavior at that level

---

### 4. Authorization & Abuse Prevention

#### 4a. [P2] Auth Check Ordering Efficiency

**Risk:** Rate limiting runs BEFORE auth (route.ts:88). This means unauthenticated requests consume rate limit quota, potentially blocking legitimate users sharing an IP.

**Specific concerns:**
- `withRateLimit(request, { type: 'createListing' })` at line 88 is IP-based (read implementation to confirm). An attacker sending unauthenticated requests from a shared IP (university, office, coffee shop) could exhaust the quota.
- Auth check at line 94 is second — the attacker's requests are rejected at auth but have already consumed rate limit tokens.
- Counter-argument: rate limiting before auth prevents unauthenticated users from hitting the (more expensive) auth check. This is a deliberate design trade-off.

**Audit method:**
1. Read `withRateLimit` implementation — is it IP-based, user-based, or both?
2. If IP-based only: assess risk of unauthenticated quota exhaustion on shared IPs
3. Check: does the rate limit response include `Retry-After` header?

#### 4b. [P2] Profile Completion Race

**Risk:** User opens create listing page (profile 60% complete). In another tab, edits profile to 50%. Submits listing in first tab.

**Specific concerns:**
- Profile check at route.ts:137–142 runs on every submit — it reads current DB state via `prisma.user.findUnique` at line 125–128 with full profile fields. So the second tab's profile reduction IS caught.
- `calculateProfileCompletion` receives the live user record, not a cached version.
- This is correct by design — no race condition. Verify by confirming no caching layer between `prisma.user.findUnique` and the profile check.

**Audit method:** Confirm `calculateProfileCompletion` reads live DB data (via `prisma.user.findUnique` at line 125–128), not cached. Quick verify — likely safe.

#### 4d. [P1] Rate Limit Bypass via IP Rotation

**Risk:** Rate limiting at N requests/period per IP. Attacker rotates IPs to bypass.

**Specific concerns:**
- `withRateLimit(request, { type: 'createListing' })` is IP-based (verify implementation). No user-based rate limit after auth succeeds.
- Max listings check (10 per user, route.ts:249) provides a hard cap but allows 10 listings instantly from 10 different IPs.
- Other abuse controls: auth required + email verified + profile 60%+ complete + language compliance. These are good layered defenses.
- Assess: is a per-user rate limit (e.g., 5/day) needed in addition to per-IP?

**Audit method:**
1. Read `withRateLimit` and `rate-limit.ts` to determine if rate limiting is IP-only or also user-based
2. Enumerate all abuse prevention layers: rate limit → auth → suspension → email → user → profile → Zod → language → max listings
3. Assess if these layers provide sufficient protection without per-user rate limiting

#### 4e. [P3] Missing CAPTCHA

**Risk:** No CAPTCHA on listing creation. Bot could create listings programmatically.

**Specific concerns:**
- Rate limit + max listings (10) + auth + email verification + profile completion (60%) provide layered protection. CAPTCHA may be unnecessary given these gates.
- Cost of CAPTCHA: UX friction, accessibility concerns, dependency on third-party service.
- Without CAPTCHA: determined attacker with verified email + complete profile can create 10 spam listings per account.

**Audit method:** Enumerate all abuse prevention layers. Determine if CAPTCHA adds meaningful value beyond existing controls. This is a product decision, not a stability bug.

#### 4f. [P0] Max Listings TOCTOU Race Safety

**Risk:** Two concurrent requests both check count < 10, both proceed to create. FOR UPDATE lock prevents this IF both read the same rows.

**Specific concerns:**
- `SELECT COUNT(*) FOR UPDATE` (route.ts:244–248) locks ALL user's listing rows (WHERE `ownerId` = userId AND status IN ('ACTIVE', 'PAUSED')). Second concurrent transaction blocks on the lock until first commits.
- After first commits (count now 10), second re-reads count = 10 and throws `MAX_LISTINGS_EXCEEDED`. This is correct.
- Edge case: what if user has 0 listings? `FOR UPDATE` on zero rows locks nothing — the SELECT returns `count = 0` but doesn't hold any row lock. Two concurrent creates could both see count = 0 and both proceed. But the unique constraint on listing creation would likely prevent issues — verify.

**Audit method:**
1. Confirm FOR UPDATE is inside `$transaction` (line 242)
2. Confirm Prisma default isolation level (READ COMMITTED)
3. Critical: test with 0 existing listings — does FOR UPDATE on zero rows provide mutual exclusion? (In PostgreSQL, `FOR UPDATE` with no matching rows provides NO lock — this could be a real TOCTOU gap for the first listing)
4. Test with concurrent requests when user has 9 listings

#### 4g. [P2] Unicode/Homoglyph/Emoji Abuse in Text Fields

**Risk:** `noHtmlTags` regex (schemas.ts:110) catches `<tag>` but not Unicode homoglyphs, zero-width characters, or RTL override characters that could be used for social engineering.

**Specific concerns:**
- Title allows any non-HTML characters up to 100 chars. Zero-width joiners/spaces (U+200B, U+200C, U+200D, U+FEFF) could make titles appear empty visually while passing `min(1)` validation.
- RTL override (U+202E) could reverse displayed text in the title. User sees "moor rof" instead of "for room".
- `trim()` in Zod (schemas.ts:114) removes ASCII whitespace only — zero-width characters are NOT trimmed.
- Emoji in title: "🏠🏠🏠🏠" passes validation but may render inconsistently across platforms.

**Audit method:**
1. Test: title with only zero-width characters — does it pass `min(1)` after `trim()`?
2. Test: title with RTL override prefix — how does it render on listing page?
3. Check: does the language compliance check (`checkListingLanguageCompliance`) catch zero-width or RTL abuse?

#### 4h. [P1] CSP Header Compatibility with Supabase CDN

**Risk:** If the app has `Content-Security-Policy` with `img-src` directives that don't include the Supabase CDN domain, images will fail to load silently after successful upload.

**Specific concerns:**
- CSP is set per-request by `src/proxy.ts` with nonce injection (next.config.ts:86 comment). The `img-src` directive is `'self' data: blob: https:` (csp.ts:32) — this allows ALL `https:` domains.
- Since `https:` is broadly allowed, Supabase CDN images will load. This item is likely a false positive.
- However: verify that `Cross-Origin-Resource-Policy: same-origin` header (next.config.ts:125–127) doesn't block cross-origin Supabase image loading. `CORP: same-origin` only affects resources loaded by OTHER sites fetching from YOUR origin — it doesn't affect your pages loading from Supabase.

**Audit method:**
1. Read CSP `img-src` directive — confirm it includes `https:` which covers Supabase CDN
2. Verify `Cross-Origin-Resource-Policy` doesn't interfere with Supabase image loading
3. Quick verify — likely safe given `https:` allowlist

---

### 5. External Service Resilience

#### 5a. [P1] Geocoding Timeout Chain

**Risk:** `geocodeAddress` (route.ts:207) calls Nominatim via circuit breaker. No timeout wrapper on the geocoding call itself in the route handler. If Nominatim hangs, the entire POST handler hangs until Vercel function timeout.

**Specific concerns:**
- `geocoding.ts` wraps Nominatim with circuit breaker. But circuit breaker only trips AFTER failures — it doesn't prevent the first slow request.
- `nominatim.ts` may or may not have a fetch timeout (e.g., via `fetch-with-timeout` or AbortController with setTimeout).
- No `withTimeout` wrapper at the route level for the geocoding call.
- Vercel serverless default timeout: 10s (Hobby), 60s (Pro). If geocoding takes 30s, the function may timeout with no user-friendly error.

**Audit method:**
1. Read `geocoding.ts` and `nominatim.ts` — verify fetch timeout exists and its duration
2. Check circuit breaker configuration: failure threshold, open duration, half-open behavior
3. Check Vercel function timeout config
4. Calculate: worst-case geocoding latency vs function timeout

#### 5b. [P1] Circuit Breaker Blocking All Creates

**Risk:** 5 consecutive geocoding failures → circuit opens for 30s. ALL listing creation blocked for 30s, even if geocoding service recovers.

**Specific concerns:**
- Circuit breaker returns null when open. `route.ts:209` checks `if (!coords)` and returns 400 with "Could not geocode address". User gets this error even if their address is valid — the circuit is open.
- No half-open state for gradual recovery (verify in `circuit-breaker.ts`).
- User can't distinguish "bad address" from "service temporarily down" — same 400 error message.
- If circuit opens during peak hours, ALL users creating listings are blocked.

**Audit method:**
1. Read `circuit-breaker.ts` — verify: open duration, half-open behavior, failure threshold
2. Check error message differentiation: does the circuit breaker return a different error than geocoding failure?
3. Assess: should the route return 503 (Service Unavailable) with Retry-After when circuit is open, instead of 400?

#### 5c. [P1] Supabase Storage Outage

**Risk:** If Supabase Storage is down, no images can be uploaded. Listing creation requires ≥1 image (schemas.ts:83). Entire create flow is blocked.

**Specific concerns:**
- Upload route (upload/route.ts:132–137) has no timeout on `supabase.storage.upload()`. If Supabase hangs, the upload request hangs.
- Error handling (lines 139–157) catches errors but not timeouts. TypeError check (lines 171–177) catches fetch connection failures → returns 503.
- No circuit breaker for Supabase Storage — unlike geocoding, storage calls have no circuit breaker protection.
- If Supabase is intermittently failing, each upload attempt takes full timeout duration before failing.

**Audit method:**
1. Read upload route — verify timeout behavior of `supabase.storage.upload()`
2. Check: does the Supabase JS client have configurable timeout?
3. Search for circuit breaker usage on Supabase calls
4. Assess: should a circuit breaker protect the upload path?

#### 5d. [P2] PostGIS Raw SQL Safety

**Risk:** `$executeRaw` template literal (route.ts:266–270) uses Prisma's tagged template for parameterization. If accidentally changed to string interpolation, SQL injection becomes possible.

**Specific concerns:**
- Current code uses `` $executeRaw`...` `` (tagged template) which auto-parameterizes via Prisma. This is safe.
- The `$executeRawUnsafe` variant would NOT parameterize — verify no usage in the create listing flow.
- `coords.lng` and `coords.lat` come from `geocodeAddress` return value (line 207), not from request body — safe even if parameterization failed, since geocoding returns numbers.
- The `::float8` casts provide an additional layer — PostgreSQL would reject non-numeric input.

**Audit method:**
1. Grep codebase for `$executeRawUnsafe` — verify no usage in create listing flow
2. Verify `coords` comes from `geocodeAddress` return value (not user input)
3. Quick verify — likely safe by design

#### 5e. [P2] EXIF Metadata PII Leak

**Risk:** User uploads photo with GPS coordinates, camera serial number, or other PII in EXIF metadata. Image stored as-is in Supabase Storage and served publicly.

**Specific concerns:**
- Upload route (upload/route.ts:108–110) converts file to buffer and uploads directly — no EXIF stripping.
- Supabase stores the original file with all metadata intact.
- Public URL (line 161–163) serves original file. Any visitor can download the image and extract GPS coordinates, camera model, timestamp, etc.
- GDPR/privacy implications: user may not realize their location is embedded in photos.
- Mobile phone photos commonly include GPS EXIF data unless the user has disabled it.

**Audit method:**
1. Verify no EXIF processing exists in upload pipeline (grep for `exif`, `sharp`, `jimp`, or image processing libraries)
2. Download a test listing image and check for EXIF metadata
3. Assess: is EXIF stripping needed for privacy compliance? Sharp library can strip metadata server-side.

---

### 6. State Synchronization

#### 6a. [P1] Draft Save Lost on Fast Navigation

**Risk:** `useFormPersistence` debounces saves at 500ms (`DEFAULT_DEBOUNCE_MS` at useFormPersistence.ts:28). If user types and navigates away within 500ms, the last changes are not saved.

**Specific concerns:**
- Navigation guard (useNavigationGuard.ts) warns user but doesn't flush the debounced save. `cancelSave()` is called on successful submit (CreateListingForm.tsx:360) — correct. But on navigation away (user clicks "Leave"), the pending debounced save may or may not fire depending on timing.
- `useDebouncedCallback` from `use-debounce` library: does it fire the pending callback on unmount, or cancel it? If it cancels, the last 500ms of changes are lost.
- The `useEffect` cleanup at CreateListingForm.tsx:255–260 aborts submission and clears redirect timeout, but does NOT flush the debounced save.

**Audit method:**
1. Read `use-debounce` library docs/source — does `useDebouncedCallback` fire or cancel on unmount?
2. If it cancels: user types → navigates within 500ms → clicks "Leave" → last changes lost → user returns to stale draft
3. Assess: should the navigation guard's `onLeave` handler flush the debounced save before allowing navigation?

#### 6b. [P2] Upload State → Form State Callback Timing

**Risk:** `ImageUploader` calls `onImagesChange(images)` in a `useEffect([images, onImagesChange])` (ImageUploader.tsx:165–169). This runs AFTER render, not during. Parent's `uploadedImages` state is one render behind ImageUploader's `images` state.

**Specific concerns:**
- If user adds image (ImageUploader `setImages` updates) and immediately clicks submit, `uploadedImages` in parent might not include the new image yet (effect hasn't fired).
- In practice: React flushes effects synchronously after browser paint for browser events. The "add image" is a user event → ImageUploader renders → effect fires → `onImagesChange` calls `setUploadedImages` → parent re-renders. Submit button click is a separate event, which triggers a new render cycle with updated `uploadedImages`.
- This is safe in practice because the user can't click submit in the same microtask as adding an image.

**Audit method:**
1. Trace: ImageUploader `setImages` → render → `useEffect` fires → `onImagesChange(images)` → parent `setUploadedImages(images)` → parent re-render
2. Confirm: submit cannot proceed before parent state updates (separate event)
3. Quick verify — likely safe due to React event batching

#### 6c. [P0] Navigation Guard vs Successful Submit Redirect

**Risk:** After successful submit, `submitSucceededRef.current = true` (CreateListingForm.tsx:362) disables navigation guard. Then `setTimeout(() => router.push(...), 1000)` (line 367–371) redirects. If the guard's pushState monkey-patch is still active during the 1s window, the redirect could be intercepted.

**Specific concerns:**
- `hasUnsavedWork` (line 151–153) checks `!submitSucceededRef.current` — so after success, `hasUnsavedWork` is false.
- `useNavigationGuard(false, ...)` receives `shouldBlock = false`. The effect at line 69 (useNavigationGuard.ts) checks `if (!shouldBlock)` and returns early (line 70–76), cleaning up sentinel but NOT restoring pushState.
- pushState is only restored when `activeGuardCount` reaches 0 (line 134–136). Since `shouldBlock = false` causes early return without incrementing the count, and the previous effect's cleanup decrements and potentially restores.
- Sequence: `shouldBlock` changes false → effect re-runs → cleanup of previous effect (removes listeners, decrements count, restores pushState if count=0) → new effect runs with `shouldBlock=false` → early return.
- The 1s setTimeout redirect at line 367–371 fires AFTER the effect cleanup runs (cleanup is synchronous in the commit phase). So `router.push` uses the restored native pushState. This should work.

**Audit method:**
1. Trace: `submitSucceededRef.current = true` → next render → `hasUnsavedWork = false` → `useNavigationGuard(false, ...)` → effect re-runs → cleanup restores pushState → setTimeout fires → `router.push` uses native pushState
2. Verify the cleanup runs BEFORE the setTimeout callback
3. Edge case: what if React delays the re-render (concurrent mode)? Could the setTimeout fire before cleanup?

#### 6d. [P2] Draft Banner Without Re-validation

**Risk:** `showDraftBanner` appears when `isHydrated && hasDraft && !draftRestored` (CreateListingForm.tsx:163–167). User restores draft with stale data. No validation feedback shown.

**Specific concerns:**
- `restoreDraft()` (lines 170–210) sets all state values but doesn't validate any field against current constraints.
- User may not notice stale `moveInDate` or removed amenities until submit fails.
- The draft banner shows "Restore draft" and "Start fresh" options but no "Draft may contain outdated data" warning.
- If `moveInDate` was tomorrow when saved, and user restores 23 hours later, it's still valid. But if restored 25 hours later (after 24h draft expiry), the draft is already deleted. So the window for stale moveInDate is actually narrow.

**Audit method:**
1. Read `restoreDraft` — list fields that could become stale within 24h
2. Assess: should draft restoration show warnings for potentially invalid fields?
3. Verify: is `moveInDate` the only field that can become stale within 24h?

#### 6e. [P2] Concurrent localStorage Tabs

**Risk:** Two tabs open create listing page. Both read/write to same `listing-draft` localStorage key. Tab A saves draft, Tab B saves draft — Tab A's data silently overwritten.

**Specific concerns:**
- `useFormPersistence` (useFormPersistence.ts) uses a single key `'listing-draft'` (CreateListingForm.tsx:76, `FORM_STORAGE_KEY`). No tab-specific keying or `storage` event listener for cross-tab sync.
- Each tab reads on mount, then writes every 500ms via debounced save — last writer wins.
- If both tabs restore the same draft, then edit different fields, the last save overwrites the other tab's edits.
- `storage` event is not handled — tab A doesn't know when tab B overwrites the draft.

**Audit method:**
1. Verify key `'listing-draft'` is not tab-specific
2. Check if `storage` event is handled for cross-tab awareness
3. Assess: is this a real UX problem? How common is having two create-listing tabs open simultaneously?

---

### 7. Resource Leaks & Cleanup

#### 7b. [P1] AbortController Leak on Unmount

**Risk:** `submitAbortRef` (CreateListingForm.tsx:101) and `uploadControllerRef` (ImageUploader.tsx:40) hold AbortControllers. If abort causes a rejected promise after unmount, state updates on unmounted components could occur.

**Specific concerns:**
- CreateListingForm cleanup (line 255–260) aborts `submitAbortRef` and clears `redirectTimeoutRef`. Correct.
- ImageUploader cleanup (lines 242–252) aborts `uploadControllerRef`. Correct.
- After abort in `executeSubmit`: `if (err.name === 'AbortError') return` at line 373 — no state update. Correct.
- After abort in ImageUploader's upload loop: `if (error.name === 'AbortError')` at line 148 — clears uploading images via `setImages` at line 150. But component is unmounting — does `setImages` on unmounted component cause issues? React ignores it (no crash, warning in dev).

**Audit method:**
1. Read abort handling in `executeSubmit` (line 372–373) — verify `AbortError` return prevents setState
2. Read ImageUploader abort handling (lines 148–151) — verify no harmful setState after abort during unmount
3. Verify: both cleanup effects run on unmount (empty dependency array effects run cleanup on unmount)

#### 7c. [P1] Navigation Guard Listener Cleanup

**Risk:** `useNavigationGuard` monkey-patches `window.history.pushState` (useNavigationGuard.ts:88–101). If cleanup fails, pushState is permanently intercepted, breaking all Next.js navigation.

**Specific concerns:**
- Cleanup at lines 127–142: removes event listeners, decrements `activeGuardCount`, restores `pushState` when count reaches 0.
- `nativePushState` is captured at module level (line 11) — not affected by monkey-patching. This is correct.
- StrictMode double-mount sequence: mount(1) → cleanup(1) → mount(2). Count: 0→1→0→1. At steady state, count is 1. On final unmount: count → 0, pushState restored. Correct.
- Edge case: if two components use `useNavigationGuard` simultaneously, count goes to 2. First unmount decrements to 1 (doesn't restore). Second unmount decrements to 0 (restores). Correct ref counting.

**Audit method:**
1. Trace StrictMode double-mount sequence: verify `activeGuardCount` correctly tracks
2. Verify `nativePushState` captured at module level (line 11) is not affected by monkey-patching
3. Verify: cleanup restores `window.history.pushState` only when `activeGuardCount === 0`

#### 7d. [P2] Draft Save Debounce Timer Leak

**Risk:** `useDebouncedCallback` from `use-debounce` (useFormPersistence.ts:89–102) creates internal timers. On unmount, pending timer may not be cancelled.

**Specific concerns:**
- `use-debounce` library handles cleanup internally via `useEffect` cleanup. The hook returns a debounced function that can also be cancelled via `.cancel()`.
- `cancelSave` (useFormPersistence.ts:117–119) is `debouncedSave.cancel()` — must be called explicitly before `clearPersistedData` on successful submit. It IS called at CreateListingForm.tsx:360.
- For non-submit unmount (user navigates away): `use-debounce` should cancel internal timers automatically via its `useEffect` cleanup. Verify this in library source/docs.

**Audit method:**
1. Read `use-debounce` library docs/source for unmount cleanup behavior
2. Verify: on component unmount, does `useDebouncedCallback` cancel pending timers?
3. If not: pending `localStorage.setItem` call fires on unmounted component (harmless but wasteful)

#### 7e. [P2] Redirect Timeout Leak

**Risk:** `redirectTimeoutRef = setTimeout(() => router.push(...), 1000)` (CreateListingForm.tsx:367–371). If component unmounts before 1s, the timeout fires on unmounted component.

**Specific concerns:**
- Cleanup at line 258 clears `redirectTimeoutRef` via `clearTimeout`. Correct.
- The timeout checks `!abortController.signal.aborted` (line 368) before navigating. Unmount cleanup aborts the controller (line 257) AND clears the timeout (line 258). Double protection.
- Even if both protections fail: `router.push` on unmounted component is a no-op (Next.js router is page-level, not component-level). No crash.

**Audit method:**
1. Verify cleanup effect (lines 255–260) clears both abort controller and timeout
2. Confirm: both protections are independent (abort + clearTimeout)
3. Quick verify — safe by design with double protection

#### 7f. [P2] sizeErrorTimerRef Cleanup

**Risk:** `sizeErrorTimerRef` (ImageUploader.tsx:39) sets a 5s timeout to clear size error (line 105). Needs cleanup on unmount.

**Specific concerns:**
- Timer set at line 104–105: `sizeErrorTimerRef.current = setTimeout(() => setSizeError(null), 5000)`.
- Previous timer cleared before setting new one (line 104): `if (sizeErrorTimerRef.current) clearTimeout(sizeErrorTimerRef.current)`. Correct — no timer accumulation.
- Unmount cleanup at line 250: `if (sizeErrorTimerRef.current) clearTimeout(sizeErrorTimerRef.current)`. This IS cleared on unmount — no leak.
- Even without cleanup: `setSizeError(null)` on unmounted component is harmless (React ignores it).

**Audit method:**
1. Verify unmount cleanup (line 250) clears sizeErrorTimerRef. Confirmed — this is safe.
2. Quick verify — no leak.

---

### 8. Observability & Error Recovery

#### 8a. [P2] Error Boundary Sentry Coverage

**Risk:** `error.tsx` (listings/create/error.tsx) exists and captures to Sentry. But it only catches SSR/route segment errors — client-side errors in `CreateListingForm` (a `'use client'` component) are NOT caught.

**Specific concerns:**
- Next.js error boundary (`error.tsx`) catches render errors and unhandled throws from server components. It DOES capture to Sentry (line 17–23). It has a "Try again" button (line 38) and "Go to homepage" link (line 42–47).
- Client-side errors in `CreateListingForm` (e.g., `TypeError` during render) would be caught by the error boundary. But errors in event handlers and async operations are NOT caught by React error boundaries.
- `executeSubmit` catches all errors (line 372–375) — no unhandled promise rejections from submit flow.
- Missing: no dedicated error boundary for the form specifically. If a render error occurs inside `ImageUploader` during drag-drop, it bubbles to `error.tsx` and shows the full-page error state.

**Audit method:**
1. Verify `error.tsx` catches both SSR and client render errors (it does — it's a Next.js error boundary)
2. Check: is there a more granular error boundary around `ImageUploader` or other volatile components?
3. Verify: all async operations in `CreateListingForm` have try/catch (executeSubmit at line 318)

#### 8b. [P1] Upload Error Observability

**Risk:** Upload errors are shown client-side (`img.error` state in ImageUploader) but NOT sent to Sentry. If uploads fail en masse, there's no server-side visibility of client-side failures.

**Specific concerns:**
- ImageUploader catches errors (lines 147–158) and sets them in component state. No `Sentry.captureException` call.
- Upload route errors (upload/route.ts:170–179) DO log via `captureApiError` — server-side failures are observable.
- But client-side failures (network timeout before request reaches server, CORS errors, browser offline, CSP blocks) are invisible to the server.
- If Supabase CDN is unreachable from a specific region, uploads fail silently with no server-side signal.

**Audit method:**
1. Search for `Sentry` usage in ImageUploader.tsx — verify none exists
2. Verify: client-side upload failures are NOT observable server-side
3. Assess: should client-side upload errors be reported to Sentry?

#### 8c. [P2] Geocoding Error Message Quality

**Risk:** Geocoding failure returns "Could not geocode address" (route.ts:216). User can't distinguish: invalid address vs service down vs circuit breaker open.

**Specific concerns:**
- All three failure modes return the same 400 response with the same message.
- Invalid address → user should fix input. Service down → user should retry later. Circuit breaker open → user should wait 30s.
- No actionable guidance for the user. No differentiated error codes.
- The geocoding failure IS logged (lines 210–215) with city/state — server has context but user doesn't.

**Audit method:**
1. Read geocoding error path — check if error type is available from `geocodeAddress` return value
2. Check circuit breaker — does it return a different error type when open?
3. Assess: should the route differentiate error messages based on failure type?

#### 8d. [P2] Rate Limit Feedback UX

**Risk:** Rate limit response (429) is returned by `withRateLimit` middleware BEFORE auth. Client receives 429 but `executeSubmit` doesn't specifically handle it — falls into generic error path.

**Specific concerns:**
- `executeSubmit` catch (CreateListingForm.tsx:372–375): checks for `AbortError`, then shows generic error message from response JSON (`json.error`). The rate limit error message depends on what `withRateLimit` returns.
- No `Retry-After` header extraction or display to user. User doesn't know when they can retry.
- No client-side rate limit tracking — user has no proactive warning before hitting the limit.

**Audit method:**
1. Read `withRateLimit` response format — does it include `Retry-After` header?
2. Check: does the error response JSON include a user-friendly message?
3. Verify: client extracts and displays the error message from the 429 response

#### 8e. [P2] Language Compliance Error UX

**Risk:** Language compliance check (route.ts:183–200) returns a message from `checkListingLanguageCompliance`. Is the message user-friendly or does it expose internal detection patterns?

**Specific concerns:**
- The error is returned as `{ error: titleCheck.message }` (line 189). The message content depends on `listing-language-guard.ts` implementation.
- If the message reveals detection logic (e.g., "Non-Latin characters detected at positions 5-12"), it helps attackers craft bypass attempts.
- If the message is too vague (e.g., "Content policy violation"), users can't understand what to fix.

**Audit method:**
1. Read error messages from `checkListingLanguageCompliance` in `listing-language-guard.ts`
2. Verify messages are actionable without revealing detection logic
3. Check: do the messages indicate which field failed (title vs description)?

#### 8f. [P3] Structured Logging Coverage

**Risk:** Some error paths may lack structured logging, making it harder to diagnose production issues.

**Specific concerns:**
- Happy path IS logged (route.ts:368–375): listing ID, user ID (truncated), cached flag, duration. Good.
- Geocoding failure IS logged (lines 210–215): city, state. Good.
- Profile completion failure (lines 138–142): has NO log — returns 403 silently. Missing.
- Suspension check (lines 113–116): has NO log beyond the auth warn at lines 96–99 (which is for missing auth, not suspension). Missing.
- Email verification failure (lines 119–122): has NO log. Missing.
- Max listings exceeded (line 362–364): has NO log — throws error caught by outer handler. Missing structured log.

**Audit method:**
1. List all early-return paths in POST handler
2. Verify each has structured logging with route, method, and relevant context
3. Identify gaps where failures are silent

---

### 9. Parity & Lifecycle

#### 9a. [P1] Edit Listing Flow Parity

**Risk:** If an edit listing route exists (PUT/PATCH), it may not share the same validation, auth chain, idempotency, language compliance, or geocoding requirements as the create flow. Users could create a compliant listing then edit it to violate all constraints.

**Specific concerns:**
- Does an edit route exist? Search for PUT/PATCH handlers for listings.
- If so: does it use `createListingApiSchema` or a different/weaker schema?
- Does it re-run `checkListingLanguageCompliance` on title/description changes?
- Does it re-geocode when address changes? Does it validate the new address?
- Does it check max listings? (Shouldn't need to — editing doesn't create a new listing, but changing status from PAUSED to ACTIVE might matter.)
- Does it have its own idempotency protection?

**Audit method:**
1. Search for PUT/PATCH routes for listings: `grep -r "PUT\|PATCH" src/app/api/listings/`
2. Compare validation, auth chain, and business logic against create flow
3. Document all divergences — each divergence is a potential bypass

#### 9b. [P1] Listing Deletion Image Cleanup

**Risk:** When a listing is deleted, are its Supabase Storage images cleaned up? If not, deleted listings leak storage indefinitely.

**Specific concerns:**
- Prisma `Listing` model likely has cascade delete from User. But cascade delete removes DB rows — it doesn't call Supabase Storage delete. Images at `listings/{userId}/{filename}` persist as orphans.
- If listing is deleted via admin action or user self-service delete, the images remain in Supabase Storage.
- Combined with item 2b (abandoned form images), the storage leak compounds.
- No cron/lifecycle hook scans for images whose parent listings no longer exist.

**Audit method:**
1. Search for listing deletion logic: `grep -r "delete.*listing\|listing.*delete" src/`
2. Check if deletion includes Supabase storage cleanup
3. Check for any cron/lifecycle hook that cleans up images for deleted listings
4. Estimate: if 50 deleted listings/month × 5 images × 2MB = 500MB/month cumulative leak

#### 9c. [P2] Search Index Consistency After Create

**Risk:** After listing creation, `upsertSearchDocSync` (route.ts:280) runs as a side effect. If it fails, the listing exists in the database but is not searchable.

**Specific concerns:**
- `upsertSearchDocSync` failure is caught (lines 286–291) and logged. The listing is still created.
- `markListingDirty` (lines 314–321) is a backup — the cron job will eventually sync the search document.
- Maximum delay before a new listing appears in search depends on: cron job interval + processing time.
- If both `upsertSearchDocSync` AND `markListingDirty` fail, the listing is invisible until the next full sync.

**Audit method:**
1. Read `upsertSearchDocSync` and `markListingDirty` — verify cron fallback path
2. Determine worst-case delay for search visibility
3. Check: is there a health check or alert for search sync lag?

---

## Sample Test Inputs

### Critical Flows
| # | Scenario | Tests | Priority |
|---|----------|-------|----------|
| T1 | Happy path | Full form → submit → redirect → listing visible + searchable | P0 |
| T2 | Double-click submit | Rapid double-click → only 1 listing created | P0 |
| T3 | Upload during submit | Start upload, click submit immediately — verify "wait for uploads" error | P1 |
| T4 | Network failure during submit | Kill network mid-POST → verify error shown, no partial listing | P1 |
| T5 | Draft restoration | Fill half, close tab, reopen → restore draft → verify all fields populated | P1 |
| T6 | Stale draft | Restore draft with moveInDate = yesterday → submit → verify server rejection message | P1 |
| T7 | Concurrent tabs | Submit from 2 tabs simultaneously → verify only 1 listing created (or 2nd gets clear error) | P0 |
| T8 | Suspension mid-flow | Upload images, get suspended by admin, submit → verify 403 + images orphaned | P1 |

### Service Failures
| # | Scenario | Tests | Priority |
|---|----------|-------|----------|
| T9 | Geocoding failure | Enter nonsensical address → verify user-friendly error | P1 |
| T10 | Circuit breaker open | 5 geocoding failures → valid address → verify error message | P1 |
| T11 | Upload cancellation | Cancel mid-upload batch → verify partial images cleaned up | P2 |

### Abuse & Edge Cases
| # | Scenario | Tests | Priority |
|---|----------|-------|----------|
| T12 | Rate limit hit | 6th listing in one day → verify 429 with helpful message | P2 |
| T13 | HTML injection | `<script>alert(1)</script>` in title → verify server rejection | P2 |
| T14 | Max images | 11th image upload attempt → verify rejection | P2 |
| T15 | Large file | 6MB image upload → verify client-side rejection before server round-trip | P2 |
| T16 | Price edge case | `99.999` and `0.001` and `50000.01` → verify storage and display | P2 |
| T17 | Zero-width title | Title with only zero-width characters → verify server rejection or visible warning | P2 |
| T18 | Concurrent upload batches | Select 5 files, then 5 more before first batch completes → verify all handled | P1 |
| T19 | Cross-user image URL injection | Submit listing with another user's valid Supabase image URL → verify rejection or acceptance | P1 |
| T20 | Mobile keyboard-open error | Submit invalid form on 375px viewport with keyboard open — verify error visible above fold | P2 |

---

## Success Criteria

Each risk item receives a finding classification: **CONFIRMED BUG** / **LATENT RISK** / **FALSE POSITIVE (SAFE)**

| Category | PASS Definition |
|----------|-----------------|
| **1. Form State & Validation** | Client validation is a superset of server validation (no surprise server rejections after long upload+geocode round-trip). All Zod field names map to HTML element IDs. Draft restoration either validates or warns about stale data. Array normalization round-trip is idempotent. |
| **2. Image Upload Pipeline** | Concurrent upload batches are handled (no orphaned controllers). Blob URLs are revoked on remove and unmount. Orphaned images have a cleanup path. Cross-user URL injection is prevented. Partial upload on submit correctly filters to successful images only. Magic bytes validation covers all allowed types. |
| **3. Submission & Idempotency** | Double-submit is prevented by client-side ref guard AND server-side idempotency. Non-idempotent path handles serialization errors. FOR UPDATE lock prevents max listing TOCTOU race (including edge case with 0 existing listings). Side effects are individually error-isolated. Transaction timeout budget accounts for geocoding latency. |
| **4. Authorization & Abuse** | Auth chain is fail-closed (all 10 checks). Rate limit works for shared IPs. Max listings race is prevented by FOR UPDATE. Unicode/homoglyph abuse in text fields is addressed. Profile completion check uses live DB data. |
| **5. External Service Resilience** | Every external call (Supabase Storage, Nominatim, PostGIS) has a timeout, a catch, and a user-facing degradation path. Circuit breaker failure is distinguished from invalid input in error messages. EXIF PII risk is documented and assessed. |
| **6. State Synchronization** | Draft save is not lost on fast navigation. Upload state → form state callback timing is safe. Navigation guard cleanup allows successful submit redirect. Concurrent localStorage tabs are documented as known limitation or addressed. |
| **7. Resource Leaks** | Every `setTimeout` has a matching `clearTimeout` in cleanup. Every `AbortController` is aborted on unmount. Every blob URL has a revocation path. Navigation guard's pushState monkey-patch is correctly restored via ref counting. |
| **8. Observability & Error Recovery** | Every error path has structured logging. Upload errors are observable (client-side or server-side). Error messages are actionable without revealing internal logic. Rate limit responses include retry guidance. |
| **9. Parity & Lifecycle** | Edit flow (if it exists) has equivalent validation and authorization. Listing deletion cleans up Supabase images. Search index is eventually consistent with documented maximum delay. |

**Overall verdict:** STABLE if all 9 categories PASS. UNSTABLE if any category FAILS. Each FAIL must include:
- Specific file path and line number
- Root cause description
- Suggested fix (code-level)
- Priority tier (P0/P1/P2/P3)
- Estimated blast radius

---

## Pre-Mortem Analysis (False Positive Risks)

### Items likely safe by design (verify quickly, don't over-invest):
- **3a (double-submit):** JS single-threaded execution makes ref guard sufficient. The guard is set synchronously before any async operation.
- **4b (profile race):** Live DB read per request prevents race. No caching between findUnique and profile check.
- **4f (TOCTOU with ≥1 listings):** FOR UPDATE inside transaction is the correct pattern. Edge case with 0 listings deserves quick verification.
- **2e (blob URL leak):** Cleanup logic is thorough — revocation on remove, unmount, and ref tracking. Concurrent mode race is theoretical.
- **7e (redirect timeout):** Double protection via abort + clearTimeout. Even without both, router.push on unmounted component is harmless.
- **7f (sizeErrorTimerRef):** Timer IS cleared in unmount cleanup at line 250. No leak.
- **4h (CSP headers):** `img-src 'self' data: blob: https:` allows all HTTPS domains including Supabase CDN. Safe.

### Items most likely to yield real bugs:
- **2a (concurrent upload race):** `uploadControllerRef` overwrite without aborting previous controller — verified by code reading.
- **2b (orphaned images):** No server-side cleanup visible in any code path — `removeImage` doesn't call DELETE API.
- **2i (cross-user URL injection):** Schema validates URL shape but not user ownership — verified by reading regex at schemas.ts:61.
- **5e (EXIF PII):** No stripping in upload pipeline — verified by reading upload/route.ts:108–110.
- **1d (stale draft):** No validation on restore — verified by reading restoreDraft at lines 170–210.
- **6a (draft save lost):** Debounce timer behavior on unmount depends on `use-debounce` library implementation.
- **3f (optional idempotency):** Non-idempotent path has no duplicate protection — verified at route.ts:354–356.
- **9b (deletion cleanup):** Cascade delete likely doesn't clean Supabase storage — DB cascade only deletes DB rows.
- **3d (side effect isolation):** If `fireSideEffects` throws, client gets 500 despite committed listing — potential duplicate on retry.
- **4f (TOCTOU with 0 listings):** FOR UPDATE on zero rows may not provide mutual exclusion in PostgreSQL.
