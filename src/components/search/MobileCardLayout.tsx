"use client";

import { type ReactNode } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

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
 *
 * P0-FIX (#161): Uses useMediaQuery to conditionally render children once,
 * preventing double mounting of child components and their useEffect hooks.
 */
export default function MobileCardLayout({ children }: MobileCardLayoutProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // During SSR/hydration (isDesktop === undefined), render desktop layout
  // to match server-rendered HTML (CSS handles visibility)
  const showDesktopLayout = isDesktop !== false;

  return (
    <div className="mobile-card-layout">
      {showDesktopLayout ? (
        /* Desktop: standard grid */
        <div className="hidden md:grid md:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8 p-4">
          {children}
        </div>
      ) : (
        /* Mobile: full-bleed single column */
        <div className="flex flex-col gap-0" data-mobile-layout>
          {children}
        </div>
      )}
      <style jsx>{`
        /* Mobile full-bleed: remove card image rounding and padding */
        .mobile-card-layout :global([data-mobile-layout] [data-carousel-container]) {
          border-radius: 0;
        }
        /* Prevent vertical scroll while swiping carousel horizontally */
        .mobile-card-layout :global([data-mobile-layout] .embla) {
          touch-action: pan-y;
        }
        /* Tighter card spacing on mobile */
        .mobile-card-layout :global([data-mobile-layout] > *) {
          border-bottom: 1px solid var(--border-color, #e4e4e7);
          padding: 12px 0;
        }
      `}</style>
    </div>
  );
}
