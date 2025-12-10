import { Skeleton } from "@/components/skeletons/Skeleton";

export default function Loading() {
    return (
        <div className="min-h-screen bg-background py-12" aria-busy="true" aria-label="Loading edit listing form">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-8">
                    <Skeleton variant="text" width={200} height={36} className="mb-2" />
                    <Skeleton variant="text" width={250} height={20} />
                </div>

                {/* Draft Banner Placeholder */}
                <Skeleton variant="rounded" height={48} className="mb-6" />

                {/* Form Card */}
                <div className="bg-card rounded-lg border border-border p-6 space-y-8">
                    {/* Basic Info Section */}
                    <div className="space-y-4">
                        <Skeleton variant="text" width={120} height={24} className="mb-4" />
                        {/* Title */}
                        <div>
                            <Skeleton variant="text" width={80} height={16} className="mb-2" />
                            <Skeleton variant="rounded" height={40} />
                        </div>
                        {/* Description */}
                        <div>
                            <Skeleton variant="text" width={100} height={16} className="mb-2" />
                            <Skeleton variant="rounded" height={120} />
                        </div>
                    </div>

                    {/* Pricing Section */}
                    <div className="space-y-4 border-t border-border pt-6">
                        <Skeleton variant="text" width={100} height={24} className="mb-4" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Skeleton variant="text" width={120} height={16} className="mb-2" />
                                <Skeleton variant="rounded" height={40} />
                            </div>
                            <div>
                                <Skeleton variant="text" width={140} height={16} className="mb-2" />
                                <Skeleton variant="rounded" height={40} />
                            </div>
                        </div>
                    </div>

                    {/* Photos Section */}
                    <div className="space-y-4 border-t border-border pt-6">
                        <Skeleton variant="text" width={80} height={24} className="mb-4" />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} variant="rounded" className="aspect-square" />
                            ))}
                        </div>
                        <Skeleton variant="rounded" height={100} />
                    </div>

                    {/* Amenities Section */}
                    <div className="space-y-4 border-t border-border pt-6">
                        <Skeleton variant="text" width={100} height={24} className="mb-4" />
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {Array.from({ length: 9 }).map((_, i) => (
                                <Skeleton key={i} variant="rounded" height={40} />
                            ))}
                        </div>
                    </div>

                    {/* Location Section */}
                    <div className="space-y-4 border-t border-border pt-6">
                        <Skeleton variant="text" width={80} height={24} className="mb-4" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Skeleton variant="text" width={80} height={16} className="mb-2" />
                                <Skeleton variant="rounded" height={40} />
                            </div>
                            <div>
                                <Skeleton variant="text" width={60} height={16} className="mb-2" />
                                <Skeleton variant="rounded" height={40} />
                            </div>
                        </div>
                        <div>
                            <Skeleton variant="text" width={100} height={16} className="mb-2" />
                            <Skeleton variant="rounded" height={40} />
                        </div>
                    </div>

                    {/* Submit Buttons */}
                    <div className="flex gap-4 pt-6 border-t border-border">
                        <Skeleton variant="rounded" width={120} height={44} />
                        <Skeleton variant="rounded" height={44} className="flex-1" />
                    </div>
                </div>
            </div>
        </div>
    );
}
