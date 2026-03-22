/**
 * Mobile Layout Constants
 *
 * Shared snap point values for MobileBottomSheet and FloatingMapButton.
 * These must stay in sync — changing a snap point here updates both components.
 *
 * @see MobileBottomSheet.tsx — consumes these for sheet positioning
 * @see FloatingMapButton.tsx — consumes SNAP_COLLAPSED for button positioning
 */

/** Bottom sheet collapsed snap point as fraction of viewport height (~15vh) */
export const SNAP_COLLAPSED = 0.15;

/** Bottom sheet half-expanded snap point as fraction of viewport height (~50vh) */
export const SNAP_HALF = 0.5;

/** Bottom sheet fully expanded snap point as fraction of viewport height (~85vh) */
export const SNAP_EXPANDED = 0.85;
