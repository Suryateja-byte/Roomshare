"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

interface ListingViewTrackerProps {
  listingId: string;
  ownerId: string;
  viewToken?: string;
}

export default function ListingViewTracker({
  listingId,
  ownerId,
  viewToken,
}: ListingViewTrackerProps) {
  const { data: session, status } = useSession();
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    if (hasTrackedRef.current || status === "loading") {
      return;
    }

    if (session?.user?.id === ownerId) {
      return;
    }

    hasTrackedRef.current = true;
    const endpoint = `/api/listings/${listingId}/view`;
    // API-003 FIX: Include HMAC view token for request authenticity
    const body = viewToken ? JSON.stringify({ vt: viewToken }) : "{}";

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const payload = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, payload)) {
        return;
      }
    }

    void fetch(endpoint, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
    }).catch(() => {});
  }, [listingId, ownerId, session?.user?.id, status, viewToken]);

  return null;
}
