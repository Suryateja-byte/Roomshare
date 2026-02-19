import { useEffect, useRef } from "react";

/**
 * Module-level reference counter for body scroll locks.
 *
 * Multiple components can request a lock simultaneously (e.g. bottom sheet +
 * filter modal). The counter ensures `overflow: hidden` is applied when the
 * first consumer locks and only removed when the *last* consumer unlocks,
 * preventing the race where one component restores scroll while another still
 * needs it locked.
 */
let lockCount = 0;

function lock() {
  if (lockCount === 0) {
    document.body.style.overflow = "hidden";
  }
  lockCount++;
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = "";
  }
}

/**
 * Lock body scroll while `isLocked` is true.
 *
 * Uses a shared reference counter so multiple concurrent consumers
 * (bottom sheet, filter modal, search overlay) never race on
 * `document.body.style.overflow`.
 */
export function useBodyScrollLock(isLocked: boolean): void {
  const wasLocked = useRef(false);

  useEffect(() => {
    if (isLocked && !wasLocked.current) {
      lock();
      wasLocked.current = true;
    } else if (!isLocked && wasLocked.current) {
      unlock();
      wasLocked.current = false;
    }

    return () => {
      if (wasLocked.current) {
        unlock();
        wasLocked.current = false;
      }
    };
  }, [isLocked]);
}
