"use client";

/**
 * useKeyboardShortcuts - Hook for managing global keyboard shortcuts
 *
 * Features:
 * - Configurable shortcuts with meta key (⌘/Ctrl) support
 * - Context-aware activation (can be disabled when not applicable)
 * - Prevents default browser behavior when shortcuts match
 * - Accessibility-friendly (respects input focus)
 *
 * Implemented shortcuts:
 * - ⌘/Ctrl + K: Focus search input
 * - Escape: Close drawer/modal
 * - ⌘/Ctrl + Enter: Apply filters (in filter drawer)
 *
 * Note: We avoid ⌘/Ctrl + F as it conflicts with browser Find
 */

import { useEffect, useCallback, useRef } from "react";

/**
 * Configuration for a single keyboard shortcut
 */
export interface ShortcutConfig {
  /** The key to listen for (e.g., 'k', 'Escape', 'Enter') */
  key: string;
  /** Whether meta key (⌘/Ctrl) should be held */
  meta?: boolean;
  /** Whether shift key should be held */
  shift?: boolean;
  /** Action to execute when shortcut is triggered */
  action: () => void;
  /** Whether the shortcut is currently disabled */
  disabled?: boolean;
  /** Description for accessibility/help display */
  description?: string;
  /** Prevent shortcut when user is typing in an input */
  preventInInput?: boolean;
}

/**
 * Options for the useKeyboardShortcuts hook
 */
export interface UseKeyboardShortcutsOptions {
  /** Whether all shortcuts are globally disabled */
  disabled?: boolean;
}

/**
 * Check if the active element is an input-like element
 */
function isInputElement(element: Element | null): boolean {
  if (!element) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  // Check for contenteditable
  if (element.getAttribute("contenteditable") === "true") {
    return true;
  }

  return false;
}

/**
 * Hook for managing keyboard shortcuts
 *
 * @param shortcuts - Array of shortcut configurations
 * @param options - Hook options
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   { key: 'k', meta: true, action: () => searchInputRef.current?.focus() },
 *   { key: 'Escape', action: () => setDrawerOpen(false), disabled: !drawerOpen },
 * ]);
 * ```
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  options: UseKeyboardShortcutsOptions = {},
) {
  const { disabled: globallyDisabled = false } = options;

  // Use ref to avoid recreating handler on every shortcut change
  const shortcutsRef = useRef(shortcuts);

  // Update ref value in effect to avoid accessing ref during render
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (globallyDisabled) return;

      const isMeta = event.metaKey || event.ctrlKey;
      const isShift = event.shiftKey;
      const activeElement = document.activeElement;

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.disabled) continue;

        // Check if shortcut should be prevented in input elements
        if (shortcut.preventInInput && isInputElement(activeElement)) {
          continue;
        }

        // Match key (case-insensitive for letter keys)
        const keyMatches =
          event.key.toLowerCase() === shortcut.key.toLowerCase() ||
          event.key === shortcut.key;

        if (!keyMatches) continue;

        // Match meta key requirement
        const metaMatches = Boolean(shortcut.meta) === isMeta;
        if (!metaMatches) continue;

        // Match shift key requirement (if specified)
        const shiftMatches =
          shortcut.shift === undefined || Boolean(shortcut.shift) === isShift;
        if (!shiftMatches) continue;

        // All conditions match - execute action
        event.preventDefault();
        event.stopPropagation();
        shortcut.action();
        break; // Only execute first matching shortcut
      }
    },
    [globallyDisabled],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Format a shortcut for display (e.g., "⌘K" or "Ctrl+K")
 */
export function formatShortcut(
  config: Pick<ShortcutConfig, "key" | "meta" | "shift">,
): string {
  const parts: string[] = [];

  // Detect platform for proper symbol
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  if (config.meta) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (config.shift) {
    parts.push(isMac ? "⇧" : "Shift");
  }

  // Format key display
  let keyDisplay = config.key;
  if (config.key === "Escape") keyDisplay = "Esc";
  if (config.key === "Enter") keyDisplay = "↵";
  if (config.key.length === 1) keyDisplay = config.key.toUpperCase();

  parts.push(keyDisplay);

  // Join with + for Windows/Linux, nothing for Mac
  return isMac ? parts.join("") : parts.join("+");
}

/**
 * Common shortcut presets for search functionality
 */
export const SEARCH_SHORTCUTS = {
  FOCUS_SEARCH: {
    key: "k",
    meta: true,
    description: "Focus search input",
  },
  CLOSE: {
    key: "Escape",
    meta: false,
    description: "Close drawer or modal",
  },
  APPLY_FILTERS: {
    key: "Enter",
    meta: true,
    description: "Apply filters",
  },
} as const;
