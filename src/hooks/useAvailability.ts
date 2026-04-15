"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AvailabilitySnapshot {
  listingId: string;
  totalSlots: number;
  effectiveAvailableSlots: number;
  heldSlots: number;
  acceptedSlots: number;
  rangeVersion: number;
  asOf: string;
  availabilitySource?: "LEGACY_BOOKING" | "HOST_MANAGED";
  isValid?: boolean;
  isPubliclyAvailable?: boolean;
}

export function useAvailability(
  listingId: string,
  startDate?: string,
  endDate?: string,
  options: {
    enabled?: boolean;
    intervalMs?: number;
    initialData?: AvailabilitySnapshot | null;
  } = {}
) {
  const enabled = options.enabled ?? true;
  const intervalMs = options.intervalMs ?? 30000;

  const [data, setData] = useState<AvailabilitySnapshot | null>(
    options.initialData ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAvailability = useCallback(async () => {
    if (!enabled) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }

      const response = await fetch(
        `/api/listings/${listingId}/availability${params.size > 0 ? `?${params.toString()}` : ""}`,
        {
          cache: "no-store",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch availability");
      }

      const payload = (await response.json()) as AvailabilitySnapshot;
      setData(payload);
    } catch (fetchError) {
      if ((fetchError as Error).name === "AbortError") {
        return;
      }
      setError("Failed to fetch availability");
    } finally {
      setIsLoading(false);
    }
  }, [enabled, endDate, listingId, startDate]);

  useEffect(() => {
    void fetchAvailability();
  }, [fetchAvailability]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchAvailability();
      }
    }, intervalMs);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchAvailability();
      }
    };

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
      abortRef.current?.abort();
    };
  }, [enabled, fetchAvailability, intervalMs]);

  return {
    availability: data,
    isLoading,
    error,
    refresh: fetchAvailability,
  };
}
