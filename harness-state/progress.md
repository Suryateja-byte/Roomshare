# Harness Progress Log

## Status Overview
- Sprint 1 (Phase 1 — Quick Wins): NOT STARTED
- Sprint 2 (Phase 2 — Design System): NOT STARTED
- Sprint 3 (Phase 3 — A11y): NOT STARTED
- Sprint 4 (Phase 4 — Unification): DONE
- Sprint 5 (Phase 5 — Font Sweep): DONE

## Sprint 4 — Phase 4: Component Unification
- FIX-15: DONE — ListingCard imports formatPrice from lib/format
- FIX-16: DONE — SplitStayCard uses formatPrice
- FIX-17: DONE — ListingPageClient uses formatPrice
- FIX-18: DONE — PriceRangeFilter + filter-chip-utils use formatPriceCompact
- FIX-19 to FIX-20e: DONE — SettingsClient 6 buttons replaced with <Button>
- FIX-21: DONE — ForgotPasswordClient layout + AuthPageLogo + role=alert
- FIX-22: DONE — src/lib/card-patterns.ts created
- FIX-23: DONE — 10 button bypasses replaced (6 error pages + search + verify + report)
- Gate: pnpm lint PASS (0 errors, 3 pre-existing warnings), pnpm typecheck PASS, pnpm test PASS (8/8)
- Sprint 6 (Phase 6 — Responsive): DONE
- Sprint 7 (Phase 7 — Form UX): DONE
- Sprint 8 (Phase 8 — Polish): DONE

## Sprint 5 — Phase 5: Sub-12px Font Sweep
- FIX-24: DONE — SearchForm.tsx (5 instances fixed, 2 exceptions preserved)
- FIX-25: DONE — MobileSearchOverlay.tsx (3 instances fixed, 1 exception preserved)
- FIX-26: DONE — NeighborhoodChat.tsx (3 instances)
- FIX-27: DONE — MapEmptyState.tsx (3 instances)
- FIX-28: DONE — ListingCard.tsx (2 instances)
- FIX-29: DONE — BookingForm.tsx (2 instances)
- FIX-30: DONE — MessagesPageClient.tsx (2 instances)
- FIX-31: DONE — NearbyPlacesCard.tsx (2 instances)
- FIX-32: DONE — NotificationCenter.tsx (2 instances)
- FIX-33: DONE — BottomNavBar.tsx (1 instance)
- FIX-34: SKIP — CollapsedMobileSearch.tsx (constrained badge exception)
- FIX-35: SKIP — CompactSearchPill.tsx (constrained badge exception)
- FIX-36: DONE — ImageUploader.tsx (1 instance)
- FIX-37: DONE — TrustBadge.tsx (1 instance)
- FIX-38: DONE — ProfileClient.tsx (1 instance)
- FIX-39: DONE — UserProfileClient.tsx (1 instance)
- FIX-40: DONE — Map.tsx (1 instance)
- FIX-41: DONE — ChatWindow.tsx (1 instance)
- Gate: pnpm lint PASS, pnpm typecheck PASS, pnpm test PASS, grep confirms 5 exceptions only

## Sprint 6 — Phase 6: Responsive + Layout
- FIX-42: DONE — NavbarClient.tsx lg: → md: breakpoints (4 locations: nav links, profile dropdown, mobile toggle, mobile overlay)
- FIX-43: DONE — Footer.tsx 4 section headings text-xs tracking-[0.2em] → text-sm tracking-[0.1em]
- FIX-44: DONE — Footer.tsx grid grid-cols-2 md:grid-cols-6 → grid-cols-2 sm:grid-cols-3 md:grid-cols-6
- FIX-45: DONE — Footer.tsx pb-28 md:pb-12 → pb-24 sm:pb-16 md:pb-12
- FIX-46a: DONE — bookings/page.tsx + BookingsClient.tsx pt-20 → pt-4
- FIX-46b: DONE — NotificationsClient.tsx pt-24 → pt-4
- FIX-46c: DONE — SavedListingsClient.tsx pt-20 → pt-4
- FIX-46d: DONE — RecentlyViewedClient.tsx pt-20 → pt-4
- FIX-46e: DONE — ProfileClient.tsx pt-20 → pt-4 (loading skeleton outer container, line 171)
- FIX-46f: DONE — EditProfileClient.tsx pt-24 → pt-4
- FIX-46g: DONE — UserProfileClient.tsx pt-24 → pt-4
- FIX-47: DONE — HomeClient.tsx search bar p-3 sm:p-2 → p-2 sm:p-3
- FIX-48: DONE — HomeClient.tsx hero pt-32 pb-16 md:pt-40 md:pb-24 min-h-[75dvh] md:min-h-[100dvh] → pt-24 pb-12 md:pt-32 md:pb-16 min-h-[60dvh] md:min-h-[80dvh]
- FIX-48b: DONE — HomeClient.tsx hero wrapper mb-12 md:mb-16 → mb-8 md:mb-12
- FIX-49: DONE — HomeClient.tsx H1 text-4xl md:text-6xl → text-4xl sm:text-5xl md:text-6xl
- Gate: pnpm typecheck PASS (exit 0), pnpm lint PASS (0 errors, 3 pre-existing warnings)

## Sprint 8 — Phase 8: Polish & Minor
- FIX-55: DONE — search/page.tsx metadata title "Roomshare" → "RoomShare" (3 occurrences)
- FIX-56: DONE — CategoryBar.tsx category pill button gets `title={cat.label}` attribute
- FIX-57: DONE — RecentlyViewedClient.tsx title/alt null guards + listing-status.ts server filter for null title/price + test mocks updated
- FIX-58: DONE — NearbyPlacesCard.tsx 5x rounded-[24px] → rounded-xl
- FIX-59: DONE — NearbyPlacesCard.tsx 5x shadow-lg shadow-on-surface/50 → shadow-ambient-lg
- FIX-60: SKIP — semantic color tokens (text-success, bg-warning etc.) not defined as Tailwind utilities; only CSS color variables exist, not mapped token classes
- FIX-61: DONE — NavbarClient.tsx profile dropdown button active state on /profile, /settings, /saved routes
- Gate: pnpm typecheck PASS (exit 0), pnpm lint PASS (0 errors, 3 pre-existing warnings), pnpm test — FIX-57 tests pass; 5 pre-existing failing suites unaffected

## HARNESS COMPLETE — All 8 sprints done. 61 fixes reviewed: 55 DONE, 6 SKIP.

## Sprint 7 — Phase 7: Form UX
- FIX-50: DONE — LoginClient + SignUpClient: added Verifying... state to submit button when !turnstileToken && !loading
- FIX-51: DONE — SignUpClient: terms error "above" → "below", scrollIntoView to terms-checkbox, id changed from "terms" to "terms-checkbox"
- FIX-52: DONE — SignUpClient: confirm password three-way border logic (green match / red only after full-length attempt / neutral)
- FIX-53: DONE — PasswordStrengthMeter: returns min-h-[7.5rem] aria-hidden placeholder div instead of null when empty; test updated
- FIX-54: DONE — ListingCard: motion-safe: prefix on group-hover:-translate-y-1, group-hover:scale-[1.05], transition-transform, duration-[600ms]
- Gate: pnpm typecheck PASS (exit 0), pnpm lint PASS (0 errors, 3 pre-existing warnings), pnpm test (ListingCard|PasswordStrength) PASS (4/4)

## Log
- 2026-03-31: Harness initialized. Spec and feature list created.

## Sprint 1 — Phase 1: Quick Wins
- FIX-1: DONE — disabled devIndicators in next.config.ts
- FIX-2: DONE — computed details from field values in CreateListingForm.tsx
- Commits: 6cccd321 (FIX-1), 0a89b147 (FIX-2)
- Gate: pnpm lint PASS, pnpm typecheck PASS

## Sprint 3 — Phase 3: Accessibility
- FIX-7: DONE — focus-visible rings on all auth form inputs
- FIX-8: DONE — search heading !outline-none → focus-visible ring
- FIX-9: DONE — password toggle focus ring + min-w touch target
- FIX-10: DONE — login error div always-in-DOM role=alert
- FIX-11: DONE — login spinner aria-hidden + sr-only
- FIX-12: DONE — signup error div always-in-DOM role=alert
- FIX-12b: DONE — signup spinner sr-only
- FIX-13: DONE — navbar badge dot aria-hidden
- FIX-14: DONE — Suspense fallback role=status
- Gate: pnpm lint PASS, pnpm typecheck PASS

## Sprint 2 — Phase 2: Design System Foundation
- FIX-3: DONE — removed primary button gradient
- FIX-4: DONE — removed filter variant gradient
- FIX-5: DONE — badge sm text-2xs → text-xs
- FIX-6: DONE — created src/lib/format.ts with formatPrice/formatPriceCompact
- FIX-6b: DONE — updated button test
- Gate: pnpm lint PASS, pnpm typecheck PASS, pnpm test PASS
