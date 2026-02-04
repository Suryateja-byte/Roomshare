"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface MobileListingPreviewProps {
  /** Currently active/selected listing ID */
  activeListingId: string | null;
  /** All listing IDs in order */
  listingIds: string[];
  /** Called when user swipes to a different listing */
  onListingChange?: (id: string) => void;
  /** Render a single listing preview card */
  renderPreview: (id: string) => ReactNode;
}

/**
 * Horizontal swipeable listing preview strip for mobile half-sheet mode.
 * Shows one listing at a time with snap-scroll between them.
 */
export default function MobileListingPreview({
  activeListingId,
  listingIds,
  onListingChange,
  renderPreview,
}: MobileListingPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  // P2-FIX (#143): Use debounced timeout instead of single rAF for scroll detection
  // Single rAF (~16ms) wasn't enough time for scroll animations to settle
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to active listing when it changes externally (e.g., pin tap)
  useEffect(() => {
    if (!activeListingId || !scrollRef.current || isScrollingRef.current) return;
    const index = listingIds.indexOf(activeListingId);
    if (index < 0) return;

    const container = scrollRef.current;
    const cardWidth = container.offsetWidth;
    container.scrollTo({ left: index * cardWidth, behavior: "smooth" });
  }, [activeListingId, listingIds]);

  // Cleanup scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Detect which listing is centered after scroll ends
  const handleScroll = () => {
    if (!scrollRef.current || !onListingChange) return;
    isScrollingRef.current = true;

    // Clear any pending scroll detection
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // P2-FIX (#143): Debounce scroll detection - only fire after 150ms of no scroll events
    // This prevents race conditions between user scroll, programmatic scroll, and state updates
    scrollTimeoutRef.current = setTimeout(() => {
      if (!scrollRef.current) return;

      const container = scrollRef.current;
      const cardWidth = container.offsetWidth;
      if (cardWidth === 0) return;

      const index = Math.round(container.scrollLeft / cardWidth);
      const id = listingIds[index];
      if (id && id !== activeListingId) {
        onListingChange(id);
      }

      // Reset scroll guard after processing
      isScrollingRef.current = false;
    }, 150);
  };

  if (listingIds.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
      onScrollCapture={handleScroll}
      style={{ scrollSnapType: "x mandatory" }}
    >
      {listingIds.map((id) => (
        <div
          key={id}
          className="flex-shrink-0 w-full snap-center px-4 py-2"
        >
          {renderPreview(id)}
        </div>
      ))}
    </div>
  );
}
