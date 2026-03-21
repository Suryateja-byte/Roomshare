# Deliberate Plan: Fix All HIGH Issues

**Task Type**: FIX | **Date**: 2026-03-17 | **Confidence**: 4.8/5.0 (HIGH)

---

## Issues & Fixes (9 total)

### H1: Navigation Dead Zone at 768-1023px
**File**: `NavbarClient.tsx:396` | **Change**: `md:hidden` → `lg:hidden`

### H2: Link+Button Invalid HTML (8 locations)
**Files**: `HomeClient.tsx`, `FeaturedListingsClient.tsx`, `NavbarClient.tsx`
**Change**: Invert to `<Button asChild><Link>...</Link></Button>` pattern

### H3: Suspense Skeleton CLS (6 mismatches)
**File**: `page.tsx:9-30` | **Change**: Rewrite skeleton to match actual component

### H5: No Escape Key Handler
**File**: `NavbarClient.tsx` | **Change**: Add useEffect with keydown Escape listener

### H6: Missing Focus Indicator on Hamburger
**File**: `NavbarClient.tsx:383` | **Change**: Add focus-visible ring classes

### H7: No Fallback When Frames Fail
**File**: `ScrollAnimation.tsx` | **Change**: Track succeeded count, show fallback on total failure

### H9: Mobile Menu Scroll Lock No-Op
**File**: `NavbarClient.tsx:224-231` | **Change**: Target `.custom-scroll-hide` instead of body

### H10: TrustBadge Dead Import
**File**: `ListingCard.tsx:224` | **Change**: Wire up `<TrustBadge>` in badge stack

### H12: Text Overlays Stack Off-Center
**File**: `ScrollAnimation.tsx:314-334` | **Change**: CSS grid stacking with `[grid-area:1/1]`

---

## Implementation Sequence

1. NavbarClient fixes (H1, H5, H6, H9) — all in one file
2. Link+Button fixes (H2) — 3 files, 8 locations
3. Skeleton fix (H3) — page.tsx
4. ScrollAnimation fixes (H7, H12)
5. TrustBadge fix (H10) — ListingCard.tsx
6. Verify: typecheck + lint + test
