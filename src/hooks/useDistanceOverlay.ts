'use client';

import { useState, useEffect, useRef, useCallback, RefObject } from 'react';

export interface DistancePosition {
  index: number;
  top: number;      // Offset from container top
  height: number;   // Height of the place item
  distance: string; // Formatted distance
}

interface UseDistanceOverlayOptions {
  /** Ref to the gmp-place-search element */
  searchRef: RefObject<HTMLElement | null>;
  /** Ref to the container wrapping the search element */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Array of formatted distance strings */
  distances: string[];
  /** Whether the component is ready (status === 'ready') */
  isReady: boolean;
}

interface UseDistanceOverlayReturn {
  positions: DistancePosition[];
  isAligned: boolean;
}

/**
 * Debounce utility
 */
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

/**
 * Try to find place items by looking for elements that appear to be place cards.
 * Google Places UI Kit renders items with specific characteristics we can detect.
 */
function findPlaceItems(searchElement: HTMLElement, expectedCount: number): HTMLElement[] {
  const searchRect = searchElement.getBoundingClientRect();
  if (searchRect.height < 100) return [];

  // Strategy: Find elements that look like place cards based on their structure
  // Place cards typically have: name, address, rating - making them 120-350px tall
  const allElements = searchElement.querySelectorAll<HTMLElement>('*');
  const candidates: { el: HTMLElement; rect: DOMRect; depth: number }[] = [];

  for (const el of allElements) {
    const rect = el.getBoundingClientRect();

    // Skip elements outside search bounds
    if (rect.top < searchRect.top - 10 || rect.bottom > searchRect.bottom + 10) continue;

    // Place cards are typically 100-400px tall (varies with content)
    if (rect.height < 80 || rect.height > 450) continue;

    // Must span significant width
    if (rect.width < searchRect.width * 0.6) continue;

    // Skip invisible elements
    if (rect.width === 0 || rect.height === 0) continue;

    // Calculate DOM depth (prefer shallower elements = actual containers)
    let depth = 0;
    let parent = el.parentElement;
    while (parent && parent !== searchElement) {
      depth++;
      parent = parent.parentElement;
    }

    candidates.push({ el, rect, depth });
  }

  if (candidates.length === 0) return [];

  // Group by vertical position (within 20px tolerance)
  const verticalGroups = new Map<number, typeof candidates>();
  for (const c of candidates) {
    // Use the vertical center for grouping
    const centerY = Math.round((c.rect.top + c.rect.height / 2) / 25) * 25;
    if (!verticalGroups.has(centerY)) {
      verticalGroups.set(centerY, []);
    }
    verticalGroups.get(centerY)!.push(c);
  }

  // Sort groups by position and select the best element from each group
  const sortedGroups = Array.from(verticalGroups.entries())
    .sort(([a], [b]) => a - b);

  const items: HTMLElement[] = [];
  let lastBottom = searchRect.top;

  for (const [, group] of sortedGroups) {
    // Filter to elements that don't overlap significantly with previous selection
    const validCandidates = group.filter(c => c.rect.top >= lastBottom - 20);
    if (validCandidates.length === 0) continue;

    // Prefer: larger height, shallower depth
    const best = validCandidates.reduce((prev, curr) => {
      const prevScore = prev.rect.height - prev.depth * 10;
      const currScore = curr.rect.height - curr.depth * 10;
      return currScore > prevScore ? curr : prev;
    });

    items.push(best.el);
    lastBottom = best.rect.bottom;

    if (items.length >= expectedCount) break;
  }

  return items;
}

/**
 * Estimate positions when DOM detection fails
 * Uses the search container height and typical Google Places item heights
 */
function estimatePositions(
  searchElement: HTMLElement,
  container: HTMLDivElement,
  distances: string[]
): DistancePosition[] {
  const searchRect = searchElement.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const count = distances.length;

  if (count === 0 || searchRect.height < 100) return [];

  // Google Places UI Kit cards vary in height:
  // - Compact: ~120px (name, address only)
  // - Standard: ~180px (with rating)
  // - Full: ~250px+ (with hours, photos)
  // We estimate based on available height divided by item count
  const availableHeight = searchRect.height;
  const estimatedItemHeight = Math.max(120, Math.min(280, availableHeight / count));
  const positions: DistancePosition[] = [];

  // Start from the top of the search element relative to container
  const startOffset = searchRect.top - containerRect.top;

  // Add small initial offset for the Google Maps header (~50px)
  const headerOffset = 50;

  for (let i = 0; i < count; i++) {
    const top = startOffset + headerOffset + (i * estimatedItemHeight);
    positions.push({
      index: i,
      top,
      height: estimatedItemHeight,
      distance: distances[i],
    });
  }

  return positions;
}

/**
 * Custom hook for aligning distance badges with Google Places UI Kit results
 *
 * Uses MutationObserver and ResizeObserver to detect rendered place items
 * and calculate their positions for overlay alignment.
 */
export function useDistanceOverlay({
  searchRef,
  containerRef,
  distances,
  isReady,
}: UseDistanceOverlayOptions): UseDistanceOverlayReturn {
  const [positions, setPositions] = useState<DistancePosition[]>([]);
  const [isAligned, setIsAligned] = useState(false);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 15;

  /**
   * Calculate positions based on detected place items
   */
  const calculatePositions = useCallback(() => {
    const searchElement = searchRef.current;
    const container = containerRef.current;

    if (!searchElement || !container || distances.length === 0) {
      setPositions([]);
      setIsAligned(false);
      return;
    }

    // Wait for the search element to have content
    const searchRect = searchElement.getBoundingClientRect();
    if (searchRect.height < 50) {
      // Content not rendered yet, retry
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        const delay = Math.min(150 * Math.pow(1.3, retryCountRef.current), 1500);
        setTimeout(calculatePositions, delay);
      }
      return;
    }

    const items = findPlaceItems(searchElement, distances.length);
    const containerRect = container.getBoundingClientRect();

    if (items.length >= distances.length) {
      // Success: Found all items, use actual positions
      retryCountRef.current = 0;
      const newPositions: DistancePosition[] = [];

      items.forEach((item, index) => {
        if (index >= distances.length) return;
        const itemRect = item.getBoundingClientRect();
        newPositions.push({
          index,
          top: itemRect.top - containerRect.top,
          height: itemRect.height,
          distance: distances[index],
        });
      });

      setPositions(newPositions);
      setIsAligned(true);
    } else if (retryCountRef.current < maxRetries) {
      // Not enough items found, retry
      retryCountRef.current++;
      const delay = Math.min(150 * Math.pow(1.3, retryCountRef.current), 1500);
      setTimeout(calculatePositions, delay);
    } else {
      // Fallback: Estimate positions based on container height
      console.log('[useDistanceOverlay] Using estimated positions');
      const estimated = estimatePositions(searchElement, container, distances);
      setPositions(estimated);
      setIsAligned(estimated.length > 0);
    }
  }, [searchRef, containerRef, distances]);

  /**
   * Debounced version for resize events
   */
  const debouncedCalculate = useCallback(
    debounce(() => {
      requestAnimationFrame(calculatePositions);
    }, 150),
    [calculatePositions]
  );

  /**
   * Set up observers when ready
   */
  useEffect(() => {
    if (!isReady || !searchRef.current || !containerRef.current) {
      return;
    }

    const searchElement = searchRef.current;
    const container = containerRef.current;

    // Initial calculation with a small delay for DOM to settle
    const initialTimeout = setTimeout(() => {
      retryCountRef.current = 0;
      calculatePositions();
    }, 200);

    // MutationObserver for DOM changes (new results, content updates)
    mutationObserverRef.current = new MutationObserver(() => {
      retryCountRef.current = 0;
      debouncedCalculate();
    });

    mutationObserverRef.current.observe(searchElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Also observe shadow DOM if accessible
    const shadowRoot = (searchElement as Element & { shadowRoot?: ShadowRoot }).shadowRoot;
    if (shadowRoot) {
      mutationObserverRef.current.observe(shadowRoot, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }

    // ResizeObserver for layout changes
    resizeObserverRef.current = new ResizeObserver(() => {
      debouncedCalculate();
    });

    resizeObserverRef.current.observe(container);
    resizeObserverRef.current.observe(searchElement);

    return () => {
      clearTimeout(initialTimeout);
      mutationObserverRef.current?.disconnect();
      resizeObserverRef.current?.disconnect();
    };
  }, [isReady, searchRef, containerRef, calculatePositions, debouncedCalculate]);

  /**
   * Recalculate when distances change
   */
  useEffect(() => {
    if (isReady && distances.length > 0) {
      retryCountRef.current = 0;
      calculatePositions();
    }
  }, [isReady, distances, calculatePositions]);

  return { positions, isAligned };
}

export default useDistanceOverlay;
