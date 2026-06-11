# Homepage UI Review — 2026-06-10

Full-page review of `/` across 320 / 375 / 768 / 1024 / 1440 viewports (live browser, logged-in state)
plus code review of HomeClient, SearchForm, FeaturedListings(Client), Navbar, Footer, layout, globals.css.
Screenshots: `tasks/.ui-review/homepage-jun10/`.

Verification notes: several subagent findings were checked against the live DOM and code;
wrong ones were discarded (noted at the bottom).

---

## HIGH — fix first

- **H1. No visible focus indicator on all hero search inputs** (WCAG 2.4.7, primary conversion path).
  `focus:outline-none focus:ring-0` without replacement; verified live (outline none, no ring, only a faint bg tint).
  - src/components/SearchForm.tsx:1015 (What), 1261 (Min), 1300 (Max)
  - src/components/LocationSearchInput.tsx:825 (Where)
  - Fix: `focus-visible:ring-2 ring-primary` on inputs, or a strong `focus-within` treatment per field group.

- **H2. Hero image is a 1.73 MB PNG (1774×887) loaded as CSS background** — likely LCP, undiscoverable
  until CSS parses, unoptimized, and re-downloaded… also reused in the FinalCTA polaroid card.
  - src/app/HomeClient.tsx:94 and :752; file: public/images/home/hero-living-room.png
  - Fix: convert to AVIF/WebP (~10× smaller), responsive sizes, `<link rel="preload">` or `next/image fill priority`.
  - Related: two `.woff2` files are preloaded but unused on every page (console warning) — audit next/font weights.

- **H3. Featured grid breaks at md (768–1023px)**: small cards get 3/12 cols ≈ 165px →
  titles wrap one-word-per-line, NEW/OPEN badges truncate to "N… O…", meta line ellipsizes to nothing.
  - src/components/FeaturedListingsClient.tsx:165 (grid), :225 (col spans), :251 (badge `truncate`)
  - Fix: at md use col-span-6 for all cards (2-col), go editorial 12-col only at lg+; badges `shrink-0` not `truncate`.

- **H4. `line-clamp-1` on card titles never clamps** — the child `Link` is `inline-flex` (atomic inline),
  so the -webkit-box clamp can't cut text; long titles wrap to 2–5 lines and card heights diverge (visible at 375/768).
  - src/components/FeaturedListingsClient.tsx:283-289
  - Fix: put the clamp on the `Link` itself (`block line-clamp-1`) or drop `inline-flex`.

- **H5. FeaturedListings Suspense skeleton ≠ real layout → CLS on resolve.**
  Skeleton: `py-16 md:py-20`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `gap-8 sm:gap-10`, aspect-ratio cards, no pills row.
  Real: `py-20 md:py-28`, `md:grid-cols-12` editorial spans, `gap-x-6 gap-y-10`, fixed heights (h-64…h-[26rem]), header with pills + sort.
  - src/app/page.tsx:36-67 vs src/components/FeaturedListingsClient.tsx:165-230

- **H6. `/api/messages?view=unreadCount` 404s repeatedly from navbar polling on the homepage** (console error spam).
  The route exists (src/app/api/messages/route.ts:114), so it's a runtime 404 — investigate (seeded session user?).
  - Caller: src/components/NavbarClient.tsx:211

- **H7. Skip link likely broken by the custom scroll container** — page scrolls in
  `CustomScrollContainer`, anchor/`#main-content` navigation operates on window.
  - src/components/ui/SkipLink.tsx, src/components/ui/CustomScrollContainer.tsx:23
  - Verify with keyboard; fix by scrolling the container on hash/skip navigation.
  - Side effect observed: full-page screenshots/scroll restoration also bypassed.

## MEDIUM

- **M1. 320px: MatchingSection overflows the viewport ~6px** — right padding lost, the white
  "Lifestyle signals…" card clips off-screen. A grid child (traits grid / PersonTag min-content) can't shrink.
  - src/app/HomeClient.tsx:405-505 — add `min-w-0` to the grid columns / trait rows.
- **M2. Trust chips all truncate at md (768–~950px)** — "Verified …", "ID & phon…", "Quality Li…".
  Hero text column (0.56fr) too narrow for 3 chips. Wrap to 2 rows or drop `sub` text at md.
  - src/app/HomeClient.tsx:103-149, TrustChip :195-198
- **M3. Footer giant wordmark "Roomshare." clips its terracotta period at ≤375px.**
  - src/components/Footer.tsx (wordmark block) — reduce clamp() max at small widths or add padding allowance.
- **M4. Static "Sort: Best match" pill is a non-interactive `div`** styled identically to the real
  sort control on /search — affordance deception. Make it work or restyle as plain label.
  - src/components/FeaturedListingsClient.tsx:149-152
- **M5. Filter pills row: `overflow-x-auto hide-scrollbar` with no affordance** — "Whole places",
  "Short stays", Sort are invisible off-screen at <~700px; desktop mouse users can't discover/scroll either.
  - src/components/FeaturedListingsClient.tsx:132 — add edge fade mask or wrap on mobile.
- **M6. Fabricated match score** `78 + ((id.length + index*7) % 17)` rendered as "91 match" ring —
  fake trust signal on a trust-first product. OK for demo; remove/back with real data before launch.
  - src/components/FeaturedListingsClient.tsx:207
- **M7. Card images: raw `<img>`, fixed `w=1200` Unsplash URL for every card size, no srcset/sizes,
  no width/height attrs** (CLS is mitigated by fixed-height container), `index < 2` eager but below fold.
  - src/components/FeaturedListingsClient.tsx:238-243 — use `next/image` with per-span `sizes`.
- **M8. Recent-searches dropdown a11y**: no listbox/option roles, no Escape-to-close, Clock icon
  not `aria-hidden`, header not associated with the list.
  - src/components/SearchForm.tsx:1162-1195
- **M9. AI "WHAT" field only exists at lg+** — phone/tablet users never see the AI search affordance.
  Trust chips + auth CTA are also hidden on small/short screens (deliberate per globals.css:396 comment) —
  consider relocating below the search card instead of dropping entirely.
- **M10. User-menu keyboard nav bug**: Log out item `tabIndex={activeMenuIndex === 7}` but only 5 items exist.
  - src/components/NavbarClient.tsx:701 (verify exact line)
- **M11. Navbar backdrop-blur picks up the terracotta CTA** while scrolling that section → navbar looks
  stained pink (visible in footer screenshot). Polish: solid/canvas tint after hero.
- **M12. Footer year `new Date().getFullYear()`** rendered client+server — hydration-safe only within
  the same year boundary; a React #418 (text mismatch) was observed in prod console history — worth one
  non-minified prod-build check of the homepage.
  - src/components/Footer.tsx:119

## LOW / polish

- L1. Decorative icons missing `aria-hidden="true"`: SlidersHorizontal (FeaturedListingsClient.tsx:150),
  Home icon in empty-state badge (:79), Clock in recent searches (SearchForm.tsx:1193).
  (WhyBand pillar icons HomeClient.tsx:273 too.)
- L2. Desktop card meta ellipsizes mid-word ("Move…") on narrow cards — hide the least important
  segment responsively instead.
- L3. Social buttons are letter placeholders "I / L / S" (aria-labels fine) — use real icons before the demo.
- L4. Brand casing: footer wordmark "Roomshare." vs "RoomShare" everywhere else; "ISSN 2026-0417" is a
  fake editorial flourish — fine stylistically, but recruiters may ask.
- L5. Placeholders don't end with "…" and show no example pattern (What/Where/Min/Max) — guideline nit.
- L6. Inline `transition: "background 0.3s …"` on SearchForm focused-field state (SearchForm.tsx:896) —
  not transform/opacity; minor.
- L7. Stats band numbers ("94%", "2.4 days") — static marketing copy; fine for demo, flag for launch.
- L8. `text-micro-label` is 11.2px uppercase — decorative only; keep an eye on contrast.
- L9. "212 people joined this week" — static fake number (demo OK).

## Verified-OK (no action)

- prefers-reduced-motion IS globally handled (`* { animation-duration: .01ms !important … }` + sonner +
  card-entrance rules) — subagent concern about rule order is moot (`!important` wins).
- FavoriteButton is NOT nested inside the Link (sibling overlay pattern; `a button` count = 0 in DOM).
- Move-in dates use explicit `"en-US"` + UTC → deterministic, no hydration risk.
- No horizontal page overflow at 375/768/1024/1440 (custom scroll container clips correctly).
- h1 unique; heading hierarchy sane; theme-color matches canvas (#fbf9f4); zoom not disabled (max-scale 5);
- All listing images have descriptive alt; filter pills have `aria-pressed`; empty state exists;
  footer "coming soon" buttons are real buttons with aria-labels (intentional).

## Infra observation (not a UI issue)

- During testing the dev server on :3000 (and :3010) hung → homepage 404'd for fresh sessions, then
  stopped responding entirely. **Prod (roomshare.vercel.app) returns 200 anonymously** — local-only issue;
  restart `pnpm dev` before the next session. Logged-out AuthCTA render was not live-verified because of this.
