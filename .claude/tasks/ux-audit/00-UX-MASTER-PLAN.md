# UX Master Plan — RoomShare Editorial Living Room

**Status:** FINAL — Approved by all 4 specialist agents after adversarial debate
**Date:** 2026-03-24
**Agents:** heuristic-auditor, flow-architect, interaction-designer, visual-polish

---

## 1. Executive Summary — Top 10 Highest-Impact Improvements

**1. Fix Post-Signup Re-Login Friction (P0, Flow)** — Email signup forces 12 actions before first value. Users fill 4 registration fields, then must re-enter email+password on the login page. Proposed: auto-sign-in after registration with redirect to "Check your email" interstitial. Eliminates 42% action overhead.

**2. Fix Login callbackUrl Hardcode (P0, Flow)** — `LoginClient.tsx:83` hardcodes `window.location.href = "/"`. Users browsing /saved, /bookings, or /messages get dumped on the homepage after login. Fix: read callbackUrl from searchParams (sanitize for open-redirect safety).

**3. Booking Escape Key Fix (P1, Heuristic)** — BookingForm blocks Escape during submission with no cancel path. Allow Escape to close modal, show neutral toast "Your booking may still be processing. Check your bookings page for status." Don't abort the in-flight fetch. Idempotency key handles edge cases.

**4. Skeleton-to-Content Crossfade — ContentReveal Wrapper (P1, Interaction)** — Every skeleton-to-content swap is a hard cut. Create `<ContentReveal>` wrapper using framer-motion AnimatePresence with `mode="popLayout"`. Concurrent 200ms fade. Skip animation if content loads in <100ms. Highest-frequency polish improvement.

**5. Search Page aria-live Feedback (P1, Heuristic)** — SearchResultsClient silently replaces content. Screen readers get no "15 places found" announcement. Add `aria-live="polite"` region for result count changes and loading states.

**6. Booking Success Celebration (P1, Interaction)** — After successful booking, add radial warm glow (box-shadow animation expanding behind icon, 600ms) + spring-bounce icon (0→1.2→1, 400ms) + text fade-up. CSS-only, non-blocking, fires during existing 1500ms redirect timer.

**7. "Boost Visibility" Dead Feature Redesign (P1, Heuristic)** — ListingPageClient renders a "Promote now" button with no onClick handler. Misleads hosts. Redesign to "Coming Q3 2026" card with muted styling + optional "Get notified" link.

**8. Wire Haptic Feedback (P2, Interaction)** — `haptics.ts` defines triggerLightHaptic/triggerMediumHaptic but zero components use them. Wire 4 calls: FavoriteButton (light), BottomNavBar (light), BookingForm confirm (medium), MobileBottomSheet snap (light). Decouple CSS visual classes from JS haptic triggers; gate visual effects behind `@media (prefers-reduced-motion: no-preference)`.

**9. Typography Consistency — READ vs SCAN Principle (P2, Visual)** — The debate's strongest emergent principle: Newsreader (`font-display`) for READ contexts (page headings, section headings, price focal numbers). Manrope (`font-body`) for SCAN contexts (card titles, list items, badges, body text). Fix: add `font-display` to FeatureCard headings, "Similar listings" heading, and section headings above card grids. Keep Manrope on ListingCard titles (visual-polish changed vote mid-debate, final consensus 3-1 for SCAN principle on cards).

**10. bg-background → bg-surface-canvas Token Hygiene (P2, Visual)** — ListingPageClient and related pages use `bg-background` (shadcn alias) instead of `bg-surface-canvas` (design system token). Currently resolves to the same color via CSS variable chain, but the indirection layer is fragile. Replace for code resilience.

---

## 2. Priority Matrix

### P0 — Critical (Fix NOW)

| # | Improvement | Source | Effort | Files |
|---|------------|--------|--------|-------|
| 1 | Post-signup re-login elimination | Flow | M | auth routes, register API |
| 2 | Login callbackUrl fix | Flow | S | LoginClient.tsx |

### P1 — High (This Sprint)

| # | Improvement | Source | Effort | Files |
|---|------------|--------|--------|-------|
| 3 | Booking Escape key fix | Heuristic + All | S | BookingForm.tsx |
| 4 | ContentReveal wrapper | Interaction | M | New component + skeleton consumers |
| 5 | Search aria-live feedback | Heuristic | S | search/page.tsx, SearchResultsClient |
| 6 | Booking success celebration | Interaction | M | BookingForm.tsx, globals.css |
| 7 | Boost visibility card redesign | Heuristic + Visual | S | ListingPageClient.tsx |
| 8 | Contact Host visibility | Flow | S | ListingPageClient.tsx sidebar |
| 9 | Listing breadcrumb → semantic nav | Heuristic | S | ListingPageClient.tsx |
| 10 | Password toggle keyboard access | Heuristic | S | LoginClient, SignUpClient |
| 11 | Form error message transitions | Interaction | S | globals.css + form components |

### P2 — Medium (Next Sprint)

| # | Improvement | Source | Effort | Files |
|---|------------|--------|--------|-------|
| 12 | Wire haptic feedback (4 calls) | Interaction | S | 4 component files + haptics.ts |
| 13 | Typography READ/SCAN principle | Visual | S | FeatureCard, section headings |
| 14 | bg-background → bg-surface-canvas | Visual | S | ListingPageClient + loading/edit pages |
| 15 | Mobile menu staggered entrance | Interaction | S | NavbarClient.tsx |
| 16 | Search form focus-within glow | Interaction | S | SearchForm.tsx |
| 17 | Uppercase label tracking consistency | Visual | S | Cross-component audit |
| 18 | Section spacing rhythm audit | Visual | M | Multiple pages |
| 19 | Empty state designs (editorial) | Visual + Flow | M | Multiple pages |
| 20 | Better booking progress copy | Interaction | S | BookingForm.tsx |

### P3 — Low (Backlog)

| # | Improvement | Source | Effort | Files |
|---|------------|--------|--------|-------|
| 21 | Connection Score explanation tooltip | Heuristic | S | Listing detail |
| 22 | Keyboard shortcuts for power users | Heuristic | M | Global handler |
| 23 | Profile completion celebration | Interaction | S | ProfileClient |
| 24 | FeatureCard icon hover animation | Interaction | S | HomeClient.tsx |
| 25 | Image gallery pinch-to-zoom | Interaction | L | ImageGallery.tsx |
| 26 | Return-user personalization | Flow | XL | Requires backend |

---

## 3. Micro-Interaction Inventory

| # | Interaction | Trigger | Duration | Easing | Priority | Reduced Motion |
|---|------------|---------|----------|--------|----------|----------------|
| 1 | ContentReveal crossfade | Skeleton → content swap | 200ms | --ease-warm | P1 | Instant swap |
| 2 | Booking celebration glow | Booking success response | 600ms | --ease-editorial | P1 | Static icon |
| 3 | Booking celebration icon | Booking success response | 400ms | --ease-bounce | P1 | scale(1) instant |
| 4 | Form error entrance | Validation error appears | 200ms | --ease-warm-out | P1 | Instant appear |
| 5 | Mobile menu stagger | Menu overlay opens | 50ms/item | --ease-warm-out | P2 | Instant appear |
| 6 | Search focus glow | Focus-within on SearchForm | 300ms | --ease-warm | P2 | No animation |
| 7 | Haptic: favorite | Heart button tap | Instant | N/A | P2 | Always fires |
| 8 | Haptic: nav tap | Bottom nav icon tap | Instant | N/A | P2 | Always fires |
| 9 | Haptic: booking confirm | Confirm button tap | Instant | N/A | P2 | Always fires |
| 10 | FeatureCard icon hover | Mouse enter on card | 300ms | --ease-warm | P3 | No animation |
| 11 | Profile completion fill | Progress bar updates | 500ms | --ease-editorial | P3 | Instant fill |

---

## 4. Flow Optimization Summary

| Flow | Current Clicks | Proposed Clicks | Change | Key Fix |
|------|---------------|----------------|--------|---------|
| New user → first listing | 3 | 3 | — | Already optimized |
| Sign up → first value | 12 actions | 7 actions | -42% | Auto-sign-in + interstitial |
| Booking (logged in) | 7 | 7 | — | Keep (trust-building friction) |
| Host listing creation | ~22 | ~22 | — | Keep (form persistence mitigates) |
| Message a host | 3 | 3 | — | Already optimized |
| Saved listings round-trip | 3 | 3 | — | Already optimized |
| Login → return to context | 2 + lost context | 2 + preserved | Fix | callbackUrl parameter |

---

## 5. Accessibility Fixes (WCAG AA)

| # | Issue | Standard | Fix | Priority |
|---|-------|----------|-----|----------|
| 1 | Search results no aria-live | WCAG 4.1.3 | Add aria-live="polite" region | P1 |
| 2 | Breadcrumb is decorative spans | WCAG 2.4.8 | Semantic nav > ol > li structure | P1 |
| 3 | Password toggle tabIndex={-1} | WCAG 2.1.1 | Remove negative tabIndex | P1 |
| 4 | Haptic CSS classes leak to reduced-motion | WCAG 2.3.3 | Gate behind @media query | P2 |
| 5 | No aria-busy on loading skeletons | WCAG 4.1.3 | Add aria-busy="true" | P2 |
| 6 | Messages loading has no label | WCAG 1.3.1 | Add "Loading conversations" text | P3 |

---

## 6. Debate Log — Key Disagreements and Resolutions

### Debate 1: ListingCard font-display (Serif vs Sans for Card Titles)
- **visual-polish + heuristic-auditor:** YES — editorial consistency, brand voice
- **interaction-designer + flow-architect:** NO — scanning speed, truncation at line-clamp-1
- **Resolution:** Visual-polish changed vote after accepting interaction-designer's READ vs SCAN framework. Final: Keep Manrope on card titles (SCAN context), add Newsreader to section headings (READ context). Design principle documented.

### Debate 2: ContentReveal Timing (350ms vs 0ms)
- **interaction-designer:** Original 350ms with mode="wait" (sequential)
- **heuristic-auditor:** Skip if <100ms, violates H1
- **flow-architect:** Tiered — full on first load, fast on re-renders
- **Resolution:** UNANIMOUS on mode="popLayout" (concurrent, not sequential). 200ms content entrance + 150ms skeleton exit running simultaneously. Skip entirely if content resolves before skeleton mounts. Adaptive without measuring load speed.

### Debate 3: Booking Escape Key (Block vs Allow)
- **heuristic-auditor:** Allow Escape, Critical severity (H3 violation)
- **interaction-designer:** Block Escape, better progress copy (race condition risk)
- **flow-architect:** Allow Escape, neutral toast, don't abort (honest about ambiguous state)
- **Resolution:** 3-1 vote for ALLOW. Close modal, do NOT abort fetch, toast "may still be processing." Severity downgraded from Critical to Major. Interaction-designer accepted with condition that toast doesn't falsely say "cancelled."

### Debate 4: bg-background Visual Impact
- **visual-polish:** P0 Critical — "brand-breaking, renders on cool/white background"
- **heuristic-auditor + flow-architect:** Verified CSS chain — bg-background resolves to same #fbf9f4 via --background alias
- **Resolution:** UNANIMOUS downgrade to P2. Not visually broken. Token hygiene fix for code resilience.

### Debate 5: Skip-nav Existence
- **heuristic-auditor:** Critical finding — "no skip-nav exists"
- **flow-architect:** SkipLink.tsx exists at layout.tsx:108, targets #main-content
- **Resolution:** Finding RETRACTED. Heuristic-auditor's grep missed PascalCase component name.

### Debate 6: Booking Celebration Particles vs Radial Glow
- **interaction-designer:** Terracotta dot particles radiating outward
- **visual-polish:** Particles are gamification (Duolingo), not editorial. Counter: radial warm glow
- **Resolution:** UNANIMOUS for radial glow. More editorial-appropriate. Keep spring icon + text fade.

### Debate 7: Haptics in Reduced Motion
- **interaction-designer:** Haptics should fire even with prefers-reduced-motion
- **visual-polish:** CSS companion classes (scale, bg-change) leak visual motion
- **Resolution:** UNANIMOUS — decouple JS haptic calls from CSS visual classes. Gate visual effects behind @media (prefers-reduced-motion: no-preference). Haptic vibrations still fire (different sensory channel).

---

## 7. Implementation Order (Dependencies)

```
Phase 1 (No Dependencies — Do First):
├── P0-1: Login callbackUrl fix (LoginClient.tsx only)
├── P0-2: Post-signup auto-sign-in (register route + redirect)
├── P1-3: Booking Escape fix (BookingForm.tsx only)
├── P1-5: Search aria-live (search/page.tsx only)
├── P1-7: Boost card redesign (ListingPageClient.tsx only)
├── P1-9: Breadcrumb semantic fix (ListingPageClient.tsx only)
└── P1-10: Password toggle tabIndex (LoginClient + SignUpClient)

Phase 2 (After Phase 1):
├── P1-4: ContentReveal wrapper (new component)
│   └── Then: wire to all skeleton consumers
├── P1-6: Booking celebration (depends on ContentReveal for consistent animation patterns)
├── P1-8: Contact Host in sidebar (ListingPageClient.tsx)
└── P1-11: Form error transitions (depends on ContentReveal pattern)

Phase 3 (Independent Polish):
├── P2-12: Wire haptics (4 component files)
├── P2-13: Typography READ/SCAN fixes (FeatureCard + section headings)
├── P2-14: bg-background token fix (ListingPageClient + related)
├── P2-15: Mobile menu stagger (NavbarClient.tsx)
├── P2-16: Search focus glow (SearchForm.tsx)
├── P2-17: Uppercase tracking consistency (cross-component)
└── P2-18: Section spacing rhythm (cross-page)

Phase 4 (Design-Intensive):
├── P2-19: Empty state editorial designs
└── P2-20: Better booking progress copy

Phase 5 (Backlog):
├── P3-21 through P3-25: Low-priority delight items
└── P3-26: Return-user personalization (requires backend)
```

---

*This plan was produced through adversarial debate between 4 specialist agents. All findings are evidence-based from actual codebase reads. All 4 agents explicitly approved the final plan. Key disagreements are documented in the Debate Log with resolution rationale.*
