"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

interface ListingViewTrackerProps {
  listingId: string;
  ownerId: string;
}

export default function ListingViewTracker({
  listingId,
  ownerId,
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

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const payload = new Blob(["{}"], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, payload)) {
        return;
      }
    }

    void fetch(endpoint, {
      method: "POST",
      body: "{}",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
    }).catch(() => {});
  }, [listingId, ownerId, session?.user?.id, status]);

  return null;
}
