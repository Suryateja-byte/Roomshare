"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import PullToRefresh from "./PullToRefresh";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useMediaQuery } from "@/hooks/useMediaQuery";
// P2-18 FIX: Import snap points from shared constants so FloatingMapButton
// and MobileBottomSheet stay in sync. Previously hardcoded locally.
import { SNAP_COLLAPSED, SNAP_HALF, SNAP_EXPANDED } from "@/lib/mobile-layout";

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
  /** Controlled snap index (0=collapsed, 1=half, 2=expanded) */
  snapIndex?: number;
  /** Callback when snap index changes */
  onSnapChange?: (index: number) => void;
  /** Called when pull-to-refresh gesture completes */
  onRefresh?: () => Promise<void>;
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
 * CSS Scroll-Snap Enhancement (P2-FIX #128):
 * - Content area uses scroll-snap-type: y proximity for native-like list scrolling
 * - Child listing cards can use scroll-snap-align: start for card-level snapping
 * - CSS custom properties exposed via data attributes for potential CSS-only enhancements
 * - Falls back gracefully on browsers without scroll-snap support
 *
 * Accessibility:
 * - role="region" with aria-label
 * - Escape collapses to half
 * - Handle is a button for keyboard users
 */
export default function MobileBottomSheet({
  children,
  headerText,
  snapIndex: controlledSnap,
  onSnapChange,
  onRefresh,
}: MobileBottomSheetProps) {
  const [internalSnap, setInternalSnap] = useState(1); // Start at half
  const snapIndex = controlledSnap ?? internalSnap;
  const setSnapIndex = useCallback(
    (valOrFn: number | ((prev: number) => number)) => {
      const newVal =
        typeof valOrFn === "function" ? valOrFn(snapIndex) : valOrFn;
      if (onSnapChange) {
        onSnapChange(newVal);
      } else {
        setInternalSnap(newVal);
      }
    },
    [snapIndex, onSnapChange]
  );
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef(0);
  const viewportHeightRef = useRef(0);
  // MED-11 FIX: RAF-throttle drag state updates to prevent 60 setState/sec during touch drag.
  const dragRafRef = useRef<number | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartSnap = useRef(0);
  const dragStartTime = useRef(0);
  const isScrollDrag = useRef(false);
  const isDraggingRef = useRef(false);
  // P2-FIX (#78): Cache window.innerHeight at drag start to avoid repeated DOM access
  // Using state instead of ref so it can be safely read during render (React compiler compliant)
  const [viewportHeight, setViewportHeight] = useState(0);

  const currentSnap = SNAP_POINTS[snapIndex];

  // Rubber-band effect: resistance increases as you drag past edges
  const getRubberbandOffset = useCallback(
    (rawOffset: number): number => {
      // P2-FIX (#78): Use cached viewport height instead of repeated DOM access
      const vh = viewportHeight || window.innerHeight;
      const heightPx = currentSnap * vh;
      const minPx = SNAP_COLLAPSED * vh;
      const maxPx = SNAP_EXPANDED * vh;

      const proposedPx = heightPx - rawOffset;

      if (proposedPx > maxPx) {
        // Dragging above expanded — rubber-band
        const excess = proposedPx - maxPx;
        const dampened =
          MAX_OVERSCROLL * (1 - Math.exp(-excess / MAX_OVERSCROLL));
        return heightPx - (maxPx + dampened);
      }
      if (proposedPx < minPx) {
        // Dragging below collapsed — rubber-band
        const excess = minPx - proposedPx;
        const dampened =
          MAX_OVERSCROLL * (1 - Math.exp(-excess / MAX_OVERSCROLL));
        return heightPx - (minPx - dampened);
      }
      return rawOffset;
    },
    [currentSnap, viewportHeight]
  );

  const displayOffset = isDragging ? getRubberbandOffset(dragOffset) : 0;
  const displayHeightVh = currentSnap * 100;
  // P2-FIX (#78): Use cached viewport height during drag
  const displayHeightPx = isDragging
    ? currentSnap * (viewportHeight || window.innerHeight) - displayOffset
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
    [snapIndex]
  );

  // Touch handlers for the drag handle
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      dragStartY.current = touch.clientY;
      dragStartSnap.current = SNAP_POINTS[snapIndex];
      dragStartTime.current = Date.now();
      isScrollDrag.current = false;
      isDraggingRef.current = true;
      // P2-FIX (#78): Cache viewport height at drag start to avoid repeated DOM access during touchmove
      viewportHeightRef.current = window.innerHeight;
      dragOffsetRef.current = 0;
      setViewportHeight(window.innerHeight);
      setIsDragging(true);
      setDragOffset(0);
    },
    [snapIndex]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const touch = e.touches[0];
    const dy = touch.clientY - dragStartY.current;

    // If dragging from content area, only allow if scrolled to top and dragging down
    if (isScrollDrag.current) {
      const content = contentRef.current;
      if (content && content.scrollTop > 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
        setDragOffset(0);
        dragOffsetRef.current = 0;
        return;
      }
      if (dy < 0) return; // Only allow downward drag from content
    }

    // MED-11 FIX: Update ref immediately (for touchEnd calculation) but
    // throttle React state update to one per animation frame.
    dragOffsetRef.current = dy;
    if (dragRafRef.current === null) {
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        setDragOffset(dragOffsetRef.current);
      });
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const currentDragOffset = dragOffsetRef.current;
    const currentViewportHeight = viewportHeightRef.current;

    // P2-FIX (#87): Clamp elapsed time to avoid velocity spikes from very short drags
    // or division by near-zero if touchend fires immediately after touchstart
    const rawElapsed = Date.now() - dragStartTime.current;
    const elapsed = Math.max(rawElapsed, 16); // Minimum 16ms (~1 frame)
    const velocity = currentDragOffset / elapsed; // px/ms, positive = downward

    if (
      Math.abs(currentDragOffset) < DRAG_THRESHOLD &&
      Math.abs(velocity) < FLICK_VELOCITY
    ) {
      // Too small a drag — stay put
      setDragOffset(0);
      dragOffsetRef.current = 0;
      return;
    }

    // P2-FIX (#78): Use cached viewport height from drag start
    const currentFraction =
      dragStartSnap.current -
      currentDragOffset / (currentViewportHeight || window.innerHeight);
    const newIndex = findNearestSnap(currentFraction, velocity);

    setSnapIndex(newIndex);
    setDragOffset(0);
    dragOffsetRef.current = 0;
  }, [findNearestSnap, setSnapIndex]);

  // Reset drag state on system interruption (incoming call, notification, gesture conflict)
  const handleTouchCancel = useCallback(() => {
    isDraggingRef.current = false;
    dragOffsetRef.current = 0;
    setIsDragging(false);
    setDragOffset(0);
  }, []);

  // Safety net: clear drag state when touch ends outside the handle
  useEffect(() => {
    if (!isDragging) return;

    const handleDocumentTouchEnd = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        setDragOffset(0);
      }
    };

    document.addEventListener("touchend", handleDocumentTouchEnd);
    document.addEventListener("touchcancel", handleDocumentTouchEnd);

    return () => {
      document.removeEventListener("touchend", handleDocumentTouchEnd);
      document.removeEventListener("touchcancel", handleDocumentTouchEnd);
    };
  }, [isDragging]);

  // Content area touch start — track that drag originated from content
  const handleContentTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Only allow sheet collapse from content when not already collapsed
      if (snapIndex === 0) return;

      // P1-5 FIX: Don't intercept touches on interactive elements
      // This prevents buttons, links, and inputs from being blocked by drag gestures
      const target = e.target as HTMLElement;
      // L5-MAP FIX: Include all form controls to prevent drag gestures from blocking interaction
      const isInteractive = target.closest(
        'button, a, input, select, textarea, [role="button"], [role="listbox"], [role="slider"], [data-interactive]'
      );
      if (isInteractive) return;

      const content = contentRef.current;
      if (content && content.scrollTop <= 0) {
        isScrollDrag.current = true;
        handleTouchStart(e);
      }
    },
    [snapIndex, handleTouchStart]
  );

  // Escape key collapses to half (only when sheet is visible and no higher-priority handlers)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && snapIndex !== 0) {
        // Don't handle Escape if a dialog/modal or focus trap is already handling it
        if (
          document.querySelector('[role="dialog"][aria-modal="true"]') ||
          document.querySelector("[data-focus-trap]")
        )
          return;
        // Only handle if sheet is not collapsed (map popup has priority via stopImmediatePropagation)
        setSnapIndex(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [snapIndex, setSnapIndex]);

  // Prevent body scroll when sheet is expanded or during drag.
  // P2-FIX (#117): Also lock body scroll during drag transitions to prevent background scrolling.
  // P2-FIX (#6-statesync): Guard with isDesktop === false to prevent scroll lock persisting
  // when the mobile container is CSS-hidden on desktop (e.g., tablet rotation).
  // useMediaQuery returns undefined during SSR — strict equality with false ensures
  // no lock fires during SSR/hydration (safe because sheet starts at snapIndex 1).
  const isDesktop = useMediaQuery("(min-width: 768px)");
  useBodyScrollLock((snapIndex === 2 || isDragging) && isDesktop === false);

  const isExpanded = snapIndex === 2;
  const isCollapsed = snapIndex === 0;

  // Bug #3 fix: When expanded, raise sheet above the fixed header (z-[1100])
  // so minimize/collapse buttons receive pointer events.
  // framer-motion freezes zIndex in the style prop at its initial value,
  // so we set it directly on the DOM element after each state change.
  useEffect(() => {
    if (sheetRef.current) {
      sheetRef.current.style.zIndex = isExpanded ? "1200" : "40";
    }
  }, [isExpanded]);

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
            className="fixed inset-0 z-30 bg-on-surface pointer-events-none md:hidden"
            data-testid="sheet-overlay"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <m.div
        ref={sheetRef}
        role="region"
        aria-label="Search results"
        className="fixed bottom-0 left-0 right-0 flex flex-col bg-surface-container-lowest rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)][0_-4px_24px_rgba(0,0,0,0.4)]"
        animate={
          isDragging
            ? { height: displayHeightPx }
            : { height: `${displayHeightVh}dvh` }
        }
        transition={
          isDragging ? { duration: 0 } : { type: "spring", ...SPRING_CONFIG }
        }
        style={
          {
            willChange: isDragging ? "height" : "auto",
            // P0-FIX (#82, #73): Allow map touches to pass through when collapsed.
            // Only capture pointer events on the visible handle/content areas.
            // touchAction moved to drag handle only to allow map pan gestures.
            pointerEvents: isCollapsed ? "none" : "auto",
            // P2-FIX (#105): Cross-platform GPU acceleration for smooth animations
            // translateZ(0) promotes to GPU layer on both iOS and Android
            WebkitTransform: "translateZ(0)",
            transform: "translateZ(0)",
            // Prevent flickering during animations on iOS
            WebkitBackfaceVisibility: "hidden",
            backfaceVisibility: "hidden",
            overscrollBehavior: "contain",
            // P2-FIX (#128): CSS custom properties for snap points.
            // Exposed as CSS variables so child components or global styles can use them.
            // Example usage: .listing-card { scroll-snap-align: start; }
            "--snap-collapsed": `${SNAP_COLLAPSED * 100}dvh`,
            "--snap-half": `${SNAP_HALF * 100}dvh`,
            "--snap-expanded": `${SNAP_EXPANDED * 100}dvh`,
            "--snap-current-index": snapIndex,
            "--snap-current-height": `${SNAP_POINTS[snapIndex] * 100}dvh`,
          } as React.CSSProperties
        }
      >
        {/* Drag handle area */}
        <div
          className="flex-shrink-0 pt-2 pb-3 px-4 cursor-grab active:cursor-grabbing select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          style={{
            // P0-FIX (#73): Only disable touch-action on handle, not entire sheet.
            // This allows map pan gestures to work on the content area below.
            touchAction: "none",
            // P0-FIX (#82): Keep handle interactive even when parent has pointer-events: none
            pointerEvents: "auto",
            // P2-FIX (#105): Remove iOS tap highlight for consistent cross-platform behavior
            WebkitTapHighlightColor: "transparent",
            // Prevent text selection during drag on both platforms
            WebkitUserSelect: "none",
            userSelect: "none",
          }}
        >
          {/* P2-9 FIX: Keyboard-accessible drag handle */}
          {/* P2-FIX (#103): Enhanced keyboard navigation with arrow keys */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Results panel size"
            aria-valuemin={0}
            aria-valuemax={2}
            aria-valuenow={snapIndex}
            aria-valuetext={
              snapIndex === 0
                ? "collapsed"
                : snapIndex === 1
                  ? "half screen"
                  : "expanded"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSnapIndex(snapIndex === 2 ? 1 : 2);
              } else if (e.key === "ArrowUp" || e.key === "ArrowRight") {
                e.preventDefault();
                if (snapIndex < 2) setSnapIndex(snapIndex + 1);
              } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
                e.preventDefault();
                if (snapIndex > 0) setSnapIndex(snapIndex - 1);
              } else if (e.key === "Home") {
                e.preventDefault();
                setSnapIndex(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setSnapIndex(2);
              }
            }}
            className="w-12 h-1.5 rounded-full bg-surface-container-high mx-auto mb-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
          />

          {/* Header content */}
          <div className="flex items-center justify-between">
            <span
              data-testid="sheet-header-text"
              className="text-sm font-semibold text-on-surface"
            >
              {headerText || "Search results"}
            </span>
            {isCollapsed && (
              <span className="text-xs text-on-surface-variant">
                Pull up for listings
              </span>
            )}
            {!isCollapsed && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSnapIndex((prev) => (prev === 2 ? 1 : 2))}
                  className="text-xs text-on-surface-variant hover:text-on-surface-variant px-2 py-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  aria-label={
                    isExpanded ? "Collapse results" : "Expand results"
                  }
                >
                  {isExpanded ? "Collapse" : "Expand"}
                </button>
                {/* P2-FIX (#123): Visible close button to dismiss sheet */}
                <button
                  onClick={() => setSnapIndex(0)}
                  className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface-variant rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  aria-label="Minimize results panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable content with CSS scroll-snap enhancement */}
        <div
          ref={contentRef}
          className={`flex-1 overflow-y-auto scrollbar-hide ${
            // P2-FIX (#134): Add safe area padding for notched devices when expanded
            isExpanded ? "pb-[env(safe-area-inset-bottom,0px)]" : ""
          }`}
          onTouchStart={handleContentTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          style={{
            // Prevent scroll when collapsed
            overflowY: isCollapsed ? "hidden" : "auto",
            // P0-FIX (#88): Prevent scroll events from propagating to map layer.
            // This prevents the "stuck on map" problem without JavaScript.
            overscrollBehavior: "contain",
            // P0-FIX (#82): Content receives pointer events even when collapsed handle is visible.
            // When fully collapsed, map interaction is more important than content.
            pointerEvents: isCollapsed ? "none" : "auto",
            // P2-FIX (#105): GPU acceleration hints for smooth scrolling
            willChange: isDragging ? "scroll-position" : "auto",
            // Force GPU layer for scroll performance
            transform: "translateZ(0)",
            // P2-FIX (#128): CSS scroll-snap for native-like content scrolling
            // 'y proximity' allows free scrolling with gentle snap at rest when not collapsed
            scrollSnapType: isCollapsed ? undefined : "y proximity",
            scrollBehavior: isCollapsed ? undefined : "smooth",
          }}
          // P2-FIX (#128): Data attributes for snap points (used by tests/debugging)
          data-snap-collapsed={SNAP_COLLAPSED}
          data-snap-half={SNAP_HALF}
          data-snap-expanded={SNAP_EXPANDED}
          data-snap-current={snapIndex}
        >
          {/* P1-FIX (#75): Only enable PTR when EXPANDED (not half).
              At half position, drag-down collapses the sheet - PTR would conflict.
              User must expand to full screen to access pull-to-refresh. */}
          {/* P2-FIX (#162): Pass contentRef as scrollContainerRef so PullToRefresh
              checks scrollTop on the actual scrollable element, not its wrapper. */}
          {onRefresh ? (
            <PullToRefresh
              onRefresh={onRefresh}
              enabled={isExpanded}
              scrollContainerRef={contentRef}
            >
              {children}
            </PullToRefresh>
          ) : (
            children
          )}
        </div>
      </m.div>
    </LazyMotion>
  );
}
