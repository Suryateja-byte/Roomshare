"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "roomshare-map-hints-seen";

export function MapGestureHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
      // Only show on touch devices
      if (!("ontouchstart" in window)) return;
      setVisible(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // fail silently
    }
  };

  return (
    <div
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-zinc-900/90 dark:bg-white/90 text-white dark:text-zinc-900 rounded-xl px-4 py-3 shadow-lg max-w-[260px] text-center animate-[fadeIn_300ms_ease-out]"
      role="status"
    >
      <button
        onClick={dismiss}
        className="absolute top-1 right-1 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/60 dark:text-zinc-900/60 hover:text-white dark:hover:text-zinc-900"
        aria-label="Dismiss hint"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <p className="text-sm font-medium mb-1">Pinch to zoom</p>
      <p className="text-xs opacity-75">Tap markers for listing details</p>
    </div>
  );
}
