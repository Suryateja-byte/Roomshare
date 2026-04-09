"use client";

import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from "framer-motion";
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
  const reducedMotion = useReducedMotion();
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
          transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }}
          className="fixed inset-x-0 z-50 z-[1201] mx-auto flex w-max items-center justify-center gap-2 rounded-full bg-on-surface px-5 py-3 text-white shadow-2xl shadow-on-surface/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 active:scale-95 md:hidden"
          style={{
            bottom: isListMode
              ? "calc(var(--mobile-bottom-nav-offset, 4.5rem) + 1.5rem + env(safe-area-inset-bottom, 0px))"
              : `calc(max(${SNAP_COLLAPSED * 100}dvh, var(--mobile-bottom-nav-offset, 4.5rem)) + 1rem + env(safe-area-inset-bottom, 0px))`,
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
