"use client";

import { MapPin, Clock, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRecentSearches } from "@/hooks/useRecentSearches";

/**
 * Hardcoded popular areas for MVP.
 * TODO: Replace with DB-driven popular areas when available.
 */
const POPULAR_AREAS = [
  { label: "Austin, TX", q: "Austin, TX", lat: 30.2672, lng: -97.7431 },
  { label: "San Francisco, CA", q: "San Francisco, CA", lat: 37.7749, lng: -122.4194 },
  { label: "New York, NY", q: "New York, NY", lat: 40.7128, lng: -74.0060 },
  { label: "Los Angeles, CA", q: "Los Angeles, CA", lat: 34.0522, lng: -118.2437 },
  { label: "Chicago, IL", q: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
  { label: "Seattle, WA", q: "Seattle, WA", lat: 47.6062, lng: -122.3321 },
  { label: "Denver, CO", q: "Denver, CO", lat: 39.7392, lng: -104.9903 },
  { label: "Portland, OR", q: "Portland, OR", lat: 45.5152, lng: -122.6784 },
];

/**
 * Shows suggested searches when there's no active query.
 * Displays recent searches if available, otherwise popular areas.
 */
export default function SuggestedSearches() {
  const { recentSearches } = useRecentSearches();

  if (recentSearches.length > 0) {
    return (
      <div className="py-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Recent searches
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {recentSearches.map((search) => (
            <Link
              key={search.location}
              href={`/search?q=${encodeURIComponent(search.location)}${
                search.coords ? `&lat=${search.coords.lat}&lng=${search.coords.lng}` : ''
              }`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 text-zinc-400" />
              {search.location}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-zinc-400" />
        <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Popular areas
        </h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {POPULAR_AREAS.map((area) => (
          <Link
            key={area.q}
            href={`/search?q=${encodeURIComponent(area.q)}&lat=${area.lat}&lng=${area.lng}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-zinc-400" />
            {area.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
