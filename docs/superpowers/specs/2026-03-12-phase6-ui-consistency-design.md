# Phase 6: UI Consistency — SlotBadge Design Spec

**Status**: Approved
**Date**: 2026-03-12
**Scope**: 3 production files + 1 test file

## Problem

Availability badges are inconsistent across the app:

- **ListingCard**: Inline `<span>` with `rounded-md`, `uppercase`, `tracking-[0.15em]`, custom colors. Binary "Available"/"Filled" with no slot count or multi-room indicator.
- **ListingPageClient**: `InfoStat` with Users icon showing "X / Y Slots Available". Different visual treatment from card badges.
- **Badge component**: Already has 7 variants (success, info, destructive, warning, purple, default, outline) with `rounded-full`, dark mode, and 3 sizes — but is NOT used for availability display.

## Solution: SlotBadge Component (Approach A)

Create a standalone `SlotBadge` component that wraps the existing `Badge` component. Encapsulates all status-to-variant logic in one place. Both ListingCard and ListingPageClient import the same component.

### Scope Decisions

- **bookingMode**: Detail page only. NOT added to search pipeline (no ListingData/SQL changes).
- **Multi-Room badge**: Shown on ListingCards in search results. `totalSlots` already flows through the search pipeline.
- **Badge component**: No changes needed — all required variants already exist.
- **transform.ts / search-types.ts**: No changes needed — `availableSlots` and `totalSlots` already present.
- **SearchResultsClient.tsx**: No changes needed — data flows through automatically.

## Component Design

### SlotBadge (`src/components/listings/SlotBadge.tsx`)

```typescript
interface SlotBadgeProps {
  availableSlots: number
  totalSlots: number
  size?: 'sm' | 'default'       // maps to Badge's sm/default sizes
  overlay?: boolean              // transparent bg + blur for image overlays
  className?: string
}
```

#### Display Logic

| Condition | Label | Badge Variant |
|-----------|-------|---------------|
| `totalSlots <= 1 && availableSlots > 0` | "Available" | `success` (green) |
| `totalSlots <= 1 && availableSlots === 0` | "Filled" | `destructive` (red) |
| `totalSlots > 1 && availableSlots === totalSlots` | "All {N} open" | `success` (green) |
| `totalSlots > 1 && availableSlots > 0` | "{X} of {Y} open" | `info` (blue) |
| `totalSlots > 1 && availableSlots === 0` | "Filled" | `destructive` (red) |

#### Edge Case Guards

- `availableSlots` clamped to `[0, totalSlots]` — handles stale data or reconciliation drift
- `totalSlots < 1` falls back to single-slot "Available" behavior

#### Overlay Mode

When `overlay={true}`, applies transparent backgrounds + blur instead of Badge's default opaque colors:

```typescript
const overlayStyles = {
  success: 'bg-green-100/90 dark:bg-green-900/80 backdrop-blur-sm shadow-sm',
  info: 'bg-blue-100/90 dark:bg-blue-900/80 backdrop-blur-sm shadow-sm',
  destructive: 'bg-red-100/90 dark:bg-red-900/80 backdrop-blur-sm shadow-sm',
}
```

This matches the glassmorphism aesthetic used by the existing rating badge on ListingCards.

#### Size Mapping

Uses Badge's existing `sm` and `default` sizes directly. No custom font sizes introduced.

## File Changes

### 1. CREATE: `src/components/listings/SlotBadge.tsx`

~40 lines. Pure presentational component wrapping Badge.

### 2. MODIFY: `src/components/listings/ListingCard.tsx`

**Interface change**: Add `totalSlots: number` to `Listing` interface (line ~18). Already present in `ListingData`/`SearchV2ListItem`, just missing from the card interface.

**Replace inline badge** (lines 212-220):

```tsx
<div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
  <SlotBadge
    availableSlots={listing.availableSlots}
    totalSlots={listing.totalSlots}
    size="sm"
    overlay
  />
  {listing.totalSlots > 1 && (
    <Badge variant="purple" size="sm"
      className="backdrop-blur-sm shadow-sm bg-indigo-100/90 dark:bg-indigo-900/80">
      Multi-Room
    </Badge>
  )}
  {hasRating && (
    /* Rating badge stays as-is — glass aesthetic matches SlotBadge overlay */
  )}
</div>
```

**Screen reader label update** (line 132): Include totalSlots context for multi-room listings:

```typescript
if (listing.totalSlots > 1) {
  srParts.push(isAvailable
    ? `${listing.availableSlots} of ${listing.totalSlots} spots available`
    : 'currently filled');
} else {
  srParts.push(isAvailable ? 'spot available' : 'currently filled');
}
```

**Imports**: Add `SlotBadge`, `Badge`.

### 3. MODIFY: `src/app/listings/[id]/ListingPageClient.tsx`

**Replace slot InfoStat + Entire Unit InfoStat** (lines 306-313):

```tsx
<SlotBadge
  availableSlots={listing.availableSlots}
  totalSlots={listing.totalSlots}
/>
{listing.bookingMode === 'WHOLE_UNIT' && (
  <Badge variant="purple">Whole Unit</Badge>
)}
```

No `overlay` prop — detail page badges sit on white/dark backgrounds, not over images.

Only the slot-related InfoStats are converted. Location, Furnished, StatusBadge all stay unchanged.

**Imports**: Add `SlotBadge`, `Badge`.

### 4. CREATE: `src/__tests__/components/SlotBadge.test.tsx`

Unit tests covering:

- All 5 display states (single available, single filled, multi all-open, multi partial, multi filled)
- Edge cases: `availableSlots > totalSlots` clamped, `totalSlots = 0` fallback
- `overlay` prop applies transparent bg classes
- Size prop maps to Badge sizes correctly

No integration or E2E tests needed — pure UI rendering with no server interaction.

## Files NOT Changed

| File | Reason |
|------|--------|
| `src/components/ui/badge.tsx` | All variants already exist |
| `src/lib/search/transform.ts` | `availableSlots` and `totalSlots` already mapped |
| `src/lib/search-types.ts` | `ListingData` already has both fields |
| `src/components/search/SearchResultsClient.tsx` | Data flows through automatically |
| `prisma/schema.prisma` | No DB changes |

## Design Review Findings (Applied)

| # | Issue | Resolution |
|---|-------|------------|
| 1 | Opaque Badge backgrounds don't work on image overlays | Added `overlay` prop with transparent bg + blur |
| 2 | Rating badge would become inconsistent | SlotBadge overlay matches glass aesthetic; rating badge unchanged |
| 3 | Custom `text-[11px]` creates non-standard size | Use Badge's existing `sm` size |
| 4 | Detail page InfoStat to Badge visual weight shift | Convert both slot + booking mode InfoStats to badges (desired emphasis) |
| 5 | SR label missing totalSlots context | Updated ariaLabel to include "X of Y" for multi-room |

## Risk Assessment

- **No DB changes**: Zero migration risk
- **No search pipeline changes**: Zero data flow risk
- **No auth/state changes**: Pure UI rendering
- **Backward compatible**: `totalSlots` already in search data, just not displayed on cards
- **Dark mode**: Badge component handles dark mode via variant classes
