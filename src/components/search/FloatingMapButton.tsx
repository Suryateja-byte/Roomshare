"use client";

import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { Map, List } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { SNAP_COLLAPSED } from "@/lib/mobile-layout";

interface FloatingMapButtonProps {
  /** Whether the bottom sheet is showing list content (half or expanded) */
  isListMode: boolean;
  /** Number of results to display */
  resultCount?: number;
  /** Toggle between map-focused and list-focused views */
  onToggle: () => void;
}

/**
 * Floating pill button at the bottom center of mobile viewport.
 * Toggles between map-focused (sheet collapsed) and list-focused (sheet half) views.
 */
export default function FloatingMapButton({
  isListMode,
  resultCount,
  onToggle,
}: FloatingMapButtonProps) {
  const label = isListMode
    ? "Map"
    : resultCount != null
      ? `List · ${resultCount}`
      : "List";

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait">
        <m.button
          key={isListMode ? "map" : "list"}
          onClick={() => {
            triggerHaptic();
            onToggle();
          }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 min-h-[44px] bg-on-surface text-white rounded-full shadow-xl shadow-on-surface/30 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/30 md:hidden ${
            // P1-FIX (#80): Adjust bottom position based on sheet state to avoid overlap.
            // When sheet is collapsed (isListMode=false), position higher to clear the sheet header.
            // P2-FIX (#134): Add safe-area-inset-bottom for notched devices.
            // P2-18 FIX: Bottom position derived from shared SNAP_COLLAPSED constant (was hardcoded 15dvh).
            isListMode
              ? "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
              : "pb-[env(safe-area-inset-bottom,0px)]"
          }`}
          style={{
            bottom: isListMode
              ? "1.5rem"
              : `calc(${SNAP_COLLAPSED * 100}dvh + 1rem)`,
          }}
          aria-label={isListMode ? "Show map" : "Show list"}
        >
          {isListMode ? (
            <Map className="w-4 h-4" />
          ) : (
            <List className="w-4 h-4" />
          )}
          <span className="text-sm font-semibold whitespace-nowrap">
            {label}
          </span>
        </m.button>
      </AnimatePresence>
    </LazyMotion>
  );
}
