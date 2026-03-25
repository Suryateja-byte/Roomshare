/**
 * Haptic feedback utilities for mobile interactions.
 *
 * Uses navigator.vibrate() when available, with no-op fallback.
 * Haptic vibrations fire regardless of prefers-reduced-motion
 * (different sensory channel from visual motion).
 *
 * Visual CSS classes are decoupled and gated behind
 * motion-safe: prefix to respect prefers-reduced-motion.
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
 * Visual effects are gated behind motion-safe: to respect
 * prefers-reduced-motion preferences.
 *
 * Usage: <button className={`${HAPTIC_CLASSES.tap} other-classes`}>
 */
export const HAPTIC_CLASSES = {
  /** Quick scale-down on press — good for buttons, cards */
  tap: "motion-safe:active:scale-[0.97] transition-transform duration-75",
  /** Subtle background flash on press — good for list items */
  flash:
    "motion-safe:active:bg-surface-container-high/50 transition-colors duration-75",
  /** Combined tap + flash for primary interactive elements */
  interactive:
    "motion-safe:active:scale-[0.97] motion-safe:active:bg-surface-container-high/50 transition-all duration-75",
} as const;
