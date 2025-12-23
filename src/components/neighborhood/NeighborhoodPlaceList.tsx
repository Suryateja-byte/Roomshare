'use client';

/**
 * NeighborhoodPlaceList - Custom POI list for Pro users
 *
 * Displays places with:
 * - Place name and type
 * - Distance in miles
 * - Estimated walking time
 * - Rating and "Open now" badge
 * - Hover/click interactions for map sync
 */

import { useCallback, useRef, KeyboardEvent } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistance } from '@/lib/geo/distance';
import type { POI } from '@/lib/places/types';

interface NeighborhoodPlaceListProps {
  /** Array of POIs to display */
  pois: POI[];
  /** Currently selected place ID */
  selectedPlaceId?: string | null;
  /** Currently hovered place ID */
  hoveredPlaceId?: string | null;
  /** Callback when place is clicked */
  onPlaceClick?: (poi: POI) => void;
  /** Callback when place is hovered */
  onPlaceHover?: (poi: POI | null) => void;
  /** Loading state */
  isLoading?: boolean;
  /** Optional class name */
  className?: string;
}

export function NeighborhoodPlaceList({
  pois,
  selectedPlaceId,
  hoveredPlaceId,
  onPlaceClick,
  onPlaceHover,
  isLoading,
  className = '',
}: NeighborhoodPlaceListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const handlePlaceClick = useCallback(
    (poi: POI) => {
      onPlaceClick?.(poi);
    },
    [onPlaceClick]
  );

  const handleMouseEnter = useCallback(
    (poi: POI) => {
      onPlaceHover?.(poi);
    },
    [onPlaceHover]
  );

  const handleMouseLeave = useCallback(() => {
    onPlaceHover?.(null);
  }, [onPlaceHover]);

  // Handle arrow key navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, currentIndex: number) => {
      if (!listRef.current) return;

      const cards = listRef.current.querySelectorAll<HTMLElement>('[role="option"]');
      let nextIndex = currentIndex;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          nextIndex = Math.min(currentIndex + 1, pois.length - 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          nextIndex = Math.max(currentIndex - 1, 0);
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = pois.length - 1;
          break;
        default:
          return;
      }

      if (nextIndex !== currentIndex && cards[nextIndex]) {
        cards[nextIndex].focus();
        onPlaceHover?.(pois[nextIndex]);
      }
    },
    [pois, onPlaceHover]
  );

  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`} role="status" aria-label="Loading places">
        {[...Array(3)].map((_, i) => (
          <PlaceCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (pois.length === 0) {
    return (
      <div className={`text-center py-8 text-muted-foreground ${className}`}>
        <p>No places found in this area.</p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className={`space-y-2 ${className}`}
      role="listbox"
      aria-label="Nearby places"
      aria-activedescendant={selectedPlaceId ? `place-${selectedPlaceId}` : undefined}
    >
      {pois.map((poi, index) => (
        <PlaceCard
          key={poi.placeId}
          poi={poi}
          index={index}
          isSelected={selectedPlaceId === poi.placeId}
          isHovered={hoveredPlaceId === poi.placeId}
          onClick={() => handlePlaceClick(poi)}
          onMouseEnter={() => handleMouseEnter(poi)}
          onMouseLeave={handleMouseLeave}
          onKeyDown={(e) => handleKeyDown(e, index)}
        />
      ))}
    </div>
  );
}

interface PlaceCardProps {
  poi: POI;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

function PlaceCard({
  poi,
  index,
  isSelected,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onKeyDown,
}: PlaceCardProps) {
  const {
    name,
    primaryType,
    distanceMiles,
    walkMins,
    rating,
    userRatingsTotal,
    openNow,
    address,
  } = poi;

  // Format the primary type for display
  const formattedType = primaryType
    ? primaryType
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <Card
      className={`
        cursor-pointer transition-all duration-150
        ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}
        ${isHovered && !isSelected ? 'bg-muted/50' : ''}
        hover:bg-muted/50
      `}
      role="option"
      id={`place-${poi.placeId}`}
      tabIndex={0}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        } else {
          onKeyDown(e);
        }
      }}
      aria-selected={isSelected}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          {/* Left: Place info */}
          <div className="flex-1 min-w-0">
            {/* Name */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">
                {index + 1}.
              </span>
              <h4 className="font-medium text-sm truncate" title={name}>
                {name}
              </h4>
            </div>

            {/* Type and badges */}
            <div className="flex items-center gap-2 mt-1 ml-7">
              {formattedType && (
                <span className="text-xs text-muted-foreground truncate">
                  {formattedType}
                </span>
              )}
              {openNow && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">
                  Open
                </Badge>
              )}
            </div>

            {/* Rating */}
            {rating && (
              <div className="flex items-center gap-1 mt-1 ml-7">
                <StarIcon className="h-3 w-3 text-yellow-500" />
                <span className="text-xs text-muted-foreground">
                  {rating.toFixed(1)}
                  {userRatingsTotal && (
                    <span className="opacity-70"> ({formatRatingCount(userRatingsTotal)})</span>
                  )}
                </span>
              </div>
            )}

            {/* Address (truncated) */}
            {address && (
              <p className="text-xs text-muted-foreground/70 truncate mt-1 ml-7" title={address}>
                {address}
              </p>
            )}
          </div>

          {/* Right: Distance info */}
          <div className="text-right shrink-0">
            {distanceMiles !== undefined && (
              <div className="font-medium text-sm">
                {formatDistance(distanceMiles)}
              </div>
            )}
            {walkMins !== undefined && (
              <div className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                <WalkIcon className="h-3 w-3" />
                ~{walkMins} min
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PlaceCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-muted rounded" />
              <div className="h-4 w-32 bg-muted rounded" />
            </div>
            <div className="h-3 w-20 bg-muted rounded mt-2 ml-6" />
          </div>
          <div className="text-right">
            <div className="h-4 w-12 bg-muted rounded" />
            <div className="h-3 w-16 bg-muted rounded mt-1" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatRatingCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function WalkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="2" />
      <path d="M10 22V14l-2-2v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3l-2 2v8" />
    </svg>
  );
}

export default NeighborhoodPlaceList;
