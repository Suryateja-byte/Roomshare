"use client";

import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { Map, List } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

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
          onClick={() => { triggerHaptic(); onToggle(); }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full shadow-xl shadow-zinc-900/30 dark:shadow-black/20 active:scale-95 transition-colors md:hidden"
          aria-label={isListMode ? "Show map" : "Show list"}
        >
          {isListMode ? (
            <Map className="w-4 h-4" />
          ) : (
            <List className="w-4 h-4" />
          )}
          <span className="text-sm font-semibold whitespace-nowrap">{label}</span>
        </m.button>
      </AnimatePresence>
    </LazyMotion>
  );
}
