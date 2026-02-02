"use client";

import { MapPin, Clock, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRecentSearches } from "@/hooks/useRecentSearches";

/**
 * Hardcoded popular areas for MVP.
 * TODO: Replace with DB-driven popular areas when available.
 */
const POPULAR_AREAS = [
  { label: "Austin, TX", q: "Austin, TX" },
  { label: "San Francisco, CA", q: "San Francisco, CA" },
  { label: "New York, NY", q: "New York, NY" },
  { label: "Los Angeles, CA", q: "Los Angeles, CA" },
  { label: "Chicago, IL", q: "Chicago, IL" },
  { label: "Seattle, WA", q: "Seattle, WA" },
  { label: "Denver, CO", q: "Denver, CO" },
  { label: "Portland, OR", q: "Portland, OR" },
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
              href={`/search?q=${encodeURIComponent(search.location)}`}
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
            href={`/search?q=${encodeURIComponent(area.q)}`}
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
