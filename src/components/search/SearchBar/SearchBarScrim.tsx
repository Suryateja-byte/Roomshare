"use client";

import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface SearchBarScrimProps {
  visible: boolean;
  onDismiss: () => void;
}

/**
 * Page scrim behind the expanded header search. Portaled to <body> so it sits
 * below the fixed header (z-1100) but above the page content. Purely visual
 * chrome — the document-level outside-click/Escape listeners remain the
 * actual collapse mechanism; clicking the scrim is just one such outside click.
 */
export function SearchBarScrim({ visible, onDismiss }: SearchBarScrimProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-hidden="true"
      onMouseDown={onDismiss}
      className={cn(
        "fixed inset-0 z-[1050] bg-on-surface/25 backdrop-blur-[2px]",
        "transition-opacity duration-300 ease-[var(--ease-warm)] motion-reduce:transition-none",
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    />,
    document.body
  );
}
