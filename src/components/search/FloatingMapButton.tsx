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
          className="fixed inset-x-0 z-50 mx-auto flex w-max items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-white shadow-2xl shadow-zinc-900/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 active:scale-95 md:hidden"
          style={{
            bottom: isListMode
              ? "calc(1.5rem + env(safe-area-inset-bottom, 0px))"
              : `calc(${SNAP_COLLAPSED * 100}dvh + 1rem + env(safe-area-inset-bottom, 0px))`,
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
