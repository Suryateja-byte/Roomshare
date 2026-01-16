/**
 * Unit tests for useKeyboardShortcuts hook
 *
 * Tests keyboard shortcut handling including:
 * - Shortcut matching with meta/shift keys
 * - Context-aware activation (disabled state)
 * - Input element prevention
 * - formatShortcut utility
 */

import { renderHook, act } from "@testing-library/react";
import {
  useKeyboardShortcuts,
  formatShortcut,
  SEARCH_SHORTCUTS,
  type ShortcutConfig,
} from "@/hooks/useKeyboardShortcuts";

// Helper to dispatch keyboard events
function dispatchKeyDown(
  key: string,
  options: Partial<KeyboardEventInit> = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  window.dispatchEvent(event);
  return event;
}

// Helper to create mock action
function createMockAction() {
  return jest.fn();
}

describe("useKeyboardShortcuts", () => {
  describe("basic shortcut matching", () => {
    it("should trigger action when key matches", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [{ key: "k", action }];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("k");
      });

      expect(action).toHaveBeenCalledTimes(1);
    });

    it("should match key case-insensitively", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [{ key: "k", action }];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("K");
      });

      expect(action).toHaveBeenCalledTimes(1);
    });

    it("should not trigger action when key does not match", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [{ key: "k", action }];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("j");
      });

      expect(action).not.toHaveBeenCalled();
    });
  });

  describe("meta key handling", () => {
    it("should require meta key when specified", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [{ key: "k", meta: true, action }];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Without meta key - should not trigger
      act(() => {
        dispatchKeyDown("k");
      });
      expect(action).not.toHaveBeenCalled();

      // With meta key - should trigger
      act(() => {
        dispatchKeyDown("k", { metaKey: true });
      });
      expect(action).toHaveBeenCalledTimes(1);
    });

    it("should treat Ctrl as meta key alternative", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [{ key: "k", meta: true, action }];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("k", { ctrlKey: true });
      });

      expect(action).toHaveBeenCalledTimes(1);
    });

    it("should not trigger when meta is not specified but pressed", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [{ key: "k", meta: false, action }];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("k", { metaKey: true });
      });

      expect(action).not.toHaveBeenCalled();
    });
  });

  describe("shift key handling", () => {
    it("should require shift key when specified", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [{ key: "f", shift: true, action }];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Without shift - should not trigger
      act(() => {
        dispatchKeyDown("f");
      });
      expect(action).not.toHaveBeenCalled();

      // With shift - should trigger
      act(() => {
        dispatchKeyDown("f", { shiftKey: true });
      });
      expect(action).toHaveBeenCalledTimes(1);
    });

    it("should allow either shift state when shift is undefined", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [
        { key: "f", action }, // shift not specified
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("f");
      });
      expect(action).toHaveBeenCalledTimes(1);

      act(() => {
        dispatchKeyDown("f", { shiftKey: true });
      });
      expect(action).toHaveBeenCalledTimes(2);
    });
  });

  describe("disabled state", () => {
    it("should not trigger disabled shortcuts", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [
        { key: "k", action, disabled: true },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("k");
      });

      expect(action).not.toHaveBeenCalled();
    });

    it("should respect global disabled option", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [{ key: "k", action }];

      renderHook(() => useKeyboardShortcuts(shortcuts, { disabled: true }));

      act(() => {
        dispatchKeyDown("k");
      });

      expect(action).not.toHaveBeenCalled();
    });

    it("should update disabled state dynamically", () => {
      const action = createMockAction();
      let isDisabled = false;

      const { rerender } = renderHook(() =>
        useKeyboardShortcuts([{ key: "k", action, disabled: isDisabled }]),
      );

      // Should trigger when not disabled
      act(() => {
        dispatchKeyDown("k");
      });
      expect(action).toHaveBeenCalledTimes(1);

      // Update to disabled
      isDisabled = true;
      rerender();

      // Should not trigger when disabled
      act(() => {
        dispatchKeyDown("k");
      });
      expect(action).toHaveBeenCalledTimes(1); // Still 1, not increased
    });
  });

  describe("input element prevention", () => {
    it("should skip shortcuts with preventInInput when in input element", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [
        { key: "k", action, preventInInput: true },
      ];

      // Create and focus an input
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("k");
      });

      expect(action).not.toHaveBeenCalled();

      // Cleanup
      document.body.removeChild(input);
    });

    it("should still trigger shortcuts without preventInInput in input", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [
        { key: "Escape", action }, // No preventInInput
      ];

      // Create and focus an input
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("Escape");
      });

      expect(action).toHaveBeenCalledTimes(1);

      // Cleanup
      document.body.removeChild(input);
    });
  });

  describe("special keys", () => {
    it("should handle Escape key", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [{ key: "Escape", action }];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("Escape");
      });

      expect(action).toHaveBeenCalledTimes(1);
    });

    it("should handle Enter key", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [
        { key: "Enter", meta: true, action },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("Enter", { metaKey: true });
      });

      expect(action).toHaveBeenCalledTimes(1);
    });
  });

  describe("event handling", () => {
    it("should only trigger first matching shortcut", () => {
      const action1 = createMockAction();
      const action2 = createMockAction();
      const shortcuts: ShortcutConfig[] = [
        { key: "k", action: action1 },
        { key: "k", action: action2 },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      act(() => {
        dispatchKeyDown("k");
      });

      expect(action1).toHaveBeenCalledTimes(1);
      expect(action2).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should remove event listener on unmount", () => {
      const action = createMockAction();
      const shortcuts: ShortcutConfig[] = [{ key: "k", action }];

      const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));

      unmount();

      act(() => {
        dispatchKeyDown("k");
      });

      expect(action).not.toHaveBeenCalled();
    });
  });
});

describe("formatShortcut", () => {
  // Mock navigator.platform for consistent testing
  const originalNavigator = { ...navigator };

  beforeEach(() => {
    // Default to Mac for consistent test results
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "platform", {
      value: originalNavigator.platform,
      configurable: true,
    });
  });

  it("should format simple key on Mac", () => {
    expect(formatShortcut({ key: "k" })).toBe("K");
  });

  it("should format meta key shortcut on Mac", () => {
    expect(formatShortcut({ key: "k", meta: true })).toBe("⌘K");
  });

  it("should format shift+meta shortcut on Mac", () => {
    expect(formatShortcut({ key: "f", meta: true, shift: true })).toBe("⌘⇧F");
  });

  it("should format Escape key", () => {
    expect(formatShortcut({ key: "Escape" })).toBe("Esc");
  });

  it("should format Enter key", () => {
    expect(formatShortcut({ key: "Enter", meta: true })).toBe("⌘↵");
  });

  it("should format on Windows/Linux", () => {
    Object.defineProperty(navigator, "platform", {
      value: "Win32",
      configurable: true,
    });

    expect(formatShortcut({ key: "k", meta: true })).toBe("Ctrl+K");
    expect(formatShortcut({ key: "f", meta: true, shift: true })).toBe(
      "Ctrl+Shift+F",
    );
  });
});

describe("SEARCH_SHORTCUTS presets", () => {
  it("should have FOCUS_SEARCH preset", () => {
    expect(SEARCH_SHORTCUTS.FOCUS_SEARCH).toEqual({
      key: "k",
      meta: true,
      description: "Focus search input",
    });
  });

  it("should have CLOSE preset", () => {
    expect(SEARCH_SHORTCUTS.CLOSE).toEqual({
      key: "Escape",
      meta: false,
      description: "Close drawer or modal",
    });
  });

  it("should have APPLY_FILTERS preset", () => {
    expect(SEARCH_SHORTCUTS.APPLY_FILTERS).toEqual({
      key: "Enter",
      meta: true,
      description: "Apply filters",
    });
  });
});
