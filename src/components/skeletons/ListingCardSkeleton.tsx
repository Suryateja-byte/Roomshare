import { Skeleton } from "./Skeleton";

/**
 * Skeleton for ListingCard - dimensions must match ListingCard.tsx exactly to prevent CLS.
 *
 * CLS-critical dimensions (sync with ListingCard.tsx):
 * - Card shell: rounded-2xl with shadow-sm and no visible border
 * - Image: aspect-[4/3]
 * - Title row: mb-0.5
 * - Content padding: p-4
 * - Overlay actions: top-right controls + top-left badges reserve the same footprint
 */
export function ListingCardSkeleton() {
  return (
    <div
      data-testid="listing-card-skeleton"
      className="group relative mb-4 flex flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm"
      aria-hidden="true"
      role="presentation"
    >
      <div className="relative overflow-hidden aspect-[4/3] bg-surface-canvas">
        <Skeleton
          variant="rectangular"
          animation="shimmer"
          className="h-full w-full"
        />

        <div className="absolute z-20 top-3 right-3 flex items-center gap-1.5">
          <Skeleton
            variant="circular"
            animation="shimmer"
            width={32}
            height={32}
          />
          <Skeleton
            variant="circular"
            animation="shimmer"
            width={40}
            height={40}
          />
        </div>

        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          <Skeleton
            variant="rounded"
            animation="shimmer"
            width={116}
            height={28}
            className="rounded-md"
          />
          <Skeleton
            variant="rounded"
            animation="shimmer"
            width={72}
            height={24}
            className="rounded-md"
          />
        </div>

        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
          <Skeleton
            variant="rounded"
            animation="shimmer"
            width={34}
            height={10}
            className="rounded-full"
          />
          <Skeleton
            variant="circular"
            animation="shimmer"
            width={10}
            height={10}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <div className="flex items-baseline gap-2">
            <Skeleton variant="text" animation="shimmer" width={104} height={28} />
            <Skeleton variant="text" animation="shimmer" width={28} height={14} />
          </div>
          <Skeleton variant="text" animation="shimmer" width={54} height={18} />
        </div>

        <Skeleton
          variant="text"
          animation="shimmer"
          width="78%"
          height={18}
          className="mb-0.5"
        />
        <Skeleton variant="text" animation="shimmer" width="56%" height={16} />
      </div>
    </div>
  );
}

export function SearchResultsBodySkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      data-testid="search-results-body-skeleton"
      className="space-y-4"
      aria-hidden="true"
      role="presentation"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton
            variant="text"
            animation="shimmer"
            width={164}
            height={14}
            className="rounded-full"
          />
          <Skeleton variant="text" animation="shimmer" width={128} height={12} />
        </div>
        <Skeleton
          variant="rounded"
          animation="shimmer"
          width={112}
          height={36}
          className="rounded-full"
        />
      </div>

      <ListingGridSkeleton count={count} />
    </div>
  );
}

export function ListingGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      data-testid="listing-card-skeleton-grid"
      className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-x-6 sm:gap-y-9"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}
