"use client";

/**
 * ListScrollBridge - Centralized scroll handler for list-map sync
 *
 * SINGLE OWNER of scroll-to-card behavior. When a map marker is clicked,
 * the scrollRequest is consumed here, not in individual ListingCard components.
 *
 * Key behaviors:
 * 1. Listens to scrollRequest from ListingFocusContext
 * 2. Finds the target card via data-testid (fallback to data-listing-id)
 * 3. Scrolls to it using smooth scrollIntoView
 * 4. Only acks AFTER scroll is triggered
 * 5. If element not found, does NOT ack (allows retry on next render)
 */

import { useEffect, useRef } from "react";
import { useListingFocus } from "@/contexts/ListingFocusContext";

export default function ListScrollBridge() {
  const { scrollRequest, ackScrollTo } = useListingFocus();
  const lastProcessedNonce = useRef<number | null>(null);

  useEffect(() => {
    // Guard: No scroll request or already processed this nonce
    if (!scrollRequest) return;
    if (scrollRequest.nonce === lastProcessedNonce.current) return;

    const { id, nonce } = scrollRequest;

    // Escape ID for safe use in CSS selectors (handles special characters)
    const safeId =
      typeof CSS !== "undefined" && CSS.escape
        ? CSS.escape(id)
        : id.replace(/[^\w-]/g, "");

    // Ask virtualized list to jump row into DOM before querying card element.
    window.dispatchEvent(
      new CustomEvent("listing-virtual-scroll-to", { detail: { id } }),
    );

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;

    const tryScroll = () => {
      if (cancelled) return;
      const targetCard =
        document.querySelector(`[data-listing-card-id="${safeId}"]`) ??
        document.querySelector(`[data-listing-id="${safeId}"]`);

      // If element not found, do NOT ack yet - retry over the next frames
      // so virtualized rows can mount after the jump.
      if (!targetCard) {
        attempts += 1;
        if (attempts < maxAttempts) {
          requestAnimationFrame(tryScroll);
        }
        return;
      }

      targetCard.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      lastProcessedNonce.current = nonce;
      ackScrollTo(nonce);
    };

    requestAnimationFrame(tryScroll);

    return () => {
      cancelled = true;
    };
  }, [scrollRequest, ackScrollTo]);

  // This component renders nothing - it's purely a side-effect bridge
  return null;
}
