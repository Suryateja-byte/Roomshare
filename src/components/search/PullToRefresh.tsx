"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { ArrowDown, Loader2 } from "lucide-react";

const PULL_THRESHOLD = 60;
const MAX_PULL = 100;

interface PullToRefreshProps {
  children: ReactNode;
  /** Called when pull gesture completes. Should return a promise that resolves when refresh is done. */
  onRefresh: () => Promise<void>;
  /** Whether pull-to-refresh is enabled (disable when not at scroll top) */
  enabled?: boolean;
  /**
   * P2-FIX (#162): Optional ref to the actual scrollable container.
   * If provided, scrollTop is checked on this element instead of the wrapper div.
   * This fixes the issue where the wrapper div is not scrollable (scrollTop always 0).
   */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Pull-to-refresh wrapper for mobile list views.
 * Shows an animated indicator when pulling down from the top of the content.
 */
export default function PullToRefresh({
  children,
  onRefresh,
  enabled = true,
  scrollContainerRef,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || isRefreshing) return;
      // P2-FIX (#162): Use scrollContainerRef if provided, otherwise fallback to containerRef.
      // The containerRef wrapper div is not scrollable (scrollTop always 0).
      // The actual scroll element is typically passed via scrollContainerRef.
      const scrollElement = scrollContainerRef?.current ?? containerRef.current;
      if (scrollElement && scrollElement.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
        setIsPulling(true);
      }
    },
    [enabled, isRefreshing, scrollContainerRef],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPulling || isRefreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPullDistance(0);
        return;
      }
      // Diminishing returns past threshold
      const dampened = Math.min(MAX_PULL, dy * 0.5);
      setPullDistance(dampened);
    },
    [isPulling, isRefreshing],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;
    setIsPulling(false);

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD * 0.6); // Hold at indicator position
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, pullDistance, isRefreshing, onRefresh]);

  // P2-FIX (#178): Handle touchCancel to reset state when touch is interrupted
  // (e.g., browser gesture, incoming call, alert). Without this, isPulling
  // can stay true incorrectly.
  const handleTouchCancel = useCallback(() => {
    setIsPulling(false);
    setPullDistance(0);
  }, []);

  const progress = Math.min(1, pullDistance / PULL_THRESHOLD);
  const showIndicator = pullDistance > 10 || isRefreshing;

  return (
    <LazyMotion features={domAnimation}>
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        className="relative"
      >
        {/* Pull indicator */}
        {showIndicator && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, height: pullDistance }}
            className="flex items-center justify-center overflow-hidden"
          >
            {isRefreshing ? (
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            ) : (
              <m.div
                animate={{ rotate: progress >= 1 ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ArrowDown className="w-5 h-5 text-zinc-500" />
              </m.div>
            )}
          </m.div>
        )}

        {children}
      </div>
    </LazyMotion>
  );
}
