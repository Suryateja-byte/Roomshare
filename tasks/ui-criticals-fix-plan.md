# Plan: Fix 8 Critical UI Issues (2026-06-09 audit)

Source: full-frontend UI audit, 2026-06-09 session. All fixes are frontend-only — no DB migrations, every commit independently revertible.

## Wave 1 — six independent small fixes (parallelizable, one commit each)

### C1. Tailwind v4 token bug — shadcn alias classes compile to nothing
- **Goal:** `text-muted-foreground`, `bg-muted`, `border-border`, `text-foreground` etc. (56 usages, 11 files) currently emit no CSS because the vars live in `:root` not `@theme` (globals.css:108-128).
- **Approach (chosen):** sweep usages to the real token vocabulary and delete the dead alias block — avoids maintaining two parallel vocabularies. Mapping: `text-muted-foreground`→`text-on-surface-variant`, `bg-muted`→`bg-surface-container-high`, `border-border`→`border-outline-variant/20`, `text-foreground`→`text-on-surface`, `bg-background`→`bg-surface-canvas`, `text-card-foreground`→`text-on-surface`. (`bg-destructive`/`text-destructive` already work — defined in @theme.)
- **Files:** globals.css + UserMenu.tsx, neighborhood/NeighborhoodModule.tsx, ProUpgradeCTA.tsx, PlaceDetailsPanel.tsx, ContextBar.tsx, NeighborhoodMap.tsx, DeleteListingButton.tsx, + grep for the rest.
- **Acceptance:** `grep -rE 'muted-foreground|bg-muted|border-border|bg-background|text-foreground' src/` → 0 hits; affected surfaces (neighborhood module, delete-listing confirm) visually correct.
- **Verify:** typecheck, lint, screenshot spot-check of NeighborhoodModule + DeleteListingButton.
- **Risk:** low — class renames only. Note: UserMenu.tsx is dead code (audit #55); sweep it anyway, deletion is a separate task.

### C2. Input/Textarea have zero keyboard focus indicator (WCAG 2.4.7)
- **Goal:** visible focus ring on the bare primitives.
- **Approach:** add `focus-visible:border-primary/35 focus-visible:ring-2 focus-visible:ring-primary/30` to `ui/input.tsx:13` and `ui/textarea.tsx:12` (matching AuthField's treatment at AuthPageChrome.tsx:469). Same fix to `ReviewForm.tsx:579`. Do NOT touch the global unlayered focus rule (systemic item, separate task).
- **Acceptance:** tabbing through /forgot-password, /reset-password, /settings shows a visible ring on every field; no double ring (global rule already excludes inputs).
- **Verify:** lint, typecheck, manual/Playwright keyboard pass on the three pages.
- **Risk:** low.

### C3. Create listing — double-publish window after success
- **Goal:** close the ~1s window where Publish re-enables with a fresh idempotency key (CreateListingForm.tsx:714-740, 1481-1502).
- **Approach:** (a) guard top of `executeSubmit` with `submitSucceededRef.current` early-return; (b) in `finally`, skip `setLoading(false)` / `isSubmittingRef=false` when submit succeeded (button stays disabled until `router.push` lands).
- **Regression test (required — state transition):** component test: successful submit → button stays disabled; second submit call → no second POST.
- **Verify:** `pnpm test:components` (new test), lint, typecheck; manual create-flow happy path.
- **Risk:** low; touches submit state machine → test mandatory per non-negotiables.

### C5. ImageUploader deletes photos from storage on remove, before save
- **Goal:** removing an image must not destroy storage objects until the form is successfully saved (ImageUploader.tsx:202-227).
- **Approach:** replace the immediate `DELETE /api/upload` with a `pendingDeletes: string[]` list; expose it to the parent (callback or return alongside images). Parent fires the deletes only after a successful save. Create flow adopts the same deferral (consistent; an abandoned create already orphans uploads today — unchanged).
- **Note:** the dangerous edit-flow path becomes reachable when C4 restores photo editing — C4 consumes this mechanism, so C5 must merge first.
- **Test:** unit test — remove does not call DELETE; after simulated successful save, deletes fire for exactly the removed URLs.
- **Verify:** test:components, lint, typecheck.
- **Risk:** low-medium (upload lifecycle); orphan cleanup behavior documented above.

### C6. Verification upload keyboard-inaccessible
- **Goal:** both file inputs reachable and operable by keyboard (VerificationForm.tsx:198-213, 261-275).
- **Approach:** `className="hidden"` → `sr-only` on both inputs; add `peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30` (or `focus-within:`) to the styled labels so focus is visible.
- **Acceptance:** Tab reaches document + selfie inputs; Enter/Space opens the file picker; visible focus ring on the dropzone.
- **Verify:** lint, typecheck, manual keyboard pass on /verify.
- **Risk:** trivial.

### C8. Duplicate message bubbles (optimistic + realtime echo)
- **Goal:** sender's own realtime echo must replace the pending optimistic message, never append (ChatWindow.tsx:489-492 vs 647-689).
- **Approach:** extract a pure `mergeIncomingMessage(prev, incoming, currentUserId)` (new `src/lib/messages-merge.ts` or similar): own-sender insert → replace matching pending `opt-` message (by content match) or skip if real id already present; other-sender → append with id dedupe. Use it in both the realtime handler and the send-resolution path so optimistic→real replacement can't collide keys.
- **Recon first:** confirm which transport actually delivers in prod (Neon DB → `postgres_changes` likely dead in prod per project memory; commit 3ff67e1e suggests broadcast channels). The merge function sits below the transport, so it's correct either way — but document the finding.
- **Tests (required):** unit tests for the merge: echo-before-send-resolves, echo-after, other-sender insert, exact duplicate id.
- **Verify:** test:unit, lint, typecheck; manual two-browser send in dev.
- **Risk:** medium (realtime timing); pure-function extraction keeps it testable. This lands the dedupe logic C7 will reuse.

## Wave 2 — C4. Edit page can't edit the listing (frontend-only; API verified ready)

- **Fact verified:** `PATCH /api/listings/[id]` already accepts title/description/price/amenities/images with compliance checks + image-URL validation (route.ts:104-168, 841-915). No backend work.
- **Approach:** restructure the edit page into two sections on one page (recommended over tabs — smaller diff):
  1. **Listing details** (new): title, description (+CharacterCounter), price, amenities, photos via ImageUploader **with C5's deferred deletes**. Reuse create-form field components where practical.
  2. **Availability & status** (existing HostManagedEditListingForm) — kept as-is, except: remove the user-facing "versioned availability contract" copy and the visible "Expected Version" input (keep `version` in state only; same screen, 2 lines).
- Update page header copy to match reality; the "Edit Listing" CTA on the detail page now delivers what it promises.
- **Delete `LegacyEditListingForm`** (~1100 lines dead code with its own bugs) — risk reduction: it's the misleading alternative someone could wire up.
- **Tests:** component test asserting PATCH payload shape from the details section; reuse existing version-conflict handling tests; e2e: edit title+price → detail page reflects change.
- **Verify:** lint, typecheck, test:components, test:api, Playwright edit flow.
- **Risk:** medium — touches listing mutation UX. Optimistic-lock (version) flow must keep working; photos use C5 deferral so cancel/abandon is safe.
- **Decision point (defaulted):** sections-on-one-page over tabs; full create-form parity (location editing) intentionally OUT of scope — address/geocode editing has search-index/PostGIS implications, separate task if wanted.

## Wave 3 — C7. Unify the two message-thread UIs

- **Goal:** one `<MessageThread>` rendered by both `/messages/[id]` (ChatWindow) and the inline pane (MessagesPageClient). Today they differ in bubble color/corners, receipts (text vs icons), failed-message UX, timestamps/day separators, transport (poll vs realtime), and max length (1000 vs 500).
- **Step 0 — recon (blocks design):** (a) confirm prod transport (see C8 recon); (b) read the server message-length validation and make it the single source: export `MESSAGE_MAX_LENGTH` from the messages contract, both composers import it.
- **Step 1 — extract shared module** `src/components/messages/`: `MessageBubble`, `DaySeparator`, `MessageComposer`, `FailedMessageActions`, and `useMessageThread` hook (state + transport with realtime→poll fallback + optimistic send + C8 merge + near-bottom detection + jump-to-latest pill).
- **Canonical design (default, flag to Surya):** ChatWindow's richer anatomy (day separators, per-bubble timestamps, receipt icons, explicit Retry/Delete) + MessagesPageClient's scroll anchoring/jump pill; sent-bubble color = `bg-on-surface` ink (matches the app's current ink-on-cream direction; ChatWindow's `bg-primary` is the alternative).
- **Step 2 — swap into `/messages/[id]` first** (smaller blast radius). Verify.
- **Step 3 — swap into MessagesPageClient's inline pane.** Keep its list/pane layout; only the thread pane is replaced.
- **Out of scope (follow-ups, not criticals):** pushState→router.push mobile navigation fix, message-history pagination, presence copy, blocked-user copy alignment. Listed in audit High items.
- **Tests:** unit tests on `useMessageThread` reducer/merge; existing messaging Playwright e2e must pass; manual two-user session (send, fail+retry, typing, read receipts) in both surfaces.
- **Verify:** lint, typecheck, full `pnpm test`, messaging e2e.
- **Risk:** highest of the plan — realtime timing + two consuming surfaces. Mitigation: C8 lands first; swap one surface at a time; per-commit revert.

## Verification gates (every wave)
- `pnpm lint` && `pnpm typecheck` && targeted jest suites; Playwright for the affected flow.
- No PII in any new logs; all mutations stay server-validated (no contract changes anywhere in this plan).

## Rollback
- All frontend; no migrations. Each item is one commit; revert independently.

## Results + verification story
- (fill in as waves complete)
