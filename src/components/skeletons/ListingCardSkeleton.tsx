import { Skeleton } from "./Skeleton";

export function ListingCardSkeleton() {
    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800 overflow-hidden">
            {/* Image placeholder */}
            <Skeleton variant="rectangular" className="aspect-[4/3] w-full" />

            {/* Content */}
            <div className="p-4">
                {/* Title and rating */}
                <div className="flex justify-between items-start gap-3 mb-1">
                    <Skeleton variant="text" width="70%" height={18} />
                    <Skeleton variant="text" width={40} height={16} />
                </div>

                {/* Location */}
                <Skeleton variant="text" width="45%" height={14} className="mb-3" />

                {/* Amenities */}
                <div className="flex gap-1.5 mb-4">
                    <Skeleton variant="rounded" width={60} height={20} />
                    <Skeleton variant="rounded" width={50} height={20} />
                    <Skeleton variant="rounded" width={45} height={20} />
                </div>

                {/* Price */}
                <Skeleton variant="text" width={80} height={24} />
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
