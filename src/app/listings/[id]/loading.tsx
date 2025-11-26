// import { Skeleton } from "@/components/ui/skeleton";

// Simple Skeleton component since we don't have it in ui folder yet
function SimpleSkeleton({ className }: { className?: string }) {
    return <div className={`animate-pulse bg-muted rounded-xl ${className}`} />;
}

export default function ListingLoading() {
    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Hero Gallery Skeleton */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[400px] md:h-[500px] rounded-3xl overflow-hidden">
                    <div className="md:col-span-2 h-full relative">
                        <SimpleSkeleton className="w-full h-full" />
                    </div>
                    <div className="hidden md:grid grid-cols-2 gap-4 col-span-2 h-full">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="relative">
                                <SimpleSkeleton className="w-full h-full" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col lg:flex-row gap-12">
                    {/* Main Content Skeleton */}
                    <div className="flex-1">
                        {/* Header */}
                        <div className="mb-8">
                            <div className="flex justify-between items-start">
                                <div className="space-y-4 w-full">
                                    <SimpleSkeleton className="h-10 w-3/4" />
                                    <SimpleSkeleton className="h-5 w-1/3" />
                                </div>
                                <div className="flex gap-2">
                                    <SimpleSkeleton className="h-10 w-10 rounded-full" />
                                    <SimpleSkeleton className="h-10 w-10 rounded-full" />
                                </div>
                            </div>
                        </div>

                        {/* Stats Bar */}
                        <div className="flex flex-wrap gap-6 py-6 border-y border-border/50 mb-8">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <SimpleSkeleton className="h-10 w-10 rounded-full" />
                                    <div className="space-y-2">
                                        <SimpleSkeleton className="h-4 w-20" />
                                        <SimpleSkeleton className="h-3 w-16" />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Description */}
                        <div className="mb-10 space-y-4">
                            <SimpleSkeleton className="h-8 w-40 mb-4" />
                            <SimpleSkeleton className="h-4 w-full" />
                            <SimpleSkeleton className="h-4 w-full" />
                            <SimpleSkeleton className="h-4 w-5/6" />
                            <SimpleSkeleton className="h-4 w-4/6" />
                        </div>

                        {/* Amenities */}
                        <div className="mb-10">
                            <SimpleSkeleton className="h-8 w-48 mb-6" />
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {[...Array(6)].map((_, i) => (
                                    <SimpleSkeleton key={i} className="h-12 w-full" />
                                ))}
                            </div>
                        </div>

                        {/* Host Info */}
                        <div className="mb-10 p-6 bg-muted/30 rounded-2xl border border-border/50">
                            <div className="flex items-center gap-4 mb-4">
                                <SimpleSkeleton className="h-16 w-16 rounded-full" />
                                <div className="space-y-2">
                                    <SimpleSkeleton className="h-6 w-40" />
                                    <SimpleSkeleton className="h-4 w-24" />
                                </div>
                            </div>
                            <SimpleSkeleton className="h-20 w-full mb-4" />
                            <SimpleSkeleton className="h-10 w-32" />
                        </div>
                    </div>

                    {/* Sidebar Skeleton */}
                    <div className="lg:w-[380px]">
                        <div className="sticky top-24">
                            <div className="bg-white rounded-2xl shadow-lg border border-border/50 p-6 space-y-6">
                                <div className="flex justify-between items-end">
                                    <SimpleSkeleton className="h-10 w-32" />
                                    <SimpleSkeleton className="h-5 w-24" />
                                </div>

                                <div className="space-y-4">
                                    <SimpleSkeleton className="h-14 w-full" />
                                    <SimpleSkeleton className="h-14 w-full" />
                                </div>

                                <SimpleSkeleton className="h-12 w-full rounded-xl" />
                                <SimpleSkeleton className="h-4 w-48 mx-auto" />

                                <div className="pt-6 border-t border-border/50 space-y-3">
                                    <div className="flex justify-between">
                                        <SimpleSkeleton className="h-4 w-20" />
                                        <SimpleSkeleton className="h-4 w-16" />
                                    </div>
                                    <div className="flex justify-between">
                                        <SimpleSkeleton className="h-4 w-20" />
                                        <SimpleSkeleton className="h-4 w-16" />
                                    </div>
                                    <div className="flex justify-between pt-3 border-t border-border/50">
                                        <SimpleSkeleton className="h-6 w-16" />
                                        <SimpleSkeleton className="h-6 w-20" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
