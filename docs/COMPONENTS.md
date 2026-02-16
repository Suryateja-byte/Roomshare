# Component Reference

Guide to the Roomshare React component library, contexts, and hooks.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [UI Primitives](#ui-primitives)
- [Search Components](#search-components)
- [Map Components](#map-components)
- [Listing Components](#listing-components)
- [Messaging Components](#messaging-components)
- [Booking Components](#booking-components)
- [Auth and Verification Components](#auth-and-verification-components)
- [Nearby Places Components](#nearby-places-components)
- [Layout Components](#layout-components)
- [Error and Feedback Components](#error-and-feedback-components)
- [Skeleton Components](#skeleton-components)
- [Contexts](#contexts)
- [Hooks](#hooks)

---

## Architecture Overview

### Client vs. server components

Roomshare is a Next.js app using the App Router. Components follow this split:

- **Server components** (default) -- Used for pages, data fetching, and layout. No `"use client"` directive.
- **Client components** -- Marked with `"use client"`. Used for interactivity, browser APIs, state, and effects.

### Key conventions

- **Radix UI** for accessible primitives (dialog, dropdown, select, checkbox, alert dialog).
- **Tailwind CSS v4** for styling, composed with `clsx` and `tailwind-merge` via the `cn()` utility.
- **Lucide React** for icons.
- **Framer Motion** (`LazyMotion` with `domAnimation`) for animations.
- **Sonner** for toast notifications.
- All interactive elements meet a 44px minimum touch target (WCAG mobile compliance).
- Dark mode is supported via `next-themes` (`ThemeProvider`).

### File organization

```
src/components/
  ui/              # Reusable design system primitives
  search/          # Search page components
  map/             # Map rendering and interaction
  listings/        # Listing cards and display
  chat/            # Messaging sub-components
  nearby/          # Nearby places integration
  neighborhood/    # Neighborhood exploration module
  auth/            # Authentication UI
  verification/    # Identity verification UI
  error/           # Error boundary and fallbacks
  skeletons/       # Loading skeleton components
  filters/         # Filter chip utilities
```

---

## UI Primitives

Reusable design system components in `src/components/ui/`.

### Button

**File**: `src/components/ui/button.tsx`

Rounded button with variant and size system. All sizes enforce 44px minimum touch target.

| Variant | Usage |
|---|---|
| `primary` | Primary actions (dark bg, inverts in dark mode) |
| `outline` | Secondary actions (bordered) |
| `ghost` | Tertiary actions (no background) |
| `white` | Card actions (white bg) |
| `destructive` | Delete/remove actions (red) |
| `success` | Confirmation actions (green) |
| `warning` | Caution actions (amber) |
| `accent` | Feature CTAs (indigo) |
| `accent-ghost` | Accent without background |
| `secondary` | Muted actions (zinc) |
| `ghost-inverse` | Ghost on dark backgrounds |
| `filter` | Filter toggle buttons (data-active state) |

| Size | Dimensions |
|---|---|
| `default` | h-11, min-h-44px, px-4 |
| `sm` | h-11, min-h-44px, px-3 |
| `lg` | h-12/h-14, min-h-44px, px-6/px-10 |
| `icon` | h-11 w-11, min-h/w-44px |

Supports `asChild` prop via Radix `Slot` for composition.

### Input, Textarea, Label

**Files**: `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/label.tsx`

Standard form inputs styled with Tailwind. Used throughout forms for listings, auth, profile.

### Select

**File**: `src/components/ui/select.tsx`

Built on `@radix-ui/react-select`. Provides `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`.

### Checkbox

**File**: `src/components/ui/checkbox.tsx`

Built on `@radix-ui/react-checkbox`. Used in filter modals for amenities and house rules.

### DatePicker

**File**: `src/components/ui/date-picker.tsx`

Date input component used in filter modals and booking forms.

### Dialog and AlertDialog

**Files**: `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`

Built on Radix primitives. Dialog for modals, AlertDialog for destructive confirmations (e.g., delete listing).

### DropdownMenu

**File**: `src/components/ui/dropdown-menu.tsx`

Built on `@radix-ui/react-dropdown-menu`. Used in navbar user menu, listing action menus, admin actions.

### Card and Badge

**Files**: `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`

Card provides structured container layout. Badge shows status labels (booking status, verification status).

### EmptyState

**File**: `src/components/ui/empty-state.tsx`

Standard empty state component with icon, title, description, and optional CTA. Used for no results, empty inbox, etc.

### Utility UI

| Component | File | Purpose |
|---|---|---|
| `FocusTrap` | `ui/FocusTrap.tsx` | Traps keyboard focus within a container (modals, drawers) |
| `SkipLink` | `ui/SkipLink.tsx` | "Skip to content" accessibility link |
| `VisuallyHidden` | `ui/VisuallyHidden.tsx` | Screen-reader-only content |
| `LazyImage` | `ui/LazyImage.tsx` | Lazy-loaded image with blur placeholder |
| `InfiniteScroll` | `ui/InfiniteScroll.tsx` | Intersection Observer-based infinite scroll trigger |
| `CustomScrollContainer` | `ui/CustomScrollContainer.tsx` | Custom scrollbar styling container |
| `TrustBadge` | `ui/TrustBadge.tsx` | Verified user badge with tooltip |

---

## Search Components

Located in `src/components/search/`. These power the `/search` page.

### SearchResultsClient

**File**: `src/components/search/SearchResultsClient.tsx`

The main search results list. Client component keyed by `searchParamsString` -- any filter/sort/query change remounts the component and resets cursor + accumulated listings.

**Key behaviors**:
- Cursor-based pagination via `fetchMoreListings` server action
- Deduplication via `seenIdsRef` (Set of listing IDs)
- 60-item cap (`MAX_ACCUMULATED`) to protect low-end devices
- Zero results handling with `ZeroResultsSuggestions`
- Split stay cards integration
- Total price toggle support

### FilterModal

**File**: `src/components/search/FilterModal.tsx`

Full-screen filter drawer with all search filters. Uses `createPortal` for overlay and `FocusTrap` for keyboard accessibility.

**Filters included**: move-in date, lease duration, room type, amenities, house rules, languages, gender preference, household gender, price range (with histogram).

### MobileBottomSheet

**File**: `src/components/search/MobileBottomSheet.tsx`

Draggable bottom sheet for mobile search results. Overlays the map with 3 snap points:

| Snap point | Position | Description |
|---|---|---|
| Collapsed | ~15vh | Just the header peek |
| Half | ~50vh | Default position |
| Expanded | ~85vh | Near full screen |

**Gesture handling**: Drag gestures on handle/header only. Map receives other touch events. Escape key collapses to half. Body scroll locked when expanded. Framer Motion spring animations.

### Other search components

| Component | File | Purpose |
|---|---|---|
| `CategoryBar` | `search/CategoryBar.tsx` | Room type category tabs |
| `CategoryTabs` | `search/CategoryTabs.tsx` | Tab-style category navigation |
| `FilterPill` | `search/FilterPill.tsx` | Individual active filter chip (removable) |
| `PriceRangeFilter` | `search/PriceRangeFilter.tsx` | Price range slider with histogram overlay |
| `PriceHistogram` | `search/PriceHistogram.tsx` | Price distribution histogram |
| `DatePills` | `search/DatePills.tsx` | Quick date selection pills |
| `TotalPriceToggle` | `search/TotalPriceToggle.tsx` | Toggle between monthly and total price display |
| `SortSelect` | `SortSelect.tsx` | Sort option dropdown |
| `CompactSearchPill` | `search/CompactSearchPill.tsx` | Collapsed search summary pill |
| `MobileSearchOverlay` | `search/MobileSearchOverlay.tsx` | Full-screen mobile search input |
| `MobileCardLayout` | `search/MobileCardLayout.tsx` | Mobile-optimized listing card layout |
| `MobileListingPreview` | `search/MobileListingPreview.tsx` | Compact listing preview on map tap |
| `FloatingMapButton` | `search/FloatingMapButton.tsx` | "Show map" floating action button |
| `SplitStayCard` | `search/SplitStayCard.tsx` | Combined listing suggestion card |
| `SuggestedSearches` | `search/SuggestedSearches.tsx` | Search query suggestions |
| `RecommendedFilters` | `search/RecommendedFilters.tsx` | AI-suggested filter combinations |
| `PullToRefresh` | `search/PullToRefresh.tsx` | Pull-to-refresh gesture handler |
| `SearchResultsLoadingWrapper` | `search/SearchResultsLoadingWrapper.tsx` | Loading state wrapper |
| `V1PathResetSetter` | `search/V1PathResetSetter.tsx` | V1 search path state reset |
| `V2MapDataSetter` | `search/V2MapDataSetter.tsx` | V2 search map data synchronization |

---

## Map Components

Located in `src/components/map/` and `src/components/Map.tsx`. Powers the search map and listing detail maps.

### Map

**File**: `src/components/Map.tsx`

The primary map wrapper component used across the application. Handles map initialization, tile loading, and provides the map instance to child components.

### MapClient

**File**: `src/components/map/MapClient.tsx`

Main map component using `react-map-gl` with MapLibre GL. Features:

- GeoJSON clustering with circle layers
- Price markers for individual listings
- Popup on marker click with listing preview
- Search-as-I-move with debounced bounds updates
- Keyboard navigation support
- Two-way sync with listing list (via `ListingFocusContext`)

### Supporting map components

| Component | File | Purpose |
|---|---|---|
| `MapErrorBoundary` | `map/MapErrorBoundary.tsx` | Map-specific error boundary with retry |
| `MapGestureHint` | `map/MapGestureHint.tsx` | "Use two fingers to zoom" hint overlay |
| `MapMovedBanner` | `map/MapMovedBanner.tsx` | "Map moved -- search this area" banner |
| `POILayer` | `map/POILayer.tsx` | Points of interest map layer |
| `PrivacyCircle` | `map/PrivacyCircle.tsx` | Approximate location circle (privacy) |
| `StackedListingPopup` | `map/StackedListingPopup.tsx` | Popup for overlapping markers |
| `BoundaryLayer` | `map/BoundaryLayer.tsx` | Neighborhood/area boundary polygons |
| `UserMarker` | `map/UserMarker.tsx` | Current user location marker |

---

## Listing Components

Located in `src/components/listings/` and root `src/components/`.

### ListingCard

**File**: `src/components/listings/ListingCard.tsx`

Card component for search results and listing lists. Features:

- Image carousel (Embla)
- Price display (monthly)
- Location with state abbreviation
- Available slots indicator
- Average rating and review count
- Household languages display
- Favorite button integration
- Trust badge for verified users
- Hover/focus sync with map markers (via `ListingFocusContext`)

### Other listing components

| Component | File | Purpose |
|---|---|---|
| `ImageCarousel` | `listings/ImageCarousel.tsx` | Embla-based image carousel with navigation |
| `ImageUploader` | `listings/ImageUploader.tsx` | Image upload with preview and drag-drop |
| `ListingCardCarousel` | `listings/ListingCardCarousel.tsx` | Horizontal carousel of listing cards (homepage) |
| `ListingCardSkeleton` | `listings/ListingCardSkeleton.tsx` | Loading skeleton for listing cards |
| `RoomPlaceholder` | `listings/RoomPlaceholder.tsx` | Placeholder image for listings without photos |
| `NearMatchSeparator` | `listings/NearMatchSeparator.tsx` | Visual separator between exact and near matches |
| `ListScrollBridge` | `listings/ListScrollBridge.tsx` | Bridge for scroll-to-listing from map |

### Listing action components (root)

| Component | File | Purpose |
|---|---|---|
| `FavoriteButton` | `FavoriteButton.tsx` | Save/unsave listing toggle |
| `SaveListingButton` | `SaveListingButton.tsx` | Save listing button with auth check |
| `ShareListingButton` | `ShareListingButton.tsx` | Share listing via Web Share API or clipboard |
| `ReportButton` | `ReportButton.tsx` | Report listing dialog |
| `ContactHostButton` | `ContactHostButton.tsx` | Start conversation with host |
| `DeleteListingButton` | `DeleteListingButton.tsx` | Delete listing with confirmation |
| `ListingStatusToggle` | `ListingStatusToggle.tsx` | Toggle listing active/paused/rented |
| `ImageGallery` | `ImageGallery.tsx` | Full-screen image gallery with lightbox |
| `ImageUpload` | `ImageUpload.tsx` | Image upload component for listing creation |
| `SaveSearchButton` | `SaveSearchButton.tsx` | Save current search with alert settings |

---

## Messaging Components

### MessagesPageClient

**File**: `src/components/MessagesPageClient.tsx`

Top-level client component for the `/messages` page. Manages conversation list, active conversation selection, and responsive layout (sidebar + chat pane on desktop, full-screen navigation on mobile).

### ChatWindow

**File**: `src/components/ChatWindow.tsx`

Real-time messaging interface. Features:

- Polling-based message updates
- Optimistic message sending (shows immediately, confirms after server response)
- Failed message retry
- Character counter (1000 max)
- Offline detection with banner
- Debounce protection against double-sends

### MessageList

**File**: `src/components/MessageList.tsx`

Message thread display with auto-scroll to latest.

### Supporting chat components

| Component | File | Purpose |
|---|---|---|
| `BlockedConversationBanner` | `chat/BlockedConversationBanner.tsx` | Banner when conversation partner is blocked |
| `NearbyPlacesCard` | `chat/NearbyPlacesCard.tsx` | Inline nearby places card in chat |
| `BlockUserButton` | `BlockUserButton.tsx` | Block/unblock user toggle |
| `BlockedUserMessage` | `BlockedUserMessage.tsx` | Message shown for blocked users |

---

## Booking Components

### BookingForm

**File**: `src/components/BookingForm.tsx`

Full booking request form on listing detail pages. Handles date selection, price display with server-side price authority, idempotency key generation, and submission with optimistic UI. Validates against listing availability and enforces slot capacity.

### BookingCalendar

**File**: `src/components/BookingCalendar.tsx`

Calendar view of bookings with color-coded status:

| Status | Color |
|---|---|
| PENDING | Amber |
| ACCEPTED | Green |
| REJECTED | Red |
| CANCELLED | Zinc/gray |

Supports month navigation, booking click handler, and loading state.

### ReviewCard and ReviewForm

| Component | File | Purpose |
|---|---|---|
| `ReviewCard` | `ReviewCard.tsx` | Individual review display with star rating |
| `ReviewForm` | `ReviewForm.tsx` | Submit review with rating and comment |
| `ReviewList` | `ReviewList.tsx` | Paginated list of reviews |
| `ReviewResponseForm` | `ReviewResponseForm.tsx` | Host response to a review |

---

## Auth and Verification Components

| Component | File | Purpose |
|---|---|---|
| `AuthErrorAlert` | `auth/AuthErrorAlert.tsx` | Displays auth error messages from error codes |
| `PasswordConfirmationModal` | `auth/PasswordConfirmationModal.tsx` | Modal for confirming password before sensitive actions |
| `GetVerifiedButton` | `verification/GetVerifiedButton.tsx` | CTA to start verification process |
| `VerifiedBadge` | `verification/VerifiedBadge.tsx` | Verified user checkmark badge |
| `EmailVerificationBanner` | `EmailVerificationBanner.tsx` | Banner prompting email verification |
| `EmailVerificationWrapper` | `EmailVerificationWrapper.tsx` | Wrapper for verification flow |

---

## Nearby Places Components

### NearbyPlacesSection

**File**: `src/components/nearby/NearbyPlacesSection.tsx`

Section on listing detail pages showing nearby points of interest (restaurants, transit, etc.). Uses the Radar API.

| Component | File | Purpose |
|---|---|---|
| `NearbyPlacesMap` | `nearby/NearbyPlacesMap.tsx` | Mini map showing nearby places |
| `NearbyPlacesPanel` | `nearby/NearbyPlacesPanel.tsx` | List panel of nearby places with distances |
| `RadarAttribution` | `nearby/RadarAttribution.tsx` | Required Radar API attribution link |

### Neighborhood Module

| Component | File | Purpose |
|---|---|---|
| `NeighborhoodModule` | `neighborhood/NeighborhoodModule.tsx` | Full neighborhood exploration module |
| `NeighborhoodPlaceList` | `neighborhood/NeighborhoodPlaceList.tsx` | List of neighborhood places |
| `PlaceDetailsPanel` | `neighborhood/PlaceDetailsPanel.tsx` | Detailed view of a single place |
| `ContextBar` | `neighborhood/ContextBar.tsx` | Context/category filter bar |
| `ProUpgradeCTA` | `neighborhood/ProUpgradeCTA.tsx` | Upgrade prompt for premium features |
| `NeighborhoodChat` | `NeighborhoodChat.tsx` | AI chat about the neighborhood |

---

## Layout Components

| Component | File | Purpose |
|---|---|---|
| `MainLayout` | `MainLayout.tsx` | Full-page layout with navbar and footer |
| `Navbar` | `Navbar.tsx` | Top navigation bar (server component) |
| `NavbarClient` | `NavbarClient.tsx` | Client-side navbar with auth state, search bar, notifications dropdown, user menu, and mobile hamburger |
| `NavbarWrapper` | `NavbarWrapper.tsx` | Client wrapper for navbar with scroll behavior |
| `Footer` | `Footer.tsx` | Site footer with links |
| `FooterWrapper` | `FooterWrapper.tsx` | Client wrapper for footer visibility |
| `Providers` | `Providers.tsx` | Root providers: SessionProvider, ThemeProvider, Toaster |
| `ThemeProvider` | `ThemeProvider.tsx` | Dark mode theme provider (next-themes) |
| `ThemeToggle` | `ThemeToggle.tsx` | Dark/light mode toggle button |
| `UserAvatar` | `UserAvatar.tsx` | User avatar with fallback initials |
| `WebVitals` | `WebVitals.tsx` | Core Web Vitals reporting component |
| `ServiceWorkerRegistration` | `ServiceWorkerRegistration.tsx` | PWA service worker registration |

### Search layout components

| Component | File | Purpose |
|---|---|---|
| `CollapsedMobileSearch` | `CollapsedMobileSearch.tsx` | Compact search bar on scroll |
| `SearchHeaderWrapper` | `SearchHeaderWrapper.tsx` | Search page header layout |
| `SearchErrorBanner` | `SearchErrorBanner.tsx` | Banner for search API errors |
| `LowResultsGuidance` | `LowResultsGuidance.tsx` | Suggestions when few results found |
| `FeaturedListings` | `FeaturedListings.tsx` | Featured listings section (homepage, server) |
| `FeaturedListingsClient` | `FeaturedListingsClient.tsx` | Client carousel for featured listings |
| `FeatureCard` | `FeatureCard.tsx` | Feature highlight card (homepage) |

---

## Error and Feedback Components

| Component | File | Purpose |
|---|---|---|
| `ErrorBoundary` | `error/ErrorBoundary.tsx` | React error boundary with Sentry reporting |
| `ErrorFallback` | `error/ErrorBoundary.tsx` | Default error UI with retry and reload buttons |
| `RateLimitCountdown` | `RateLimitCountdown.tsx` | Countdown timer for rate-limited actions |
| `SuspensionBanner` | `SuspensionBanner.tsx` | Banner for suspended accounts |
| `SuspensionBannerWrapper` | `SuspensionBannerWrapper.tsx` | Client wrapper for suspension check |
| `ProfileCompletionBanner` | `ProfileCompletionBanner.tsx` | Banner prompting profile completion |
| `ProfileCompletionIndicator` | `ProfileCompletionIndicator.tsx` | Progress indicator for profile |
| `ProfileCompletionModal` | `ProfileCompletionModal.tsx` | Modal with profile completion steps |
| `ListingFreshnessCheck` | `ListingFreshnessCheck.tsx` | Checks if listing data is stale |

---

## Skeleton Components

Loading state placeholders in `src/components/skeletons/`.

| Component | File | Purpose |
|---|---|---|
| `Skeleton` | `skeletons/Skeleton.tsx` | Base skeleton primitive (animated shimmer) |
| `ListingCardSkeleton` | `skeletons/ListingCardSkeleton.tsx` | Full listing card skeleton |
| `ListingCardSkeleton` | `listings/ListingCardSkeleton.tsx` | Alternate listing card skeleton |

---

## Contexts

React contexts in `src/contexts/`. These coordinate state across search page sibling components.

### FilterStateContext

**File**: `src/contexts/FilterStateContext.tsx`

Shares pending filter state across components. Enables showing a "Pending changes" banner above results when filters are dirty.

| Value | Type | Purpose |
|---|---|---|
| `isDirty` | `boolean` | Whether there are unapplied filter changes |
| `changeCount` | `number` | Number of pending changes |
| `isDrawerOpen` | `boolean` | Whether filter drawer is open |
| `openDrawer` | `() => void` | Open the filter drawer |

### MapBoundsContext

**File**: `src/contexts/MapBoundsContext.tsx`

Shared state for map bounds dirty tracking. The map component is the source of truth.

Uses a **selector pattern** for optimal re-renders:

| Hook | Purpose | Re-renders when |
|---|---|---|
| `useMapBoundsState()` | Read state | State changes |
| `useMapBoundsActions()` | Call actions | Never (stable refs) |
| `useMapMovedBanner()` | Banner display logic | Banner state changes |
| `useAreaCount()` | Area listing count | Count changes |
| `useSearchAsMove()` | Toggle state | Toggle changes |

### ListingFocusContext

**File**: `src/contexts/ListingFocusContext.tsx`

Two-way list-map hover/selection synchronization.

| State | Purpose |
|---|---|
| `hoveredId` | Listing being hovered (card or marker) |
| `activeId` | Listing actively selected (persistent) |
| `scrollRequest` | One-shot scroll command with nonce deduplication |
| `focusSource` | Where hover originated (`"map"` or `"list"`) to prevent loops |

Hooks: `useListingFocus()`, `useIsListingFocused(id)`, `useSetListingHover()`.

### SearchV2DataContext

**File**: `src/contexts/SearchV2DataContext.tsx`

V2 search map data sharing. Implements fine-grained selector hooks:

| Hook | Purpose |
|---|---|
| `useV2MapData()` | GeoJSON map data |
| `useV2MapDataSetter()` | Stable setter function |
| `useIsV2Enabled()` | Whether V2 search is active |
| `useDataVersion()` | Data version counter |

### SearchTransitionContext

**File**: `src/contexts/SearchTransitionContext.tsx`

Coordinates React transitions across search components. Keeps current results visible while new data loads.

| Value | Purpose |
|---|---|
| `isPending` | Whether a transition is in progress |
| `isSlowTransition` | Whether transition exceeded slow threshold (6s) |
| `navigateWithTransition(url)` | Navigate within a transition |
| `replaceWithTransition(url)` | Replace URL within a transition (for map) |

### MobileSearchContext

**File**: `src/contexts/MobileSearchContext.tsx`

Coordinates mobile search bar expand/collapse state and filter drawer opening.

### SearchMapUIContext

**File**: `src/contexts/SearchMapUIContext.tsx`

Card-to-map focus coordination. When "View on map" is clicked on a ListingCard, stores a pending focus request for the map to consume (flyTo + open popup).

---

## Hooks

Custom React hooks in `src/hooks/`.

### Network and abort

| Hook | File | Purpose |
|---|---|---|
| `useNetworkStatus` | `hooks/useNetworkStatus.ts` | Online/offline detection |
| `useAbortableServerAction` | `hooks/useAbortableServerAction.ts` | Server action with AbortController (cancels stale requests) |

### Search and filters

| Hook | File | Purpose |
|---|---|---|
| `useDebouncedFilterCount` | `hooks/useDebouncedFilterCount.ts` | Debounced filter count preview (600ms) |
| `useFilterImpactCount` | `hooks/useFilterImpactCount.ts` | Filter impact count with caching |
| `useBatchedFilters` | `hooks/useBatchedFilters.ts` | Batched filter state updates |
| `useFacets` | `hooks/useFacets.ts` | Search facets data (price histogram, counts) |
| `useRecentSearches` | `hooks/useRecentSearches.ts` | Recent search history (localStorage) |

### UI and interaction

| Hook | File | Purpose |
|---|---|---|
| `useKeyboardShortcuts` | `hooks/useKeyboardShortcuts.ts` | Global keyboard shortcut handler |
| `useScrollHeader` | `hooks/useScrollHeader.ts` | Header hide/show on scroll |
| `useMediaQuery` | `hooks/useMediaQuery.ts` | Responsive breakpoint detection |
| `useFormPersistence` | `hooks/useFormPersistence.ts` | Form draft persistence (localStorage) |
| `useMapPreference` | `hooks/useMapPreference.ts` | Map view preference (list vs map) |

### Safety and rate limiting

| Hook | File | Purpose |
|---|---|---|
| `useBlockStatus` | `hooks/useBlockStatus.ts` | Check if current user has blocked/is blocked by another user |
| `useRateLimitHandler` | `hooks/useRateLimitHandler.ts` | Handle 429 responses with countdown |
| `useNearbySearchRateLimit` | `hooks/useNearbySearchRateLimit.ts` | Client-side rate limit for nearby search |

---

## Adding New Components

### Checklist

1. Determine if the component needs `"use client"` (needs state, effects, browser APIs, event handlers).
2. Place in the appropriate subdirectory under `src/components/`.
3. Use existing UI primitives (`Button`, `Input`, `Dialog`, etc.) instead of creating new ones.
4. Support dark mode via Tailwind's `dark:` modifier.
5. Meet 44px minimum touch targets for interactive elements.
6. Handle loading, error, and empty states.
7. Add tests in `src/__tests__/components/`.

### Pattern: client component with context

```tsx
"use client";

import { useListingFocus } from "@/contexts/ListingFocusContext";
import { Button } from "@/components/ui/button";

export function MyComponent({ listingId }: { listingId: string }) {
  const { setActive } = useListingFocus();

  return (
    <Button onClick={() => setActive(listingId)}>
      Focus on map
    </Button>
  );
}
```

### Pattern: component with skeleton

```tsx
import { Suspense } from "react";
import { ListingCardSkeleton } from "@/components/skeletons/ListingCardSkeleton";

export default function Page() {
  return (
    <Suspense fallback={<ListingCardSkeleton count={6} />}>
      <ListingResults />
    </Suspense>
  );
}
```
