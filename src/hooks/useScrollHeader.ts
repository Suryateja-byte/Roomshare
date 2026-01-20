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
 */
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
    const currentScrollY = window.scrollY;
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

    setState((prev) => ({
      isCollapsed: shouldExpand ? false : isCollapsed || prev.isCollapsed,
      scrollY: currentScrollY,
      isScrollingUp,
    }));

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
    lastScrollY.current = window.scrollY;
    setState({
      isCollapsed: window.scrollY > threshold,
      scrollY: window.scrollY,
      isScrollingUp: false,
    });

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
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
