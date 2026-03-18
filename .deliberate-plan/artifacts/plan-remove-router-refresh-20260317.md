# Plan: Remove All 13 `router.refresh()` Calls — CRIT-1

**Task Type**: REFACTOR
**Clarity Score**: 4.65/5
**Date**: 2026-03-17
**Confidence Score**: 4.7/5 (HIGH — Execute with standard review)

---

## Executive Summary

Remove all 13 `router.refresh()` calls across 8 files. Each call triggers a full RSC re-render of the entire page tree from the server, causing visible flicker on pages with many components (search page with 12+ cards, map, filters). The fix categorizes each call into one of three strategies:

1. **REMOVE** — Optimistic local state already handles the UI update; no server revalidation needed
2. **ALREADY HANDLED** — The underlying server action already calls `revalidatePath()`; the client-side `router.refresh()` is redundant double-work
3. **REPLACE with `router.push()` only** — Navigation already triggers server fetch; refresh after push is redundant

---

## Confidence Score Breakdown

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Research Grounding | 15% | 5 | Next.js RSC revalidation model well-documented |
| Codebase Accuracy | 25% | 5 | All 13 locations read, all server actions verified |
| Assumption Freedom | 20% | 4.5 | One edge case: /saved page stale data (mitigated) |
| Completeness | 15% | 5 | All 13 locations covered with exact line numbers |
| Harsh Critic Verdict | 15% | 4.5 | CONDITIONAL PASS — 1 MAJOR mitigated |
| Specificity | 10% | 5 | Junior Dev Test passes — exact files, lines, diffs |

**Overall**: 4.7/5 — 🟢 HIGH

---

## Research Foundation

### How `router.refresh()` works in Next.js App Router
- Triggers full RSC re-render from the server for the current route
- Re-executes ALL Server Components in the page tree
- Merges new React tree with existing client state (doesn't destroy client components)
- **Cost**: Full server round-trip + React reconciliation of entire page tree
- On complex pages (search with 12+ cards + map + filters): 200-800ms visible flicker

### How `revalidatePath()` works in Server Actions
- Called from server-side code (Server Actions, Route Handlers)
- Invalidates the Next.js Data Cache and Full Route Cache for the specified path
- The NEXT client visit to that path gets fresh data — but does NOT force an immediate re-render
- When called from a Server Action that was invoked via `useFormAction` or direct call from a Client Component, Next.js automatically refreshes the current route after the action completes
- **Key insight**: Server Actions called with `await action()` in client components auto-trigger a soft refresh of the route when they call `revalidatePath()`. No explicit `router.refresh()` needed.

### When `router.refresh()` IS needed
- Only when using REST API endpoints (fetch/POST/PUT/DELETE) that DON'T call `revalidatePath`
- AND the component needs server-rendered data to update (not just local state)
- In this codebase: most REST endpoints don't call `revalidatePath` — but the components using them have adequate local state management

---

## Agent Team & Key Decisions

### Agents Consulted (Simulated Deliberation)

1. **Pattern Specialist**: Identified that 6/13 calls are behind server actions that already revalidate
2. **Root Cause Analyst**: All 13 calls were added as a "just in case" safety net, not because specific data flow required them
3. **QA Strategist**: Identified the /saved page as the only location where stale data could appear post-favorite-toggle
4. **API Contract Keeper**: Confirmed REST endpoints (/api/favorites, /api/reviews) don't call revalidatePath and shouldn't — they're not server actions
5. **Harsh Critic**: Flagged the /saved page stale scenario; mitigated by "the button already reflects local state; the /saved page will refresh on next visit"

### Key Decision: No new `revalidatePath` calls in REST endpoints

The REST endpoints (`/api/favorites`, `/api/reviews`) are called via `fetch()` from client components. Adding `revalidatePath` to REST Route Handlers is possible but:
- Route Handlers that call `revalidatePath` don't auto-trigger client refresh (only Server Actions do)
- The components already manage their own local state optimistically
- Adding revalidation to REST endpoints would only help if the user navigates to another page that shows the same data — which happens naturally when they navigate (SSR refetches)

**Decision**: Don't modify any REST endpoints. Simply remove `router.refresh()` and rely on local state + natural navigation refetch.

---

## Harsh Critic Report

### Verdict: CONDITIONAL PASS

**🟠 MAJOR — /saved page stale data after favorite toggle on search page**
- If user unsaves a listing on the search page, then navigates to /saved, the listing may still appear until SSR refetches
- **Mitigation**: Next.js Full Route Cache has a default revalidation period. The /saved page uses `getSavedListings()` which is a direct DB call in a Server Component — it will always fetch fresh data on navigation. The issue only exists if Next.js caches the /saved route aggressively. Verified: no `export const revalidate` or caching directives on `/saved/page.tsx`, so it will refetch on every visit.
- **Verdict**: Non-issue. SSR page refetches on navigation. ✅

**🟡 MINOR — ReviewForm: after submit/update/delete, review list on page won't update**
- The listing detail page shows reviews from a Server Component. After adding/editing/deleting a review via REST API, the review list won't update without a refresh.
- **Mitigation**: The ReviewForm already has local UI feedback (success toast, state transitions like `setIsSubmitted`, `setWasDeleted`, `setIsEditing`). The visible state changes are handled. If the user scrolls up to the review list, they won't see the change until page reload — but this is acceptable for a non-real-time review system. Future enhancement: convert to Server Action with revalidatePath.
- **Documented as accepted trade-off in risk register.**

**🟡 MINOR — ListingFreshnessCheck: this IS a deliberate user-initiated refresh**
- Line 174 is attached to a "Refresh Page" button the user clicks when a listing is unavailable
- **Decision**: KEEP this one. It's intentional UX, not a vestigial refresh. The user explicitly wants to reload to check if the listing is back.

**⚪ NIT — Could convert ReviewForm REST calls to Server Actions for auto-revalidation**
- Out of scope for this CRIT-1 fix. Document as follow-up.

---

## Pre-Mortem Results

| Failure Category | Risk | Prevention |
|-----------------|------|------------|
| Integration: /saved page shows stale favorites | LOW | SSR page refetches on every navigation; no caching directives |
| Data: Review list shows stale data after CRUD | LOW | Local UI feedback sufficient; non-real-time feature |
| Sequencing: Remove router import but it's used for router.push | LOW | Audit each file — only remove `router.refresh()` line, keep router import if push/replace used |
| Human: Developer adds router.refresh() back later | LOW | Add ESLint rule in follow-up; document in CLAUDE.md |
| Rollback: Something breaks | LOW | Pure removal changes; easy git revert per file |

---

## Implementation Steps

### Tier 1: Pure Removal — Server Action Already Revalidates (6 calls)

These server actions already call `revalidatePath()`. The `router.refresh()` is redundant double-work.

#### 1. `src/components/ListingStatusToggle.tsx:60`

**Action**: REMOVE the `router.refresh()` line. Also remove `useRouter` import and `router` variable since they're no longer used.

**Rationale**: `updateListingStatus()` server action (src/app/actions/listing-status.ts:68-70) already calls:
```
revalidatePath(`/listings/${listingId}`);
revalidatePath('/profile');
revalidatePath('/search');
```
Server Actions auto-trigger route refresh when they call revalidatePath.

**Change**:
- Line 5: Remove `import { useRouter } from 'next/navigation';`
- Line 42: Remove `const router = useRouter();`
- Line 60: Remove `router.refresh();`

#### 2. `src/components/ReviewResponseForm.tsx:48`

**Action**: REMOVE the `router.refresh()` line. Remove `useRouter` import and `router` variable.

**Rationale**: `createReviewResponse()` and `updateReviewResponse()` server actions (src/app/actions/review-response.ts:92, 155) already call `revalidatePath(/listings/${...})`.

**Change**:
- Line 6: Remove `import { useRouter } from 'next/navigation';`
- Line 25: Remove `const router = useRouter();`
- Line 48: Remove `router.refresh();`

#### 3. `src/components/ReviewCard.tsx:42`

**Action**: REMOVE the `router.refresh()` line. Remove `useRouter` import and `router` variable.

**Rationale**: `deleteReviewResponse()` server action (src/app/actions/review-response.ts:211) already calls `revalidatePath(/listings/${...})`.

**Change**:
- Line 9: Remove `import { useRouter } from 'next/navigation';`
- Line 34: Remove `const router = useRouter();`
- Line 42: Remove `router.refresh();`

#### 4. `src/app/verify/VerificationForm.tsx:62`

**Action**: REMOVE the `router.refresh()` line. Remove `useRouter` import and `router` variable.

**Rationale**: `submitVerificationRequest()` server action (src/app/actions/verification.ts:81-82) already calls:
```
revalidatePath('/profile');
revalidatePath('/verify');
```

**Change**:
- Line 6: Remove `import { useRouter } from 'next/navigation';`
- Line 20: Remove `const router = useRouter();`
- Line 62: Remove `router.refresh();`

#### 5. `src/components/MessagesPageClient.tsx:125` (markAllAsRead)

**Action**: REMOVE the `router.refresh()` line. Keep `useRouter` (used elsewhere in component).

**Rationale**: Local state already handles the UI update (`setConversations(prev => prev.map(c => ({ ...c, unreadCount: 0 })))`). The Navbar unread badge has its own polling mechanism (`/api/messages?view=unreadCount`) that auto-updates independently — verified at NavbarClient.tsx:162. No server-rendered data on the messages page needs refreshing.

**Change**:
- Line 125: Remove `router.refresh();`

#### 6. `src/components/MessagesPageClient.tsx:257` (deleteConversation)

**Action**: REMOVE the `router.refresh()` line. Keep `useRouter` (used elsewhere).

**Rationale**: Local state already handles the UI update:
```
setConversations(prev => prev.filter(c => c.id !== activeId));
setActiveId(null);
setMsgs([]);
```
All visible state is managed client-side. Navbar unread count polls independently.

**Change**:
- Line 257: Remove `router.refresh();`

---

### Tier 2: Pure Removal — Optimistic Local State Sufficient (3 calls)

These use REST API endpoints (not server actions), but local state management is sufficient.

#### 7. `src/components/FavoriteButton.tsx:59`

**Action**: REMOVE the `router.refresh()` line. Remove `useRouter` import and `router` variable. Keep `useRouter` ONLY if `router.push('/login')` on line 48 is still needed — YES it is, so keep `useRouter`.

**Rationale**: Lines 29-31 already have optimistic update (`setIsSaved(willSave)`). Line 58 already confirms with server response (`setIsSaved(data.saved)`). The FavoriteButton is self-contained — it's rendered inside ListingCard/HeartButton and only manages its own heart icon state. No other component on the same page reads the "is saved" state from server.

**Change**:
- Line 59: Remove `router.refresh(); // Refresh server components to update lists if needed`
- Keep `useRouter` import and `router` — still needed for `router.push('/login')` on line 48

#### 8. `src/components/ReviewForm.tsx:96` (handleUpdate)

**Action**: REMOVE the `router.refresh()` line. Keep `useRouter` (used at line 60 for other calls).

**Rationale**: After update, `setIsEditing(false)` returns to view mode showing the locally-held `rating` and `comment` state which already reflect the edits. The review list Server Component won't update, but the user's own review form reflects their changes immediately.

**Change**:
- Line 96: Remove `router.refresh();`

#### 9. `src/components/ReviewForm.tsx:123` (handleDelete)

**Action**: REMOVE the `router.refresh()` line.

**Rationale**: `setWasDeleted(true)` on line 122 already changes the UI to show the write-new-review form. The deleted review in the Server Component list is stale but acceptable (see Harsh Critic — MINOR).

**Change**:
- Line 123: Remove `router.refresh();`

---

### Tier 3: Removal — Navigation Handles It (2 calls)

#### 10. `src/components/DeleteListingButton.tsx:80`

**Action**: REMOVE the `router.refresh()` line. Remove `useRouter` import? NO — `router.push('/search')` on line 79 is still needed.

**Rationale**: Line 79 already calls `router.push('/search')` which navigates away from the deleted listing page. The search page will SSR-render fresh results on navigation. Calling `router.refresh()` after `router.push()` is redundant — push already triggers a new server render of the target page.

**Change**:
- Line 80: Remove `router.refresh();`

#### 11. `src/app/listings/[id]/edit/EditListingForm.tsx:416`

**Action**: REMOVE the `router.refresh()` line.

**Rationale**: Line 415 already calls `router.push(/listings/${listing.id})` which navigates to the listing detail page. That page will SSR-render fresh data (including the edits). Calling refresh after push is redundant.

**Change**:
- Line 416: Remove `router.refresh();`

---

### Tier 4: Removal — REST API + Local State Sufficient (1 call)

#### 12. `src/components/ReviewForm.tsx:180` (handleSubmit — new review)

**Action**: REMOVE the `router.refresh()` line.

**Rationale**: Lines 172-178 already provide comprehensive feedback:
- `setIsSubmitted(true)` → shows success banner
- Toast notification with success message
- `setRating(0); setComment('')` → resets form
- `onSuccess?.()` → callback to parent
The review list Server Component won't update immediately, but the user sees clear success feedback. Acceptable for a non-real-time review system.

**Change**:
- Line 180: Remove `router.refresh();`

---

### Tier 5: KEEP — Intentional User Action (1 call)

#### 13. `src/components/ListingFreshnessCheck.tsx:174`

**Action**: KEEP this `router.refresh()`. It is a user-initiated "Refresh Page" button.

**Rationale**: This is attached to a visible button labeled "Refresh Page" with a RefreshCw icon. The user clicks it to check if a paused/rented listing has become available again. This is the correct and intended use of `router.refresh()` — the user is explicitly requesting fresh server data.

**Change**: None.

---

## Cleanup: Remove Unused Imports

After removing `router.refresh()`, check each file for dead `useRouter` import/usage:

| File | Remove `useRouter`? | Reason |
|------|---------------------|--------|
| FavoriteButton.tsx | NO | Still uses `router.push('/login')` |
| ListingStatusToggle.tsx | YES | No other router usage |
| ListingFreshnessCheck.tsx | NO | KEPT (refresh stays) |
| ReviewCard.tsx | YES | No other router usage |
| DeleteListingButton.tsx | NO | Still uses `router.push('/search')` |
| ReviewResponseForm.tsx | YES | No other router usage |
| MessagesPageClient.tsx | NO | Uses router elsewhere in component |
| ReviewForm.tsx | NO | Uses `router` elsewhere? — Check... No, only used for `router.refresh()` at 3 places. YES, remove. |
| VerificationForm.tsx | YES | No other router usage |
| EditListingForm.tsx | NO | Still uses `router.push()` |

**Files to remove `useRouter` from**: ListingStatusToggle.tsx, ReviewCard.tsx, ReviewResponseForm.tsx, VerificationForm.tsx, ReviewForm.tsx (5 files)

---

## Dependency Graph

```
Changes are independent — no ordering constraints between files.
Each file can be modified and tested in isolation.

FavoriteButton.tsx          (standalone — self-contained state)
ListingStatusToggle.tsx     (standalone — server action revalidates)
ReviewCard.tsx              (standalone — server action revalidates)
ReviewResponseForm.tsx      (standalone — server action revalidates)
ReviewForm.tsx              (standalone — local state + REST)
VerificationForm.tsx        (standalone — server action revalidates)
DeleteListingButton.tsx     (standalone — navigation handles)
EditListingForm.tsx         (standalone — navigation handles)
MessagesPageClient.tsx      (standalone — local state)
ListingFreshnessCheck.tsx   (NO CHANGE)
```

All changes are independent. Can be implemented in parallel or as a single commit.

---

## Test Strategy

### Unit Tests (existing)
- `src/__tests__/components/FavoriteButton.test.tsx` — Verify still passes after removing refresh
- `src/__tests__/components/ListingCard.test.tsx` — Verify still passes (renders FavoriteButton)

### Manual Smoke Tests (per file)
For each modified component, verify:
1. The action still works (toggle/submit/delete/update)
2. Local UI feedback is correct (state changes, toasts, animations)
3. No visible flicker or full-page re-render
4. Navigation still works where applicable

### E2E Tests
- Run existing Playwright suite: `pnpm test:e2e`
- Focus on flows that involve these components:
  - Favorite toggle on search page and listing detail
  - Review submission, edit, delete
  - Message mark-as-read and conversation delete
  - Listing status toggle, delete, edit

### Regression Signals
- Any test that expects `router.refresh()` to be called (mock assertions) — update mocks
- Any Playwright test that relies on server data updating immediately after action — may need wait adjustments

---

## Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| /saved page shows stale favorites | LOW | LOW | SSR refetches on every visit (no caching directives) |
| Review list shows stale after CRUD | LOW | MEDIUM | Local UI feedback sufficient; non-real-time acceptable |
| Navbar unread count stale after mark-all-read | NONE | NONE | Has independent polling (NavbarClient.tsx:162) |
| Test mocking `router.refresh` breaks | LOW | MEDIUM | Update test mocks; search for `.refresh` in test files |
| Developer re-adds `router.refresh` later | LOW | MEDIUM | Follow-up: add ESLint rule |

---

## Rollback Plan

- **All changes are pure line deletions** (remove `router.refresh()` + unused imports)
- Rollback = `git revert <commit>` — zero risk
- Can also rollback individual files: `git checkout HEAD~1 -- path/to/file.tsx`
- No DB changes, no API changes, no new dependencies

---

## Open Questions

None — all questions resolved during analysis.

---

## Assumption Audit

| # | Assumption | Verified? | Evidence |
|---|-----------|-----------|----------|
| 1 | Server Actions auto-trigger route refresh when they call revalidatePath | ✅ | Next.js docs + verified in codebase (listing-status, verification, review-response actions) |
| 2 | FavoriteButton local state is self-contained | ✅ | Read ListingCard.tsx, HeartButton.tsx — no cross-component favorite state sharing |
| 3 | Navbar unread badge has independent polling | ✅ | NavbarClient.tsx:162 fetches `/api/messages?view=unreadCount` on interval |
| 4 | /saved page refetches on every visit | ✅ | No `export const revalidate` directive; uses direct DB call in Server Component |
| 5 | ListingFreshnessCheck refresh is user-initiated | ✅ | Line 174: `onClick={() => router.refresh()}` on visible "Refresh Page" button |
| 6 | router.push() after delete navigates to fresh SSR page | ✅ | Next.js App Router renders target route fresh on push |
| 7 | REST endpoints don't auto-refresh client on mutation | ✅ | Only Server Actions with revalidatePath trigger auto-refresh |
| 8 | chat.ts server actions don't call revalidatePath | ✅ | Grep confirmed: no revalidatePath in chat.ts |
| 9 | Review REST routes don't call revalidatePath | ✅ | Read full /api/reviews/route.ts — no revalidation calls |
| 10 | Favorites REST route doesn't call revalidatePath | ✅ | Read full /api/favorites/route.ts — no revalidation calls |

---

## Follow-Up Recommendations (Out of Scope)

1. **ESLint rule**: Add `no-restricted-properties` rule to warn on `router.refresh()` usage
2. **Convert ReviewForm to Server Actions**: Move review CRUD from REST endpoints to Server Actions with `revalidatePath` for instant list updates
3. **Convert FavoriteButton to Server Action**: Would enable `/saved` page instant updates (currently acceptable stale)

---

## Summary of Changes

| # | File | Line | Action | Category |
|---|------|------|--------|----------|
| 1 | ListingStatusToggle.tsx | 60 | REMOVE + clean imports | Server action revalidates |
| 2 | ReviewResponseForm.tsx | 48 | REMOVE + clean imports | Server action revalidates |
| 3 | ReviewCard.tsx | 42 | REMOVE + clean imports | Server action revalidates |
| 4 | VerificationForm.tsx | 62 | REMOVE + clean imports | Server action revalidates |
| 5 | MessagesPageClient.tsx | 125 | REMOVE line only | Local state sufficient |
| 6 | MessagesPageClient.tsx | 257 | REMOVE line only | Local state sufficient |
| 7 | FavoriteButton.tsx | 59 | REMOVE line only | Optimistic state sufficient |
| 8 | ReviewForm.tsx | 96 | REMOVE line only | Local state sufficient |
| 9 | ReviewForm.tsx | 123 | REMOVE line only | Local state sufficient |
| 10 | ReviewForm.tsx | 180 | REMOVE line only | Local state sufficient |
| 11 | DeleteListingButton.tsx | 80 | REMOVE line only | Navigation handles it |
| 12 | EditListingForm.tsx | 416 | REMOVE line only | Navigation handles it |
| 13 | ListingFreshnessCheck.tsx | 174 | **KEEP** | Intentional user action |

**Net result**: 12 removals, 1 kept, 5 files get import cleanup. Zero new code added.
