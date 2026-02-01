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

  // Scroll to active listing when it changes externally (e.g., pin tap)
  useEffect(() => {
    if (!activeListingId || !scrollRef.current || isScrollingRef.current) return;
    const index = listingIds.indexOf(activeListingId);
    if (index < 0) return;

    const container = scrollRef.current;
    const cardWidth = container.offsetWidth;
    container.scrollTo({ left: index * cardWidth, behavior: "smooth" });
  }, [activeListingId, listingIds]);

  // Detect which listing is centered after scroll ends
  const handleScroll = () => {
    if (!scrollRef.current || !onListingChange) return;
    isScrollingRef.current = true;

    // Use scrollend-like debounce
    const container = scrollRef.current;
    const cardWidth = container.offsetWidth;
    if (cardWidth === 0) return;

    const index = Math.round(container.scrollLeft / cardWidth);
    const id = listingIds[index];
    if (id && id !== activeListingId) {
      onListingChange(id);
    }

    // Reset scroll guard after a tick
    requestAnimationFrame(() => {
      isScrollingRef.current = false;
    });
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
