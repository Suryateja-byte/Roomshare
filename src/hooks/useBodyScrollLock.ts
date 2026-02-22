import { useEffect, useRef } from "react";

/**
 * Module-level reference counter for body scroll locks.
 * Uses position:fixed + scroll restoration to prevent iOS Safari rubber-banding.
 */
let lockCount = 0;
let savedScrollY = 0;

function lock() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.overflow = "hidden";
  }
  lockCount++;
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.overflow = "";
    requestAnimationFrame(() => {
      window.scrollTo(0, savedScrollY);
    });
  }
}

/**
 * Lock body scroll while `isLocked` is true.
 * Uses position:fixed + scroll restoration to prevent iOS Safari rubber-banding.
 * Shared reference counter ensures multiple concurrent consumers never race.
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

/** @internal Test-only reset. Not part of public API. */
export function _resetLockStateForTesting(): void {
  lockCount = 0;
  savedScrollY = 0;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.overflow = "";
}
