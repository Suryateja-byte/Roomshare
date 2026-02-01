/**
 * Haptic feedback utilities for mobile interactions.
 *
 * Uses navigator.vibrate() when available, with no-op fallback.
 * Combine with CSS micro-animations for visual feedback.
 */

/**
 * Trigger a short haptic vibration (10ms).
 * No-op on devices/browsers that don't support vibration.
 */
export function triggerHaptic(durationMs = 10): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(durationMs);
    } catch {
      // Silently fail — some browsers throw on vibrate
    }
  }
}

/**
 * Trigger a light haptic pattern (tap feedback).
 */
export function triggerLightHaptic(): void {
  triggerHaptic(5);
}

/**
 * Trigger a medium haptic pattern (action confirmation).
 */
export function triggerMediumHaptic(): void {
  triggerHaptic(15);
}

/**
 * CSS class names for haptic-style visual feedback.
 * Apply these to interactive elements for micro-animation feedback.
 *
 * Usage: <button className={`${HAPTIC_CLASSES.tap} other-classes`}>
 */
export const HAPTIC_CLASSES = {
  /** Quick scale-down on press — good for buttons, cards */
  tap: "active:scale-[0.97] transition-transform duration-75",
  /** Subtle background flash on press — good for list items */
  flash: "active:bg-zinc-100/50 dark:active:bg-zinc-800/50 transition-colors duration-75",
  /** Combined tap + flash for primary interactive elements */
  interactive: "active:scale-[0.97] active:bg-zinc-100/50 dark:active:bg-zinc-800/50 transition-all duration-75",
} as const;
