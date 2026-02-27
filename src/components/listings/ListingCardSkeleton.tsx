/**
 * ListingCardSkeleton — Shimmer loading placeholder matching ListingCard layout.
 * Use inside Suspense boundaries or during initial search load.
 */
export function ListingCardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 animate-pulse">
      {/* Image area — matches ListingCard aspect-[16/10] sm:aspect-[4/3] */}
      <div className="relative aspect-[16/10] sm:aspect-[4/3] bg-zinc-200 dark:bg-zinc-800">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-zinc-300/50 dark:via-zinc-700/50 to-transparent bg-[length:200%_100%] animate-shimmer" />
        {/* Badge placeholder */}
        <div className="absolute top-3 left-3 w-16 h-5 rounded-md bg-zinc-300 dark:bg-zinc-700" />
      </div>

      {/* Content area — matches min-h-[156px] of ListingCard */}
      <div className="p-3 sm:p-4 min-h-[156px] flex flex-col">
        {/* Title + rating row */}
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-10 rounded bg-zinc-200 dark:bg-zinc-800 shrink-0" />
        </div>

        {/* Location */}
        <div className="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800 mb-3" />

        {/* Amenity pills */}
        <div className="flex gap-1.5 mb-2">
          <div className="h-5 w-14 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-12 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>

        {/* Spacer to push price to bottom */}
        <div className="flex-1" />

        {/* Price */}
        <div className="h-6 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
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
