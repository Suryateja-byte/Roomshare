"use client";

import { type ReactNode } from "react";

interface MobileCardLayoutProps {
  children: ReactNode;
}

/**
 * Mobile-optimized card layout wrapper for search results.
 *
 * On mobile (<md):
 * - Full-bleed images (no horizontal padding, no rounded corners on images)
 * - touch-action: pan-y on carousel areas to prevent vertical scroll during horizontal swipe
 * - Single-column layout with tighter spacing
 *
 * On desktop (≥md):
 * - Standard grid layout with rounded images
 */
export default function MobileCardLayout({ children }: MobileCardLayoutProps) {
  return (
    <div className="mobile-card-layout">
      {/* Mobile: full-bleed single column */}
      <div className="md:hidden flex flex-col gap-0">
        {children}
      </div>
      {/* Desktop: standard grid */}
      <div className="hidden md:grid md:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8 p-4">
        {children}
      </div>
      <style jsx>{`
        /* Mobile full-bleed: remove card image rounding and padding */
        .mobile-card-layout :global(.md\\:hidden [data-carousel-container]) {
          border-radius: 0;
        }
        /* Prevent vertical scroll while swiping carousel horizontally */
        .mobile-card-layout :global(.md\\:hidden .embla) {
          touch-action: pan-y;
        }
        /* Tighter card spacing on mobile */
        .mobile-card-layout :global(.md\\:hidden > .flex > *) {
          border-bottom: 1px solid var(--border-color, #e4e4e7);
          padding: 12px 0;
        }
      `}</style>
    </div>
  );
}
