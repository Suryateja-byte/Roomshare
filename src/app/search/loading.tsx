export default function Loading() {
  return (
    <div
      className="h-screen flex flex-col bg-surface-canvas overflow-hidden pt-[80px] sm:pt-[96px]"
      role="status"
      aria-busy="true"
      aria-label="Loading search results"
    >
      {/* Search Header Skeleton */}
      <header className="w-full bg-surface-container-lowest/80 backdrop-blur-xl">
        <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          <div className="h-14 w-full max-w-2xl mx-auto animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
        </div>
      </header>

      {/* Filter Bar Skeleton */}
      <div className="w-full bg-surface-container-lowest">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <div className="h-8 w-[70px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
              <div className="h-8 w-[90px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
              <div className="h-8 w-[80px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
            </div>
            <div className="h-8 w-px bg-surface-container-high hidden sm:block" />
            <div className="flex-1" />
            <div className="h-9 w-[110px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-full" />
          </div>
        </div>
      </div>

      {/* Results Skeleton */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 sm:px-6 py-4 sm:py-6 max-w-[840px] mx-auto pb-24 md:pb-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <div className="h-6 w-[180px] mb-2 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
              <div className="h-4 w-[220px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-9 w-[100px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
            </div>
          </div>

          {/* Listing Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-surface-container-lowest rounded-xl overflow-hidden"
              >
                {/* Image placeholder */}
                <div className="aspect-[16/10] sm:aspect-[4/3] w-full animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
                {/* Content */}
                <div className="p-3 sm:p-4 flex flex-col min-h-[156px]">
                  <div className="flex justify-between items-start gap-3 mb-0.5">
                    <div className="h-[18px] w-[70%] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
                    <div className="h-4 w-10 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
                  </div>
                  <div className="h-[14px] w-[45%] mb-3 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
                  <div className="flex gap-1.5 mb-2">
                    <div className="h-5 w-[60px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
                    <div className="h-5 w-[50px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
                    <div className="h-5 w-[45px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
                  </div>
                  <div className="flex gap-1.5 mb-4">
                    <div className="h-[14px] w-[14px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-full" />
                    <div className="h-[18px] w-[55px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
                    <div className="h-[18px] w-[45px] animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
                  </div>
                  <div className="mt-auto">
                    <div className="h-6 w-20 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
