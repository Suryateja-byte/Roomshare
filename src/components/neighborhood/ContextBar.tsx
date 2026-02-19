/**
 * ContextBar - Search context display for Neighborhood Intelligence
 *
 * Shows metadata above search results:
 * - Search radius used
 * - Number of results found
 * - Closest and farthest distances
 * - Sort indicator
 *
 * Works for both Free and Pro users.
 */

import { formatDistance } from '@/lib/geo/distance';
import type { SearchMeta } from '@/lib/places/types';

interface ContextBarProps {
  meta: SearchMeta | null;
  isLoading?: boolean;
  queryText?: string;
}

export function ContextBar({ meta, isLoading, queryText }: ContextBarProps) {
  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg animate-pulse"
        role="status"
        aria-label="Loading search results"
      >
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="h-4 w-1 bg-muted-foreground/20 rounded" />
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
    );
  }

  if (!meta) {
    return null;
  }

  const { resultCount, closestMiles, farthestMiles, radiusUsed } = meta;

  // Convert radius from meters to miles for display
  const radiusMiles = radiusUsed / 1609.34;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-muted/50 rounded-lg text-sm text-muted-foreground"
      role="region"
      aria-label="Search results summary"
      aria-live="polite"
    >
      {/* Result count */}
      <span className="font-medium text-foreground">
        {resultCount} {resultCount === 1 ? 'place' : 'places'} found
      </span>

      <span className="text-muted-foreground/40" aria-hidden="true">•</span>

      {/* Search radius */}
      <span>
        Within {radiusMiles.toFixed(1)} mi
      </span>

      {resultCount > 0 && (
        <>
          <span className="text-muted-foreground/40" aria-hidden="true">•</span>

          {/* Distance range */}
          <span>
            {resultCount === 1 ? (
              formatDistance(closestMiles)
            ) : (
              <>
                {formatDistance(closestMiles)} – {formatDistance(farthestMiles)}
              </>
            )}
          </span>

          <span className="text-muted-foreground/40" aria-hidden="true">•</span>

          {/* Sort indicator */}
          <span className="inline-flex items-center gap-1">
            <SortIcon className="h-3.5 w-3.5" />
            Sorted by distance
          </span>
        </>
      )}

      {/* Query text (optional, for debugging/clarity) */}
      {queryText && (
        <>
          <span className="text-muted-foreground/40 hidden sm:inline" aria-hidden="true">•</span>
          <span className="hidden sm:inline text-xs opacity-70" title={`Search: ${queryText}`}>
            "{queryText}"
          </span>
        </>
      )}
    </div>
  );
}

function SortIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M3 5h10M5 8h6M7 11h2" strokeLinecap="round" />
    </svg>
  );
}

export default ContextBar;
