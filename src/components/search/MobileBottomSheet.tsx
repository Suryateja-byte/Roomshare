"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";

/**
 * Snap points as fractions of viewport height (from bottom).
 * collapsed = just header peek, half = half screen, expanded = near full.
 */
const SNAP_COLLAPSED = 0.15; // ~15vh
const SNAP_HALF = 0.5; // ~50vh
const SNAP_EXPANDED = 0.85; // ~85vh

const SNAP_POINTS = [SNAP_COLLAPSED, SNAP_HALF, SNAP_EXPANDED] as const;

/** Minimum drag distance (px) to trigger a snap change */
const DRAG_THRESHOLD = 40;
/** Velocity threshold (px/ms) for flick gestures */
const FLICK_VELOCITY = 0.4;
/** Max overscroll distance (px) before full rubber-band resistance */
const MAX_OVERSCROLL = 80;

/** Spring config for snap animations */
const SPRING_CONFIG = { stiffness: 400, damping: 30, mass: 0.8 };

interface MobileBottomSheetProps {
  children: ReactNode;
  /** Result count text shown in the sheet header */
  headerText?: string;
}

/**
 * Draggable bottom sheet for mobile search results.
 * Overlays the map and snaps to 3 positions: collapsed, half, expanded.
 *
 * Gesture handling:
 * - Drag the handle/header to resize
 * - When expanded and scrolled to top, dragging down collapses
 * - Flick velocity determines snap direction
 * - Rubber-band effect at sheet edges
 *
 * Accessibility:
 * - role="region" with aria-label
 * - Escape collapses to half
 * - Handle is a button for keyboard users
 */
export default function MobileBottomSheet({
  children,
  headerText,
}: MobileBottomSheetProps) {
  const [snapIndex, setSnapIndex] = useState(1); // Start at half
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartSnap = useRef(0);
  const dragStartTime = useRef(0);
  const isScrollDrag = useRef(false);

  const currentSnap = SNAP_POINTS[snapIndex];

  // Rubber-band effect: resistance increases as you drag past edges
  const getRubberbandOffset = useCallback(
    (rawOffset: number): number => {
      const heightPx = currentSnap * window.innerHeight;
      const minPx = SNAP_COLLAPSED * window.innerHeight;
      const maxPx = SNAP_EXPANDED * window.innerHeight;

      const proposedPx = heightPx - rawOffset;

      if (proposedPx > maxPx) {
        // Dragging above expanded — rubber-band
        const excess = proposedPx - maxPx;
        const dampened = MAX_OVERSCROLL * (1 - Math.exp(-excess / MAX_OVERSCROLL));
        return heightPx - (maxPx + dampened);
      }
      if (proposedPx < minPx) {
        // Dragging below collapsed — rubber-band
        const excess = minPx - proposedPx;
        const dampened = MAX_OVERSCROLL * (1 - Math.exp(-excess / MAX_OVERSCROLL));
        return heightPx - (minPx - dampened);
      }
      return rawOffset;
    },
    [currentSnap],
  );

  const displayOffset = isDragging ? getRubberbandOffset(dragOffset) : 0;
  const displayHeightVh = currentSnap * 100;
  const displayHeightPx = isDragging
    ? currentSnap * window.innerHeight - displayOffset
    : undefined;

  // Find nearest snap point given a fraction
  const findNearestSnap = useCallback(
    (fraction: number, velocity: number): number => {
      // Flick up → go to next higher snap
      if (velocity < -FLICK_VELOCITY && snapIndex < SNAP_POINTS.length - 1) {
        return snapIndex + 1;
      }
      // Flick down → go to next lower snap
      if (velocity > FLICK_VELOCITY && snapIndex > 0) {
        return snapIndex - 1;
      }

      // Otherwise snap to nearest
      let nearest = 0;
      let minDist = Math.abs(fraction - SNAP_POINTS[0]);
      for (let i = 1; i < SNAP_POINTS.length; i++) {
        const dist = Math.abs(fraction - SNAP_POINTS[i]);
        if (dist < minDist) {
          minDist = dist;
          nearest = i;
        }
      }
      return nearest;
    },
    [snapIndex],
  );

  // Touch handlers for the drag handle
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      dragStartY.current = touch.clientY;
      dragStartSnap.current = SNAP_POINTS[snapIndex];
      dragStartTime.current = Date.now();
      isScrollDrag.current = false;
      setIsDragging(true);
      setDragOffset(0);
    },
    [snapIndex],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const dy = touch.clientY - dragStartY.current;

      // If dragging from content area, only allow if scrolled to top and dragging down
      if (isScrollDrag.current) {
        const content = contentRef.current;
        if (content && content.scrollTop > 0) {
          setIsDragging(false);
          setDragOffset(0);
          return;
        }
        if (dy < 0) return; // Only allow downward drag from content
      }

      setDragOffset(dy);
    },
    [isDragging],
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const elapsed = Date.now() - dragStartTime.current;
    const velocity = dragOffset / elapsed; // px/ms, positive = downward

    if (Math.abs(dragOffset) < DRAG_THRESHOLD && Math.abs(velocity) < FLICK_VELOCITY) {
      // Too small a drag — stay put
      setDragOffset(0);
      return;
    }

    const currentFraction =
      dragStartSnap.current - dragOffset / window.innerHeight;
    const newIndex = findNearestSnap(currentFraction, velocity);

    setSnapIndex(newIndex);
    setDragOffset(0);
  }, [isDragging, dragOffset, findNearestSnap]);

  // Content area touch start — track that drag originated from content
  const handleContentTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Only allow sheet collapse from content when expanded and scrolled to top
      if (snapIndex !== 2) return;
      const content = contentRef.current;
      if (content && content.scrollTop <= 0) {
        isScrollDrag.current = true;
        handleTouchStart(e);
      }
    },
    [snapIndex, handleTouchStart],
  );

  // Escape key collapses to half
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSnapIndex(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Prevent body scroll when sheet is expanded
  useEffect(() => {
    if (snapIndex === 2) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [snapIndex]);

  const isExpanded = snapIndex === 2;
  const isCollapsed = snapIndex === 0;

  return (
    <LazyMotion features={domAnimation}>
      {/* Dim overlay behind sheet when expanded */}
      <AnimatePresence>
        {isExpanded && !isDragging && (
          <m.div
            key="sheet-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 bg-black pointer-events-none md:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <m.div
        ref={sheetRef}
        role="region"
        aria-label="Search results"
        className="fixed bottom-0 left-0 right-0 z-40 flex flex-col bg-white dark:bg-zinc-900 rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.4)]"
        animate={
          isDragging
            ? { height: displayHeightPx }
            : { height: `${displayHeightVh}vh` }
        }
        transition={isDragging ? { duration: 0 } : { type: "spring", ...SPRING_CONFIG }}
        style={{
          willChange: "height",
          touchAction: "none",
        }}
      >
        {/* Drag handle area */}
        <div
          className="flex-shrink-0 pt-2 pb-3 px-4 cursor-grab active:cursor-grabbing select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Visual handle bar */}
          <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 mx-auto mb-2" />

          {/* Header content */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-900 dark:text-white">
              {headerText || "Search results"}
            </span>
            {isCollapsed && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Pull up for listings
              </span>
            )}
            {!isCollapsed && (
              <button
                onClick={() =>
                  setSnapIndex((prev) => (prev === 2 ? 1 : 2))
                }
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-2 py-1 rounded transition-colors"
                aria-label={
                  isExpanded ? "Collapse results" : "Expand results"
                }
              >
                {isExpanded ? "Collapse" : "Expand"}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide"
          onTouchStart={handleContentTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            // Prevent scroll when collapsed
            overflowY: isCollapsed ? "hidden" : "auto",
          }}
        >
          {children}
        </div>
      </m.div>
    </LazyMotion>
  );
}
