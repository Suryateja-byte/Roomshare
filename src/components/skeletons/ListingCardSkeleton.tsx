import { Skeleton } from "./Skeleton";

/**
 * Skeleton for ListingCard - dimensions must match ListingCard.tsx exactly to prevent CLS.
 *
 * CLS-critical dimensions (sync with ListingCard.tsx):
 * - Image: aspect-[16/10] sm:aspect-[4/3]
 * - Content padding: p-3 sm:p-4
 * - Title row: mb-0.5
 * - Location: mb-3
 * - Amenities: mb-2
 * - Languages row: ~24px height, mb-4 (always reserve space)
 * - Price: mt-auto pushed to bottom
 */
export function ListingCardSkeleton() {
    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800 overflow-hidden">
            {/* Image placeholder - matches ListingCard aspect-[16/10] sm:aspect-[4/3] */}
            <Skeleton variant="rectangular" className="aspect-[16/10] sm:aspect-[4/3] w-full" />

            {/* Content - CLS fix: p-3 sm:p-4 matches ListingCard */}
            <div className="p-3 sm:p-4 flex flex-col min-h-[156px]">
                {/* Title and rating - mb-0.5 matches ListingCard */}
                <div className="flex justify-between items-start gap-3 mb-0.5">
                    <Skeleton variant="text" width="70%" height={18} />
                    <Skeleton variant="text" width={40} height={16} />
                </div>

                {/* Location - mb-3 matches ListingCard */}
                <Skeleton variant="text" width="45%" height={14} className="mb-3" />

                {/* Amenities - mb-2 matches ListingCard */}
                <div className="flex gap-1.5 mb-2">
                    <Skeleton variant="rounded" width={60} height={20} />
                    <Skeleton variant="rounded" width={50} height={20} />
                    <Skeleton variant="rounded" width={45} height={20} />
                </div>

                {/* Languages row placeholder - reserves space for conditional section */}
                <div className="flex gap-1.5 mb-4">
                    <Skeleton variant="circular" width={14} height={14} />
                    <Skeleton variant="rounded" width={55} height={18} />
                    <Skeleton variant="rounded" width={45} height={18} />
                </div>

                {/* Price - mt-auto pushes to bottom like ListingCard */}
                <div className="mt-auto">
                    <Skeleton variant="text" width={80} height={24} />
                </div>
            </div>
        </div>
    );
}

export function ListingGridSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
            {Array.from({ length: count }).map((_, i) => (
                <ListingCardSkeleton key={i} />
            ))}
        </div>
    );
}
