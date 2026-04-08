"use client";

import { useEffect, useRef, useState } from "react";
import { DollarSign, MapPin, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";

interface Suggestion {
  type: "price" | "location" | "date";
  label: string;
  count: number | null; // null = loading or unavailable
  params: URLSearchParams;
}

interface ExpandSearchSuggestionsProps {
  currentCount: number;
  searchParamsString: string;
}

const ICONS = {
  price: DollarSign,
  location: MapPin,
  date: Calendar,
} as const;

/**
 * Shows actionable expansion suggestions when search returns 1-5 results.
 * Each suggestion relaxes one filter and lazy-fetches the resulting count.
 */
export function ExpandSearchSuggestions({
  currentCount,
  searchParamsString,
}: ExpandSearchSuggestionsProps) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const candidates: Suggestion[] = [];

    // 1. Price expansion: +$200 to maxPrice or -$200 from minPrice
    const maxPrice = params.get("maxPrice");
    const minPrice = params.get("minPrice");
    if (maxPrice) {
      const relaxed = new URLSearchParams(params);
      relaxed.set("maxPrice", String(Number(maxPrice) + 200));
      candidates.push({
        type: "price",
        label: "within $200 of your budget",
        count: null,
        params: relaxed,
      });
    } else if (minPrice) {
      const relaxed = new URLSearchParams(params);
      const newMin = Math.max(0, Number(minPrice) - 200);
      relaxed.set("minPrice", String(newMin));
      candidates.push({
        type: "price",
        label: "within $200 of your budget",
        count: null,
        params: relaxed,
      });
    }

    // 2. Location expansion: widen bounds by 50%
    const minLat = params.get("minLat");
    const maxLat = params.get("maxLat");
    const minLng = params.get("minLng");
    const maxLng = params.get("maxLng");
    if (minLat && maxLat && minLng && maxLng) {
      const latSpan = Number(maxLat) - Number(minLat);
      const lngSpan = Number(maxLng) - Number(minLng);
      const relaxed = new URLSearchParams(params);
      relaxed.set("minLat", String(Number(minLat) - latSpan * 0.25));
      relaxed.set("maxLat", String(Number(maxLat) + latSpan * 0.25));
      relaxed.set("minLng", String(Number(minLng) - lngSpan * 0.25));
      relaxed.set("maxLng", String(Number(maxLng) + lngSpan * 0.25));
      candidates.push({
        type: "location",
        label: "in a wider area",
        count: null,
        params: relaxed,
      });
    }

    // 3. Date flexibility: +30 days
    const moveInDate = params.get("moveInDate");
    if (moveInDate) {
      const d = new Date(moveInDate);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + 30);
        const relaxed = new URLSearchParams(params);
        relaxed.set("moveInDate", d.toISOString().split("T")[0]);
        candidates.push({
          type: "date",
          label: "if flexible on move-in date",
          count: null,
          params: relaxed,
        });
      }
    }

    if (candidates.length === 0) {
      setLoading(false);
      return;
    }

    // Fetch counts in parallel with a short delay
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const results = await Promise.allSettled(
          candidates.map((c) =>
            fetch(`/api/search-count?${c.params.toString()}`, {
              signal: controller.signal,
            }).then((r) => r.json())
          )
        );

        if (controller.signal.aborted) return;

        const withCounts: Suggestion[] = [];
        for (let i = 0; i < candidates.length; i++) {
          const result = results[i];
          if (result.status === "fulfilled") {
            const delta =
              (result.value.count ?? 101) - currentCount;
            if (delta > 0) {
              withCounts.push({ ...candidates[i], count: delta });
            }
          }
        }

        setSuggestions(withCounts);
      } catch {
        // Silently fail — suggestions are supplementary
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchParamsString, currentCount]);

  if (!loading && suggestions.length === 0) return null;

  return (
    <div className="mt-8 mb-4">
      <p className="text-sm text-on-surface-variant mb-3 font-medium">
        Expand your search
      </p>
      <div className="flex flex-col gap-2">
        {loading
          ? // Skeleton placeholders
            Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 border border-dashed border-outline-variant rounded-xl"
              >
                <div className="w-9 h-9 rounded-full bg-surface-container-high animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
                <div className="h-4 w-48 rounded bg-surface-container-high animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
              </div>
            ))
          : suggestions.map((suggestion) => {
              const Icon = ICONS[suggestion.type];
              return (
                <button
                  key={suggestion.type}
                  type="button"
                  onClick={() => {
                    router.push(
                      `/search?${suggestion.params.toString()}`
                    );
                  }}
                  className="flex items-center gap-3 px-4 py-3 border border-dashed border-outline-variant rounded-xl text-left transition-all hover:border-primary hover:border-solid hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/[0.08] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm">
                    <strong className="font-semibold text-primary">
                      +{suggestion.count} room
                      {suggestion.count !== 1 ? "s" : ""}
                    </strong>{" "}
                    {suggestion.label}
                  </span>
                </button>
              );
            })}
      </div>
    </div>
  );
}
