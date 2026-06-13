"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseScrollHeaderOptions {
  /** Scroll threshold in pixels before collapsing (default: 100) */
  threshold?: number;
}

interface ScrollHeaderState {
  /** Whether the header should be collapsed */
  isCollapsed: boolean;
  /** Current scroll position */
  scrollY: number;
  /** Whether user is scrolling up */
  isScrollingUp: boolean;
}

/**
 * Hook to track scroll state for collapsible header behavior.
 *
 * Features:
 * - Collapses header when scrolled past threshold
 * - Expands when scrolling up (like iOS Safari)
 * - Debounced for performance
 * - Uses RAF for smooth updates
 *
 * Watches BOTH window scroll and the search results panel
 * ([data-search-results-scroll-region]) — the desktop /search layout is
 * h-screen with an internal scroll container, so window.scrollY alone never
 * moves there and the header would never collapse.
 */
const SCROLL_REGION_SELECTOR = "[data-search-results-scroll-region]";

function readScrollTop(): number {
  const region = document.querySelector<HTMLElement>(SCROLL_REGION_SELECTOR);
  return Math.max(window.scrollY, region?.scrollTop ?? 0);
}
export function useScrollHeader({
  threshold = 100,
}: UseScrollHeaderOptions = {}): ScrollHeaderState {
  const [state, setState] = useState<ScrollHeaderState>({
    isCollapsed: false,
    scrollY: 0,
    isScrollingUp: false,
  });

  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const rafId = useRef<number | null>(null);

  const updateScrollState = useCallback(() => {
    const currentScrollY = readScrollTop();
    const isScrollingUp = currentScrollY < lastScrollY.current;

    // Determine if header should be collapsed
    // Collapse when: scrolled past threshold AND scrolling down
    // Expand when: near top OR scrolling up significantly
    const isCollapsed =
      currentScrollY > threshold &&
      !isScrollingUp &&
      currentScrollY - lastScrollY.current > 5; // Require some momentum

    // Always expand when near top or scrolling up significantly
    const shouldExpand =
      currentScrollY <= threshold ||
      (isScrollingUp && lastScrollY.current - currentScrollY > 20);

    // L-2 FIX: Only call setState when values actually changed.
    // Previously created a new object on every scroll tick, causing re-renders
    // even when isCollapsed and isScrollingUp hadn't changed.
    setState((prev) => {
      const newCollapsed = shouldExpand
        ? false
        : isCollapsed || prev.isCollapsed;
      if (
        prev.isCollapsed === newCollapsed &&
        prev.isScrollingUp === isScrollingUp &&
        prev.scrollY === currentScrollY
      ) {
        return prev; // Bail out — no re-render
      }
      return {
        isCollapsed: newCollapsed,
        scrollY: currentScrollY,
        isScrollingUp,
      };
    });

    lastScrollY.current = currentScrollY;
    ticking.current = false;
  }, [threshold]);

  const handleScroll = useCallback(() => {
    if (!ticking.current) {
      rafId.current = requestAnimationFrame(updateScrollState);
      ticking.current = true;
    }
  }, [updateScrollState]);

  useEffect(() => {
    // Initialize with current scroll position
    const initialScrollY = readScrollTop();
    lastScrollY.current = initialScrollY;
    setState({
      isCollapsed: initialScrollY > threshold,
      scrollY: initialScrollY,
      isScrollingUp: false,
    });

    // Scroll events don't bubble, but they DO propagate in the capture
    // phase — one document-level listener covers the window and the results
    // panel. Other scrollables (dropdowns, drawers) are ignored.
    const handleDocumentScroll = (event: Event) => {
      const target = event.target;
      const isTracked =
        target === document ||
        (target instanceof HTMLElement &&
          target.matches(SCROLL_REGION_SELECTOR));
      if (isTracked) {
        handleScroll();
      }
    };

    document.addEventListener("scroll", handleDocumentScroll, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("scroll", handleDocumentScroll, {
        capture: true,
      });
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [handleScroll, threshold]);

  return state;
}

/**
 * Simplified hook that just returns whether header is collapsed.
 * Use when you don't need scroll direction info.
 */
export function useHeaderCollapsed(threshold = 100): boolean {
  const { isCollapsed } = useScrollHeader({ threshold });
  return isCollapsed;
}
