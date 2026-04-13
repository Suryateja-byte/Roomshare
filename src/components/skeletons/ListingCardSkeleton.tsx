import { Skeleton } from "./Skeleton";

/**
 * Skeleton for ListingCard - dimensions must match ListingCard.tsx exactly to prevent CLS.
 *
 * CLS-critical dimensions (sync with ListingCard.tsx):
 * - Card shell: rounded-2xl with shadow-ambient-sm and no visible border
 * - Image: aspect-[4/3]
 * - Title row: mb-0.5
 * - Content padding: p-4
 * - Overlay actions: top-right controls + top-left badges reserve the same footprint
 */
export function ListingCardSkeleton() {
  return (
    <div
      data-testid="listing-card-skeleton"
      className="group relative flex flex-col rounded-2xl bg-surface-container-lowest mb-4 shadow-ambient-sm overflow-hidden"
      aria-hidden="true"
      role="presentation"
    >
      <div className="relative overflow-hidden aspect-[4/3] bg-surface-canvas">
        <Skeleton variant="rectangular" className="h-full w-full" />

        <div className="absolute z-20 top-3 right-3 flex items-center gap-1.5">
          <Skeleton variant="circular" width={32} height={32} />
          <Skeleton variant="circular" width={40} height={40} />
        </div>

        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          <Skeleton
            variant="rounded"
            width={116}
            height={28}
            className="rounded-md"
          />
          <Skeleton
            variant="rounded"
            width={72}
            height={24}
            className="rounded-md"
          />
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <div className="flex items-baseline gap-2">
            <Skeleton variant="text" width={96} height={28} />
            <Skeleton variant="text" width={26} height={14} />
          </div>
          <Skeleton variant="text" width={52} height={18} />
        </div>

        <Skeleton variant="text" width="72%" height={18} className="mb-0.5" />
        <Skeleton variant="text" width="58%" height={16} />
      </div>
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
