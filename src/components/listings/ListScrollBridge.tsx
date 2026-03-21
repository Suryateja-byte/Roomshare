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
 * 5. If element not found, retries on next render (max 10 attempts)
 * 6. Auto-acks after 10 failed attempts to prevent infinite retry loops
 */

import { useEffect, useRef } from "react";
import { useListingFocus } from "@/contexts/ListingFocusContext";

/** Max render-cycle retries before auto-acknowledging a scroll request */
const MAX_SCROLL_RETRIES = 10;

export default function ListScrollBridge() {
  const { scrollRequest, ackScrollTo } = useListingFocus();
  const lastProcessedNonce = useRef<number | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    // Guard: No scroll request or already processed this nonce
    if (!scrollRequest) return;
    if (scrollRequest.nonce === lastProcessedNonce.current) return;

    const { id, nonce } = scrollRequest;

    // Safety: auto-ack after too many failed attempts (element likely not in DOM)
    if (retryCountRef.current >= MAX_SCROLL_RETRIES) {
      lastProcessedNonce.current = nonce;
      ackScrollTo(nonce);
      retryCountRef.current = 0;
      return;
    }

    // Escape ID for safe use in CSS selectors (handles special characters)
    const safeId =
      typeof CSS !== "undefined" && CSS.escape
        ? CSS.escape(id)
        : id.replace(/[^\w-]/g, "");

    // Find target card using data-testid (preferred) with fallback to data-listing-id
    const targetCard =
      document.querySelector(`[data-testid="listing-card-${safeId}"]`) ??
      document.querySelector(`[data-listing-id="${safeId}"]`);

    // If element not found, increment retry counter and allow retry on next render
    // (card may not be rendered yet due to virtualization or lazy loading)
    if (!targetCard) {
      retryCountRef.current += 1;
      return;
    }

    // Element found - perform scroll
    targetCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });

    // Track nonce AFTER successful scroll to prevent double-processing
    // This ensures "not mounted yet" cases can retry on next render
    lastProcessedNonce.current = nonce;
    retryCountRef.current = 0;

    // Acknowledge AFTER scroll triggers - clears scrollRequest in context
    ackScrollTo(nonce);
  }, [scrollRequest, ackScrollTo]);

  // This component renders nothing - it's purely a side-effect bridge
  return null;
}
