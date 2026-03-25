/**
 * ListingCardSkeleton — Shimmer loading placeholder matching ListingCard layout.
 * Use inside Suspense boundaries or during initial search load.
 */
export function ListingCardSkeleton() {
  return (
    <div className="rounded-lg shadow-ambient-sm overflow-hidden bg-surface-container-lowest">
      {/* Image area — matches ListingCard aspect-[16/10] sm:aspect-[4/3] */}
      <div className="relative aspect-[16/10] sm:aspect-[4/3] bg-surface-container-high animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]">
        <div />
        {/* Badge placeholder */}
        <div className="absolute top-3 left-3 w-16 h-5 rounded-lg bg-surface-container-high" />
      </div>

      {/* Content area — matches min-h-[156px] of ListingCard */}
      <div className="p-3 sm:p-4 min-h-[156px] flex flex-col">
        {/* Title + rating row */}
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="h-4 w-3/4 rounded bg-surface-container-high" />
          <div className="h-4 w-10 rounded bg-surface-container-high shrink-0" />
        </div>

        {/* Location */}
        <div className="h-3 w-1/2 rounded bg-surface-container-high mb-3" />

        {/* Amenity pills */}
        <div className="flex gap-1.5 mb-2">
          <div className="h-5 w-14 rounded bg-surface-container-high" />
          <div className="h-5 w-16 rounded bg-surface-container-high" />
          <div className="h-5 w-12 rounded bg-surface-container-high" />
        </div>

        {/* Spacer to push price to bottom */}
        <div className="flex-1" />

        {/* Price */}
        <div className="h-6 w-24 rounded bg-surface-container-high" />
      </div>
    </div>
  );
}

/**
 * ListingCardSkeletonGrid — Grid of 12 skeleton cards for initial load state.
 */
export function ListingCardSkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
      {Array.from({ length: count }, (_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default ListingCardSkeleton;
