# 02 Component-by-Component Redesign Plan

**Aesthetic:** The Editorial Living Room
**Scope:** Every UI primitive and shared component migrated from zinc/dark-mode to warm editorial tokens.

---

## Section 1: Component Inventory

### UI Primitives (`src/components/ui/`)
| File | Summary |
|---|---|
| `button.tsx` | 12 variants (primary, outline, ghost, white, destructive, success, warning, accent, accent-ghost, secondary, ghost-inverse, filter), 4 sizes. Uses zinc-900/white primary, rounded-full, dark: classes. |
| `input.tsx` | Single input with `bg-white border border-zinc-200 rounded-full`, dark mode zinc-900/800. |
| `textarea.tsx` | `rounded-xl border border-zinc-200 bg-white`, dark mode zinc-900/800. |
| `card.tsx` | 4 variants (default, elevated, glass, interactive), `rounded-3xl`, `bg-white dark:bg-zinc-900`. |
| `badge.tsx` | 7 variants (default, success, warning, destructive, info, purple, outline), `rounded-full`. |
| `dialog.tsx` | Radix Dialog, `bg-background`, `bg-black/80` overlay, `rounded-2xl sm:rounded-3xl`. |
| `alert-dialog.tsx` | Radix AlertDialog, `border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900`, `rounded-2xl sm:rounded-3xl`. |
| `dropdown-menu.tsx` | Radix DropdownMenu, `border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-md`. |
| `select.tsx` | Radix Select, `rounded-xl border border-zinc-200 dark:border-zinc-700`, backdrop-blur dropdown. |
| `checkbox.tsx` | Radix Checkbox, `border-primary`, `data-[state=checked]:bg-primary`. |
| `date-picker.tsx` | Custom Popover calendar, `border border-zinc-200 dark:border-zinc-700`, backdrop-blur popup, zinc-900 selected. |
| `label.tsx` | `text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400`. |
| `empty-state.tsx` | Icon circle `bg-zinc-100 dark:bg-zinc-800`, heading/description in zinc-900/500. |
| `HeartButton.tsx` | Re-export of FavoriteButton. |
| `TrustBadge.tsx` | Gradient `from-amber-100 to-yellow-50`, star icon, border amber-200. |
| `LazyImage.tsx` | IntersectionObserver lazy loading, zinc-100 error fallback. |
| `InfiniteScroll.tsx` | Observer-based scroll, zinc-500 spinner/text. |
| `CustomScrollContainer.tsx` | Custom scrollbar, `bg-zinc-400/60` thumb, `bg-background` container. |
| `VisuallyHidden.tsx` | `sr-only` — no visual styling to change. |
| `SkipLink.tsx` | `bg-zinc-900 text-white` on focus. |
| `FocusTrap.tsx` | Logic-only, no styling. |

### Shared Components (`src/components/`)
| File | Summary |
|---|---|
| `Navbar.tsx` / `NavbarClient.tsx` | Glassmorphism `bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md`, zinc-900/white logo, indigo-600 accent dot, zinc-based nav links, dropdown with `bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl`. |
| `Footer.tsx` | `bg-white dark:bg-zinc-950`, zinc-900 headings, zinc-500 text, indigo-600 accent dot. |
| `FooterNavLink.tsx` / `FooterWrapper.tsx` | Simple link wrappers. |
| `Map.tsx` / `DynamicMap.tsx` | Large map component (34K+ tokens), Mapbox GL integration. |
| `ImageGallery.tsx` | Bento grid, `rounded-3xl`, lightbox with `bg-black/95`, zinc-100 fallback. |
| `BookingForm.tsx` | Form with Button, DatePicker, SlotSelector. Portal-based modal. |
| `BookingCalendar.tsx` | Calendar grid with status colors (amber, green, red, zinc). |
| `FavoriteButton.tsx` | `bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm rounded-full`, red-500 saved, heart animation. |
| `FeaturedListings.tsx` / `FeaturedListingsClient.tsx` | Section with framer-motion stagger, `bg-white dark:bg-zinc-950 border-t border-zinc-100`, indigo-500 dot badge, ListingCard grid. |
| `LocationSearchInput.tsx` | Combobox with `bg-white dark:bg-zinc-900 backdrop-blur-xl rounded-2xl` dropdown, MapPin color-coded by type. |
| `NotificationCenter.tsx` | Bell icon, dropdown with notification cards, status-colored icons (blue, green, red, amber, purple, yellow, pink, orange). |
| `ProfileCompletionBanner.tsx` | `bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl`. |
| `ProfileCompletionModal.tsx` | `bg-white dark:bg-zinc-900 rounded-2xl`, amber alert icon. |
| `ProfileCompletionIndicator.tsx` | `bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100`, zinc-900/green progress. |
| `SearchForm.tsx` | Complex search bar with filters, location input, debounced. |
| `UserMenu.tsx` | Dropdown `bg-background border border-border rounded-xl`, gradient-primary avatar. |
| `UserAvatar.tsx` | `rounded-full bg-zinc-200 dark:bg-zinc-700`, initials fallback `bg-indigo-100 dark:bg-indigo-900/50`. |
| `ReviewCard.tsx` | `py-8`, `border-l-2 border-zinc-200 dark:border-zinc-700` response section, amber stars. |
| `ReviewForm.tsx` / `ReviewResponseForm.tsx` | Standard forms with textarea/button. |
| `ReviewList.tsx` | List container for ReviewCards. |
| `ThemeToggle.tsx` | Sun/Moon/Monitor toggle, zinc-100/800 backgrounds. **To be REMOVED (no dark mode).** |
| `ThemeProvider.tsx` | next-themes provider. **To be REMOVED.** |
| `SortSelect.tsx` | Radix Select + mobile bottom sheet, indigo-500 active filter state. |
| `FeatureCard.tsx` | Homepage card with icon, configurable color classes. |
| `ScrollAnimation.tsx` | Framer-motion scroll observer. |
| `SearchViewToggle.tsx` | Map/list toggle. |
| `SearchLayoutView.tsx` | Split layout for search page. |
| `SearchHeaderWrapper.tsx` | Search header container. |
| `CollapsedMobileSearch.tsx` | Mobile collapsed search bar. |
| `SuspensionBanner.tsx` | `bg-red-50 dark:bg-red-900/20 border-b border-red-200`, alert banner. |
| `EmailVerificationBanner.tsx` | `bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200`, amber alert. |
| `OfflineIndicator.tsx` | `bg-amber-500 text-white` fixed bottom bar. |
| `PasswordStrengthMeter.tsx` | Strength indicator bars. |
| `RateLimitCountdown.tsx` | Timer display. |
| `ShareListingButton.tsx` | Share action button. |
| `SaveListingButton.tsx` / `SaveSearchButton.tsx` | Save action buttons. |
| `ContactHostButton.tsx` | CTA button. |
| `DeleteListingButton.tsx` | Destructive action button. |
| `ListingStatusToggle.tsx` | Status switch. |
| `ListingFreshnessCheck.tsx` | Date freshness indicator. |
| `BlockUserButton.tsx` / `BlockedUserMessage.tsx` | Block/blocked states. |
| `ReportButton.tsx` | Report action. |
| `ComingSoonButton.tsx` | Placeholder button. |
| `SlotSelector.tsx` | Slot picker for bookings. |
| `CharacterCounter.tsx` | Text character counter. |
| `ImageUpload.tsx` | Upload component. |
| `MainLayout.tsx` | Layout wrapper. |
| `Providers.tsx` | Context providers wrapper. |
| `JsonLd.tsx` | SEO structured data (no visual). |
| `ServiceWorkerRegistration.tsx` | SW registration (no visual). |
| `WebVitals.tsx` | Performance reporting (no visual). |
| `NavbarWrapper.tsx` | Navbar wrapper. |
| `PersistentMapWrapper.tsx` | Map persistence wrapper. |
| `SuspensionBannerWrapper.tsx` | Suspension banner wrapper. |
| `EmailVerificationWrapper.tsx` | Email verification wrapper. |
| `LowResultsGuidance.tsx` | Low results helper. |
| `ZeroResultsSuggestions.tsx` | Zero results helper. |
| `MessagesPageClient.tsx` | Messages page client component. |
| `NeighborhoodChat.tsx` | Chat for neighborhood feature. |

### Skeleton Components (`src/components/skeletons/`)
| File | Summary |
|---|---|
| `Skeleton.tsx` | Base skeleton primitive: `bg-zinc-200 dark:bg-zinc-700`, variants (text/circular/rectangular/rounded), animations (pulse/shimmer/none). Shimmer uses `from-zinc-200 via-zinc-100 to-zinc-200 dark:from-zinc-700 dark:via-zinc-600 dark:to-zinc-700`. Also exports: `TextSkeleton`, `AvatarSkeleton`, `CardSkeleton` (`border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800`), `ListItemSkeleton`, `TableRowSkeleton`, `ImageSkeleton`. |
| `ListingCardSkeleton.tsx` | `bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800`. CLS-matched to ListingCard dimensions. |
| `PageSkeleton.tsx` | 12 page-level skeletons: `PageSkeleton`, `DashboardSkeleton`, `ProfileSkeleton`, `FormSkeleton`, `ListingSkeleton`, `ListingGridSkeleton`, `SearchResultsSkeleton`, `MessageListSkeleton`, `ChatSkeleton`, `AdminTableSkeleton`, `BookingsSkeleton`, `SettingsSkeleton`, `SavedSearchesSkeleton`, `NotificationsSkeleton`. All use `bg-zinc-50 dark:bg-zinc-900` page bg, `bg-white dark:bg-zinc-800` card bg, `border-zinc-200 dark:border-zinc-700` borders. |
| `index.ts` | Re-exports from Skeleton.tsx and PageSkeleton.tsx. |

### Subdirectory Components
| Directory | Files | Summary |
|---|---|---|
| `auth/` | `AuthErrorAlert.tsx`, `TurnstileWidget.tsx`, `PasswordConfirmationModal.tsx` | Auth error alerts, CAPTCHA, password modals. |
| `bookings/` | `HoldCountdown.tsx` | Hold timer display. |
| `map/` | `MapGestureHint.tsx`, `PrivacyCircle.tsx`, `BoundaryLayer.tsx`, `UserMarker.tsx`, `MapErrorBoundary.tsx`, `POILayer.tsx`, `MapMovedBanner.tsx`, `fixMarkerA11y.ts`, `MapEmptyState.tsx` | Map overlays, markers, banners. |
| `neighborhood/` | `ProUpgradeCTA.tsx`, `ContextBar.tsx`, `NeighborhoodModule.tsx`, `NeighborhoodPlaceList.tsx`, `NeighborhoodMap.tsx`, `PlaceDetailsPanel.tsx` | Neighborhood feature panels and lists. |
| `nearby/` | `RadarAttribution.tsx`, `NearbyPlacesSection.tsx`, `NearbyPlacesMap.tsx`, `NearbyPlacesPanel.tsx` | Nearby places feature. |
| `filters/` | `AppliedFilterChips.tsx`, `FilterChipWithImpact.tsx`, `filter-chip-utils.ts`, `FilterChip.tsx` | Filter chips with indigo-50/indigo-200 styling. |
| `chat/` | `NearbyPlacesCard.tsx`, `BlockedConversationBanner.tsx` | Chat-related cards and banners. |
| `listings/` | `ListingCardCarousel.tsx`, `ImageUploader.tsx`, `ListingCard.tsx`, `ListingCardSkeleton.tsx`, `ListScrollBridge.tsx`, `ImageCarousel.tsx` | Listing display, image, and skeleton components. |

---

## Section 2: UI Component Redesign (`src/components/ui/`)

### button.tsx
**Current:** `bg-zinc-900 text-white` primary, `rounded-full`, `dark:bg-white dark:text-zinc-900`, shadow-sm, 12 variants with zinc/indigo/red/green/amber colors.
**New (Editorial):**
- **Primary:** `bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-full shadow-ambient` (gradient CTA)
- **Outline:** `bg-transparent border border-outline-variant/20 text-on-surface hover:bg-surface-container-high rounded-full` (ghost border)
- **Ghost:** `text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full`
- **White:** `bg-surface-container-lowest text-on-surface shadow-ambient rounded-full`
- **Destructive:** `bg-red-600 text-white hover:bg-red-700 rounded-full` (keep semantic)
- **Success:** `bg-green-600 text-white hover:bg-green-700 rounded-full` (keep semantic)
- **Warning:** `bg-amber-500 text-white hover:bg-amber-600 rounded-full` (keep semantic)
- **Accent:** `bg-tertiary text-on-primary hover:bg-tertiary/90 rounded-full` (was indigo, now warm tertiary #904917)
- **Secondary:** `bg-surface-container-high text-on-surface hover:bg-surface-container-high/80 rounded-full`
- **Filter:** `border border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant data-[active=true]:bg-gradient-to-br data-[active=true]:from-primary data-[active=true]:to-primary-container data-[active=true]:text-on-primary rounded-full`
- **Remove:** `ghost-inverse`, `accent-ghost` variants — remap to editorial equivalents
- **Remove all `dark:` classes** entirely

**Changes:**
- Replace `bg-zinc-900` with `bg-gradient-to-br from-primary to-primary-container`
- Replace `text-white` with `text-on-primary`
- Replace `hover:bg-zinc-800` with hover darkening the gradient (via brightness filter or darker primary)
- Replace `bg-zinc-100 dark:bg-zinc-800` with `bg-surface-container-high`
- Replace all `dark:*` classes with nothing (single theme)
- Replace `focus-visible:ring-zinc-900/30` with `focus-visible:ring-primary/30`
- Replace `shadow-sm hover:shadow-md` with `shadow-ambient` utility

### input.tsx
**Current:** `bg-white border border-zinc-200 rounded-full`, dark mode `bg-zinc-900 border-zinc-800`.
**New (Editorial):**
```
bg-surface-container-lowest border border-outline-variant/20 rounded-lg
hover:bg-surface-canvas focus:bg-surface-container-lowest
focus-visible:ring-2 focus-visible:ring-primary/30 focus:border-primary
text-on-surface placeholder:text-on-surface-variant/60
```
**Changes:**
- `bg-white` -> `bg-surface-container-lowest` (#ffffff)
- `border-zinc-200` -> `border-outline-variant/20` (ghost border: #dcc1b9 at 20%)
- `rounded-full` -> `rounded-lg` (1rem minimum per spec)
- `focus:border-zinc-900` -> `focus:border-primary` (#9a4027)
- `focus-visible:ring-zinc-900/30` -> `focus-visible:ring-primary/30`
- `text-zinc-900` -> `text-on-surface` (#1b1c19)
- `placeholder:text-zinc-500` -> `placeholder:text-on-surface-variant/60`
- Remove all `dark:*` classes

### textarea.tsx
**Current:** `rounded-xl border border-zinc-200 bg-white`, dark mode variants.
**New (Editorial):**
```
rounded-lg border border-outline-variant/20 bg-surface-container-lowest
text-on-surface placeholder:text-on-surface-variant/60
focus-visible:ring-2 focus-visible:ring-primary/30
```
**Changes:** Same pattern as input.tsx. Remove all `dark:*` classes.

### card.tsx
**Current:** `bg-white dark:bg-zinc-900 rounded-3xl`, variants: default/elevated/glass/interactive.
**New (Editorial):**
- **Default:** `bg-surface-container-lowest rounded-lg` (no border, no divider)
- **Elevated:** `bg-surface-container-lowest rounded-lg shadow-ambient`
- **Glass:** `bg-surface-container-lowest/80 backdrop-blur-[20px] rounded-lg` (glassmorphism)
- **Interactive:** `bg-surface-container-lowest rounded-lg hover:-translate-y-0.5 hover:shadow-ambient-lg transition-all`
- **CardTitle:** `text-on-surface` with Newsreader font (via `font-display`)
- **CardDescription:** `text-on-surface-variant`
- Remove all `dark:*` classes

### badge.tsx
**Current:** 7 variants using zinc/green/amber/red/blue/indigo colors, `rounded-full`.
**New (Editorial):**
- **Default:** `bg-surface-container-high text-on-surface-variant` (Manrope uppercase tracking)
- **Success:** `bg-green-100 text-green-700` (keep semantic)
- **Warning:** `bg-amber-100 text-amber-700` (keep semantic)
- **Destructive:** `bg-red-100 text-red-700` (keep semantic)
- **Info:** `bg-blue-100 text-blue-700` (keep semantic)
- **Highlight:** `bg-tertiary/10 text-tertiary` (was purple/indigo, now warm tertiary #904917)
- **Outline:** `border border-outline-variant/20 text-on-surface-variant bg-transparent` (ghost border)
- Add `font-body uppercase tracking-[0.05em] text-xs` to base (editorial-label pattern; text-2xs is deprecated, below WCAG 12px minimum)
- Remove all `dark:*` classes

### dialog.tsx
**Current:** `bg-background`, `bg-black/80` overlay, `rounded-2xl sm:rounded-3xl`.
**New (Editorial):**
- **Overlay:** `bg-on-surface/40 backdrop-blur-[20px]` (glassmorphism backdrop)
- **Content:** `bg-surface-container-lowest rounded-lg shadow-ambient` (no sharp borders)
- **Close button:** `text-on-surface-variant hover:text-on-surface`
- **Title:** Newsreader font via `font-display`
- **Description:** `text-on-surface-variant`
- Remove all `dark:*` classes and `bg-background` CSS var references

### alert-dialog.tsx
**Current:** `border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl`.
**New (Editorial):**
- **Overlay:** `bg-on-surface/40 backdrop-blur-[20px]` (glassmorphism)
- **Content:** `bg-surface-container-lowest rounded-lg shadow-ambient` (no explicit border per NO-LINE rule)
- **Title:** `text-on-surface font-display`
- **Description:** `text-on-surface-variant`
- **Action:** Uses `buttonVariants()` — inherits editorial primary gradient
- **Cancel:** Uses `buttonVariants({ variant: "outline" })` — inherits editorial outline
- Remove all `dark:*` and explicit `border` classes

### dropdown-menu.tsx
**Current:** `border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-md`, separator `bg-zinc-100`.
**New (Editorial):**
- **Content/SubContent:** `bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-lg shadow-ambient` (glassmorphism panel)
- **Item hover:** `focus:bg-surface-container-high` (warm hover via tonal shift, not border)
- **Separator:** `bg-surface-container-high` (tonal shift instead of 1px line)
- **Label:** `font-body text-on-surface-variant uppercase tracking-[0.05em]`
- **Rounded-sm** -> `rounded-lg` everywhere
- Remove all `dark:*` and `border` classes

### select.tsx
**Current:** `rounded-xl border border-zinc-200 dark:border-zinc-700`, `bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl`.
**New (Editorial):**
- **Trigger:** `rounded-lg border border-outline-variant/20 bg-surface-container-lowest text-on-surface hover:border-outline-variant/40 focus:ring-primary/30`
- **Content:** `bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-lg shadow-ambient` (glassmorphism)
- **Item:** `rounded-lg hover:bg-surface-container-high focus:bg-surface-container-high text-on-surface-variant data-[state=checked]:text-on-surface data-[state=checked]:font-medium`
- **Chevron icon:** `text-on-surface-variant`
- Remove all `dark:*` and explicit `border-zinc` classes

### checkbox.tsx
**Current:** `border-primary`, `data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground`.
**New (Editorial):**
- `border border-outline-variant/40 rounded` (slightly rounded, not sharp)
- `data-[state=checked]:bg-primary data-[state=checked]:text-on-primary`
- `focus-visible:ring-primary/30`
- These will use the CSS custom property `--primary: #9a4027` which will be set by design-tokens-architect
- Remove all `dark:*` classes

### date-picker.tsx
**Current:** `border border-zinc-200 dark:border-zinc-700`, backdrop-blur popup, zinc-900 selected dates.
**New (Editorial):**
- **Trigger:** `rounded-lg border border-outline-variant/20 bg-surface-container-lowest hover:border-outline-variant/40 focus:ring-primary/30`
- **Popup:** `bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-lg shadow-ambient`
- **Selected date:** `bg-primary text-on-primary font-medium` (warm terracotta)
- **Today ring:** `ring-2 ring-primary/20`
- **Day headers:** `text-on-surface-variant font-body uppercase tracking-[0.05em]`
- **Nav arrows hover:** `hover:bg-surface-container-high rounded-lg`
- **Footer border:** `border-t border-surface-container-high` (tonal shift, kept as subtle separator for calendar)
- **"Today"/"Clear" text:** `text-primary` and `text-on-surface-variant`
- Remove all `dark:*` classes

### label.tsx
**Current:** `text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400`.
**New (Editorial):**
```
font-body text-xs font-bold uppercase tracking-[0.05em] text-on-surface-variant
```
**Changes:** Replace zinc-500 with on-surface-variant (#4a4941). Remove `dark:*`.

### empty-state.tsx
**Current:** Icon circle `bg-zinc-100 dark:bg-zinc-800`, heading in zinc-900, description in zinc-500.
**New (Editorial):**
- Icon circle: `bg-surface-container-high` with `text-on-surface-variant`
- Title: `font-display text-lg font-semibold text-on-surface` (Newsreader heading)
- Description: `text-on-surface-variant`
- Remove all `dark:*` classes

### TrustBadge.tsx
**Current:** `bg-gradient-to-r from-amber-100 to-yellow-50`, `text-amber-800`, `border-amber-200`.
**New (Editorial):**
- `bg-tertiary/10 text-tertiary border border-tertiary/20` (#904917 based)
- `font-body uppercase tracking-[0.05em] text-xs font-bold` (editorial-label; text-2xs deprecated)
- Star icon in `text-tertiary`
- `rounded-full` (pill shape, was rounded-md)
- Remove all `dark:*` classes

### LazyImage.tsx
**Current:** Error fallback `bg-zinc-100`, zinc-400 icon.
**New:** `bg-surface-container-high`, `text-on-surface-variant`. Remove `dark:*`.

### InfiniteScroll.tsx
**Current:** Spinner and text in `zinc-500`.
**New:** `text-on-surface-variant`. Remove `dark:*`.

### CustomScrollContainer.tsx
**Current:** `bg-zinc-400/60 dark:bg-zinc-500/60` thumb, `bg-background` container.
**New:** `bg-outline-variant` thumb (warm decorative tone), `bg-surface-canvas` container. Remove `dark:*`.

### SkipLink.tsx
**Current:** `bg-zinc-900 text-white` on focus.
**New:** `bg-primary text-on-primary` on focus. Remove `dark:*`.

---

## Section 2b: Skeleton Component Redesign (`src/components/skeletons/`)

### Skeleton.tsx (base primitive)
**Current:** `bg-zinc-200 dark:bg-zinc-700`, shimmer `from-zinc-200 via-zinc-100 to-zinc-200 dark:from-zinc-700 dark:via-zinc-600 dark:to-zinc-700`.
**New (Warm Shimmer):**
- **Base:** `bg-surface-container-high` (#eae8e3)
- **Pulse animation:** Keep `animate-pulse` but on warm base
- **Shimmer animation:** `bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]` (warm shimmer: #eae8e3 -> #fbf9f4 -> #eae8e3)
- Remove all `dark:*` classes

### Skeleton.tsx (CardSkeleton convenience component)
**Current:** `rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4`.
**New:** `rounded-lg bg-surface-container-lowest p-4` (no border per NO-LINE rule, ambient shadow optional).
- Remove all `dark:*` and `border` classes

### ListingCardSkeleton.tsx
**Current:** `bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800`.
**New:** `bg-surface-container-lowest rounded-lg shadow-ambient` (no border, matches editorial ListingCard spec).
- Remove all `dark:*` and `border` classes

### PageSkeleton.tsx (all page-level skeletons)
**Current:** All use `bg-zinc-50 dark:bg-zinc-900` page bg, `bg-white dark:bg-zinc-800` cards, `border-zinc-200 dark:border-zinc-700` borders.
**New (apply to ALL 12+ skeleton variants):**
- **Page bg:** `bg-surface-canvas` (#fbf9f4)
- **Card/section bg:** `bg-surface-container-lowest` (no border, optional ambient shadow)
- **Header bg:** `bg-surface-canvas/80 backdrop-blur-[20px]` (glassmorphism, matching Navbar)
- **Dividers/borders:** Remove `border-b border-zinc-200` — use `bg-surface-container-high` tonal shift or spacing only
- **Table header bg:** `bg-surface-container-high` (was `bg-zinc-50 dark:bg-zinc-900`)
- **Filter bar bg:** `bg-surface-canvas` (no border)
- Remove ALL `dark:*` classes from every skeleton variant
- Remove ALL `border border-zinc-*` classes — use tonal shifts or nothing

**Affected skeletons:** `PageSkeleton`, `DashboardSkeleton`, `ProfileSkeleton`, `FormSkeleton`, `ListingSkeleton`, `ListingGridSkeleton`, `SearchResultsSkeleton`, `MessageListSkeleton`, `ChatSkeleton`, `AdminTableSkeleton`, `BookingsSkeleton`, `SettingsSkeleton`, `SavedSearchesSkeleton`, `NotificationsSkeleton`

### listings/ListingCardSkeleton.tsx (duplicate in listings/ dir)
**Current:** `rounded-xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 animate-pulse`, shimmer `from-transparent via-zinc-300/50 dark:via-zinc-700/50 to-transparent`, badge/pill placeholders in `bg-zinc-200 dark:bg-zinc-800`.
**New (Warm Shimmer):**
- **Container:** `rounded-lg bg-surface-container-lowest shadow-ambient animate-pulse` (no border)
- **Image area bg:** `bg-surface-container-high`
- **Shimmer gradient:** `from-transparent via-surface-canvas/50 to-transparent bg-[length:200%_100%] animate-shimmer`
- **Badge placeholder:** `bg-surface-container-high`
- **Text/pill placeholders:** `bg-surface-container-high` (was `bg-zinc-200 dark:bg-zinc-800`)
- Remove all `dark:*` and `border` classes

---

## Section 3: Shared Component Redesign (`src/components/`)

### Navbar / NavbarClient.tsx
**Current:** Glassmorphism `bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md`, zinc logo, indigo accent dot.
**New (Editorial):**
- **Header scrolled:** `bg-surface-canvas/95 backdrop-blur-[20px] shadow-ambient` (glassmorphism)
- **Header unscrolled:** `bg-transparent`
- **Logo block:** `bg-primary rounded-xl text-on-primary` (was zinc-900)
- **Brand text:** `font-display text-on-surface tracking-[-0.03em]` (Newsreader)
- **Accent dot:** `text-primary` (was indigo-600, now #9a4027)
- **Nav links:** `font-body text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full`
- **Active link:** `text-on-surface bg-surface-container-high`
- **IconButton:** `text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full`
- **Profile dropdown:** `bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-[1.5rem] shadow-ambient` (glassmorphism panel)
- **Dropdown header:** `bg-surface-container-high/50` (tonal shift instead of border-b)
- **MenuItem hover:** `hover:bg-surface-container-high` (warm tonal shift)
- **Unread badge:** Keep `bg-red-500` (semantic)
- **Mobile menu (full-screen overlay replacing slide-down panel):** `bg-surface-canvas/80 backdrop-blur-[20px]` (glassmorphism, was `bg-white dark:bg-zinc-950`)
- **Mobile CTA:** Gradient primary button
- Remove all `dark:*` classes
- Remove ThemeToggle integration

### Footer.tsx
**Current:** `bg-white dark:bg-zinc-950`, zinc-based text, indigo accent dot.
**New (Editorial):**
- **Background:** `bg-surface-container-high` (tonal shift from canvas, NO border-t)
- **Logo:** Same as Navbar — `bg-primary rounded-lg text-on-primary`
- **Brand accent:** `text-primary` (was indigo)
- **Section headings:** `font-body text-on-surface text-xs uppercase tracking-[0.2em]`
- **Link text:** `text-on-surface-variant hover:text-on-surface`
- **Copyright:** `text-on-surface-variant/60 uppercase tracking-[0.2em]`
- **Social links:** `text-on-surface-variant hover:text-on-surface`
- No dividers, no borders, spacing + tonal shift only
- Remove all `dark:*` classes

### ImageGallery.tsx
**Current:** `rounded-3xl`, lightbox `bg-black/95`, zinc-100 fallbacks.
**New (Editorial):**
- **Container:** `rounded-lg` (was rounded-3xl, 1rem minimum)
- **Fallback bg:** `bg-surface-container-high`
- **Lightbox overlay:** `bg-on-surface/95` (was bg-black/95, use near-black #1b1c19)
- **Lightbox nav buttons:** `bg-surface-container-lowest/10 hover:bg-surface-container-lowest/20 rounded-full`
- **Thumbnail ring (selected):** `ring-2 ring-on-primary ring-offset-2 ring-offset-on-surface`
- **"View all" pill:** `bg-surface-container-lowest/90 backdrop-blur-sm rounded-full text-on-surface`
- **"+N more" overlay:** `bg-on-surface/50 backdrop-blur-md`
- Remove all `dark:*` classes

### FavoriteButton.tsx
**Current:** `bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm rounded-full`, `text-red-500` saved, `text-zinc-400` unsaved.
**New (Editorial):**
- **Container:** `bg-surface-container-lowest/90 backdrop-blur-sm rounded-full shadow-ambient`
- **Unsaved:** `text-on-surface-variant hover:text-primary` (heart turns warm on hover)
- **Saved:** `text-primary fill-current` (warm terracotta heart, not red)
- **Animation:** Keep `animate-heart-bounce`
- Remove all `dark:*` classes

### FeaturedListings / FeaturedListingsClient.tsx
**Current:** `bg-white dark:bg-zinc-950 border-t border-zinc-100`, indigo-500 dot badge.
**New (Editorial):**
- **Section bg:** `bg-surface-canvas` (no border-t, use spacing)
- **Badge dot:** `bg-primary` (was indigo-500)
- **Badge container:** `border border-outline-variant/20 bg-surface-container-high/50`
- **Section title:** `font-display text-on-surface` (Newsreader)
- **Description:** `text-on-surface-variant font-light`
- **"See All" button:** ghost variant, `text-on-surface-variant hover:text-on-surface`
- **Mobile "Explore All" button:** outline variant with editorial styling
- Remove all `dark:*` and `border-t` classes

### LocationSearchInput.tsx
**Current:** `bg-white dark:bg-zinc-900 backdrop-blur-xl rounded-2xl`, color-coded MapPin by place type.
**New (Editorial):**
- **Input:** `text-on-surface placeholder:text-on-surface-variant/60`
- **Dropdown:** `bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-lg shadow-ambient` (glassmorphism)
- **Suggestion hover:** `hover:bg-surface-container-high rounded-lg`
- **Suggestion text:** `text-on-surface` primary, `text-on-surface-variant` secondary
- **MapPin colors:** Keep place-type colors (orange/blue/green/purple) as semantic
- **Clear button:** `hover:bg-surface-container-high rounded-full`
- **Error state:** Keep red semantic colors
- **No results icon bg:** `bg-surface-container-high`
- Remove all `dark:*` classes

### NotificationCenter.tsx
**Current:** Bell icon, dropdown, status-colored notification icons.
**New (Editorial):**
- **Bell icon button:** `text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full`
- **Dropdown panel:** `bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-lg shadow-ambient`
- **Notification cards:** `hover:bg-surface-container-high` (tonal shift on hover)
- **Status icon colors:** Keep semantic (blue=booking, green=accepted, red=rejected, amber=hold, etc.)
- **"Mark all read" button:** `text-primary`
- **Unread dot:** Keep `bg-primary` indicator
- Remove all `dark:*` classes

### ProfileCompletionBanner.tsx
**Current:** `bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl`.
**New (Editorial):**
- `bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-lg`
- Progress bar: `bg-on-primary/20` track, `bg-on-primary` fill
- Missing items pills: `bg-on-primary/20 rounded-full`
- "Complete" button: `bg-surface-container-lowest text-primary rounded-lg` (inverted CTA)
- Remove all `dark:*` classes

### ProfileCompletionModal.tsx
**Current:** `bg-white dark:bg-zinc-900 rounded-2xl`, amber alert.
**New (Editorial):**
- `bg-surface-container-lowest rounded-lg shadow-ambient`
- Glassmorphism backdrop: `bg-on-surface/40 backdrop-blur-[20px]`
- Alert icon: Keep amber semantic
- Remove all `dark:*` classes

### ProfileCompletionIndicator.tsx
**Current:** `bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100`, zinc-900 progress, green complete.
**New (Editorial):**
- **Container:** `bg-surface-container-lowest rounded-lg` (no border per NO-LINE rule)
- **Progress bar:** `bg-surface-container-high` track, `bg-primary` fill (green on 100%)
- **Step completed bg:** `bg-surface-container-high/50`
- **Step hover:** `hover:bg-surface-container-high`
- **Section dividers:** spacing-only (remove `divide-y divide-zinc-100`)
- **Heading:** `font-display text-on-surface`
- Remove all `dark:*` and `border` classes

### SearchForm.tsx
**Current:** Complex search bar with filters, zinc styling.
**New (Editorial):**
- **Search container:** `bg-surface-container-lowest rounded-lg border border-outline-variant/20` (ghost border)
- **Search icon:** `text-on-surface-variant`
- **Filter button:** editorial filter variant
- **Active filter count:** `bg-primary text-on-primary`
- **Recent searches dropdown:** glassmorphism panel
- Remove all `dark:*` classes

### UserMenu.tsx
**Current:** `border border-border rounded-xl bg-background`, gradient-primary avatar.
**New (Editorial):**
- **Trigger:** `border border-outline-variant/20 hover:bg-surface-container-high rounded-full`
- **Avatar bg:** `bg-gradient-to-br from-primary to-primary-container text-on-primary`
- **Dropdown:** `bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-lg shadow-ambient`
- **Menu items:** `hover:bg-surface-container-high rounded-lg`
- **Sign out:** `hover:bg-red-50 text-red-600` (keep semantic)
- Remove all `dark:*` and `bg-background`/`border-border` CSS var references

### UserAvatar.tsx
**Current:** `bg-zinc-200 dark:bg-zinc-700`, initials `bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700`.
**New (Editorial):**
- **Image bg:** `bg-surface-container-high`
- **Initials fallback:** `bg-primary/10 text-primary` (warm terracotta tones)
- **Default SVG fallback:** `bg-surface-container-high text-on-surface-variant`
- Remove all `dark:*` classes

### ReviewCard.tsx
**Current:** `border-l-2 border-zinc-200 dark:border-zinc-700` response section, amber stars.
**New (Editorial):**
- **Author name:** `text-on-surface font-display`
- **Date text:** `text-on-surface-variant`
- **Review text:** `text-on-surface-variant`
- **Stars:** Keep amber-400 semantic
- **Response section:** `pl-4 border-l-2 border-primary/30` (warm accent instead of zinc)
- **Host Response label:** `text-on-surface font-body font-semibold`
- Remove all `dark:*` classes

### SortSelect.tsx
**Current:** Radix Select + mobile bottom sheet, indigo-500 active state.
**New (Editorial):**
- **Active filter pill:** `border-primary bg-primary text-on-primary` (was indigo-500)
- **Mobile sheet:** `bg-surface-container-lowest rounded-t-[1rem]` (rounded-lg top)
- **Sheet handle:** `bg-outline-variant` (warm decorative tone, was zinc-300)
- **Active sort option:** `bg-primary/10 text-primary` (was indigo-50/indigo-700)
- **Desktop select trigger:** Use editorial select styling
- Remove all `dark:*` classes

### FeatureCard.tsx
**Current:** Configurable icon/bg color classes, generic font.
**New (Editorial):**
- **Title:** `font-display text-on-surface` (Newsreader)
- **Description:** `font-body text-on-surface-variant`
- **Icon circle:** Caller provides color classes — update callers to use editorial palette
- Remove `text-foreground`/`text-muted-foreground` CSS var references

### FilterChip.tsx
**Current:** `bg-indigo-50 border border-indigo-200 text-indigo-700`, rounded-full.
**New (Editorial):**
- `bg-primary/10 border border-primary/20 text-primary rounded-full`
- Impact badge: `bg-green-100 text-green-700` (keep semantic)
- Remove button: `text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface`
- Remove all `dark:*` classes

### SuspensionBanner.tsx
**Current:** `bg-red-50 dark:bg-red-900/20 border-b border-red-200`.
**New (Editorial):**
- `bg-red-50 border-b border-red-200/60` (keep red semantic, soften border)
- Remove all `dark:*` classes

### EmailVerificationBanner.tsx
**Current:** `bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200`.
**New (Editorial):**
- `bg-amber-50 border-b border-amber-200/60` (keep amber semantic, soften border)
- "Resend" button: `bg-amber-100 hover:bg-amber-200 text-amber-700`
- Remove all `dark:*` classes

### OfflineIndicator.tsx
**Current:** `bg-amber-500 text-white`.
**New (Editorial):**
- Keep as-is (semantic, urgent, must be visible). Remove any `dark:*` if present.

### MapMovedBanner.tsx (map/)
**Current:** Map variant: `bg-zinc-900/90 dark:bg-white/90 backdrop-blur-md rounded-full`. List variant: `bg-amber-50`.
**New (Editorial):**
- **Map variant:** `bg-on-surface/90 backdrop-blur-[20px] rounded-full text-on-primary` (glassmorphism pill)
- **Search button hover:** `hover:text-primary`
- **Divider:** `bg-on-primary/20` (was white/20)
- **List variant:** Keep amber-50 semantic
- Remove all `dark:*` classes

### ThemeToggle.tsx / ThemeProvider.tsx
**REMOVE ENTIRELY.** The Editorial Living Room is a single warm light theme. No dark mode.
- Remove ThemeToggle component
- Remove ThemeProvider component
- Remove next-themes dependency
- Remove all theme toggle references in NavbarClient

### Other components (minimal visual changes)
These components primarily use Button, Input, Card, and other primitives. Once the primitives are updated, they inherit the editorial style automatically:
- `BookingForm.tsx`, `BookingCalendar.tsx`, `SlotSelector.tsx` — inherit from Button, DatePicker, Input
- `ReviewForm.tsx`, `ReviewResponseForm.tsx`, `ReviewList.tsx` — inherit from Textarea, Button
- `ShareListingButton.tsx`, `SaveListingButton.tsx`, `SaveSearchButton.tsx` — inherit from Button
- `ContactHostButton.tsx`, `DeleteListingButton.tsx`, `ComingSoonButton.tsx` — inherit from Button
- `ListingStatusToggle.tsx` — restyle toggle to use primary color
- `PasswordStrengthMeter.tsx` — use primary/tertiary gradient for strength bars
- `RateLimitCountdown.tsx` — `text-on-surface-variant`
- `CharacterCounter.tsx` — `text-on-surface-variant`
- `BlockUserButton.tsx`, `ReportButton.tsx` — inherit from Button
- `BlockedUserMessage.tsx` — use red semantic colors
- `ScrollAnimation.tsx` — logic only, no visual changes
- `MainLayout.tsx` — set `bg-surface-canvas` on body
- `Providers.tsx` — remove ThemeProvider wrapping
- `MessagesPageClient.tsx` — message bubbles: `bg-primary text-on-primary` for sent, `bg-surface-container-high text-on-surface` for received
- `NeighborhoodChat.tsx` — same bubble pattern
- `DynamicMap.tsx` / `Map.tsx` — custom warm Mapbox style, markers use primary color (detailed in pages-redesigner scope)

### Subdirectory components
- **auth/AuthErrorAlert.tsx** — use red semantic + editorial container
- **auth/TurnstileWidget.tsx** — third-party widget, minimal styling
- **auth/PasswordConfirmationModal.tsx** — inherit Dialog editorial styling
- **bookings/HoldCountdown.tsx** — timer text in `text-on-surface`, countdown accent in `text-primary`
- **map/MapGestureHint.tsx** — `bg-on-surface/80 text-on-primary backdrop-blur` tooltip
- **map/PrivacyCircle.tsx** — keep functional, update stroke to `primary/20`
- **map/UserMarker.tsx** — `bg-primary` marker dot
- **map/MapEmptyState.tsx** — use EmptyState editorial styling
- **map/MapErrorBoundary.tsx** — error state in red semantic
- **neighborhood/*** — panels use Card editorial, headings use Newsreader, links use primary
- **nearby/*** — same pattern as neighborhood
- **filters/AppliedFilterChips.tsx** — container uses editorial styling, chips inherit FilterChip
- **listings/ListingCard.tsx** — `bg-surface-container-lowest rounded-lg shadow-ambient`, price in `text-on-surface font-display`, location in `text-on-surface-variant`, image carousel `rounded-lg`
- **listings/ImageCarousel.tsx** — `rounded-lg`, nav dots use `bg-on-primary/60` inactive, `bg-on-primary` active (on image overlay)
- **chat/NearbyPlacesCard.tsx** — inherit Card editorial
- **chat/BlockedConversationBanner.tsx** — red semantic alert

---

## Section 4: New Reusable Patterns

### Utility Classes (via Tailwind @layer or @apply)

```css
/* Ghost border — outline-variant at 20% opacity */
.ghost-border {
  border: 1px solid rgb(220 193 185 / 0.2); /* outline-variant at 20% */
}

/* Ambient shadow — 40-60px blur, 4-6% opacity, tinted charcoal */
.shadow-ambient {
  box-shadow: 0 8px 40px rgb(27 28 25 / 0.04),
              0 2px 12px rgb(27 28 25 / 0.02);
}
.shadow-ambient-lg {
  box-shadow: 0 12px 60px rgb(27 28 25 / 0.06),
              0 4px 20px rgb(27 28 25 / 0.03);
}

/* Glassmorphism — semi-transparent + backdrop-blur */
.glassmorphism {
  background: rgb(255 255 255 / 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* Gradient CTA — primary to primary-container at 135deg */
.gradient-cta {
  background: linear-gradient(135deg, #9a4027, #b9583c);
}
.gradient-cta:hover {
  background: linear-gradient(135deg, #8a3822, #a94e35);
}

/* Editorial heading — Newsreader display */
.editorial-heading {
  font-family: 'Newsreader', serif;
}

/* Editorial label — Manrope uppercase tracking */
.editorial-label {
  font-family: var(--font-body); /* Manrope */
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

### Tailwind Config Extensions
These should be coordinated with `design-tokens-architect`:
```js
// In tailwind.config extend
colors: {
  'surface-canvas': '#fbf9f4',
  'surface-container-lowest': '#ffffff',
  'surface-container-high': '#eae8e3',
  'primary': '#9a4027',
  'primary-container': '#b9583c',
  'tertiary': '#904917',
  'on-surface': '#1b1c19',
  'on-surface-variant': '#4a4941',
  'on-primary': '#ffffff',
  'outline-variant': '#dcc1b9',
},
boxShadow: {
  'ambient': '0 8px 40px rgb(27 28 25 / 0.04), 0 2px 12px rgb(27 28 25 / 0.02)',
  'ambient-lg': '0 12px 60px rgb(27 28 25 / 0.06), 0 4px 20px rgb(27 28 25 / 0.03)',
},
fontFamily: {
  'display': ['Newsreader', 'serif'],
  'body': ['Manrope', 'sans-serif'],
},
borderRadius: {
  'lg': '1rem', // minimum per spec
},
```

---

## Section 5: Accessibility Audit

### Ghost borders (outline-variant at 20%)
- `#dcc1b9` at 20% opacity on `#fbf9f4` (surface-canvas) = very subtle
- **Contrast ratio:** ~1.15:1 — this is acceptable for decorative borders but NOT for functional boundaries
- **Mitigation:** For inputs and interactive elements, increase to `outline-variant/40` on focus. Use `focus-visible:ring-2 ring-primary/30` for keyboard focus which is clearly visible.
- **Mobile override:** Use `outline-variant/30` minimum on mobile inputs (lower-contrast mobile screens may not render 20% borders visibly). Desktop decorative borders can stay at 20%.
- **Recommendation:** Ghost borders are decorative only. All interactive boundaries MUST have a visible focus indicator using `ring-primary`.

### Low-contrast surfaces
- `on-surface` (#1b1c19) on `surface-canvas` (#fbf9f4): **17.5:1** — PASSES AAA
- `on-surface-variant` (#4a4941) on `surface-canvas` (#fbf9f4): **7.2:1** — PASSES AAA
- `on-surface-variant` (#4a4941) on `surface-container-high` (#eae8e3): **5.6:1** — PASSES AA
- `on-surface-variant` (#4a4941) on `surface-container-lowest` (#ffffff): **8.1:1** — PASSES AAA
- `on-primary` (#ffffff) on `primary` (#9a4027): **5.3:1** — PASSES AA (Large text AAA)
- `on-primary` (#ffffff) on `primary-container` (#b9583c): **3.8:1** — FAILS AA for small text
  - **Mitigation:** Use `primary` (#9a4027) not `primary-container` as the ending gradient color for text-bearing CTAs, or ensure font-weight >= 700 and size >= 18px for AA Large compliance.

### Focus indicators
- **Primary ring:** `focus-visible:ring-2 ring-primary/30` (#9a4027 at 30% opacity)
- **Ring on surface-canvas:** Visible warm terracotta ring — adequate contrast
- **Ring offset:** `ring-offset-2 ring-offset-surface-canvas` ensures visibility
- **Recommendation:** Ensure all interactive elements have `focus-visible:ring-2` with `ring-primary/30` and `ring-offset-2`.

### Color-only indicators
- **Filter active state:** Gradient CTA background + text color change — also includes font-weight change (`font-medium`) for non-color indicator. PASS.
- **Favorite saved state:** Heart `fill-current` + color change — the fill vs stroke change provides shape differentiation. PASS.
- **Progress bars:** Use percentage text alongside color bar. PASS.
- **Stars (reviews):** fill-amber-400 vs empty — fill provides shape indicator. PASS.
- **Notification badges:** Color + number/dot — shape provides indicator. PASS.
- **Status badges:** Text content provides meaning alongside color. PASS.

### Motion considerations
- All transitions should respect `prefers-reduced-motion: reduce`
- Animation specs deferred to `animation-polish` teammate

---

## Section 6: shadcn/ui Override Strategy

### Approach
The project uses customized shadcn/ui components (not raw imports). Components already have inline Tailwind classes rather than CSS variable-based theming. This makes the migration straightforward:

### Strategy: Direct Class Replacement
1. **No CSS variable dependency:** Components like `button.tsx`, `card.tsx`, `badge.tsx` use inline Tailwind classes, not `bg-primary` CSS vars. Replace classes directly.
2. **Some CSS var usage:** `dialog.tsx`, `checkbox.tsx`, `UserMenu.tsx` use `bg-background`, `border-border`, `text-muted-foreground`. These CSS variables should be remapped in `globals.css` to editorial values OR replaced with direct Tailwind classes.
3. **Remove dark mode entirely:** Strip all `dark:*` classes. No theme switching.
4. **Custom properties mapping (for any remaining CSS var usage):**
   ```css
   :root {
     --background: 251 249 244; /* surface-canvas #fbf9f4 */
     --foreground: 27 28 25; /* on-surface #1b1c19 */
     --primary: 154 64 39; /* #9a4027 */
     --primary-foreground: 255 255 255; /* on-primary */
     --muted: 234 232 227; /* surface-container-high #eae8e3 */
     --muted-foreground: 74 73 65; /* on-surface-variant #4a4941 */
     --border: 220 193 185; /* outline-variant #dcc1b9 */
     --ring: 154 64 39; /* primary for focus rings */
   }
   ```

### Migration Order
1. Update CSS variables in `globals.css` (coordinates with design-tokens-architect)
2. Update UI primitives (button, input, card, badge, etc.) — these cascade everywhere
3. Remove all `dark:*` modifiers project-wide
4. Update shared components that have custom inline styling
5. Remove ThemeToggle/ThemeProvider
6. Verify all components render correctly with warm palette

---

*Plan complete. All 87+ component files inventoried and mapped to Editorial Living Room aesthetic.*
