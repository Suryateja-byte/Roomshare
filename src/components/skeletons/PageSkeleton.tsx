import { Skeleton, TextSkeleton, CardSkeleton } from "./Skeleton";

export function PageSkeleton() {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading page content"
    >
      {/* Header skeleton */}
      <header className="border-b border-outline-variant/20 bg-surface-container-lowest px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Skeleton variant="rounded" width={120} height={32} />
          <div className="flex items-center gap-4">
            <Skeleton variant="text" width={80} />
            <Skeleton variant="text" width={80} />
            <Skeleton variant="circular" width={36} height={36} />
          </div>
        </div>
      </header>

      {/* Main content skeleton */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Title section */}
        <div className="mb-8">
          <Skeleton variant="text" width={300} height={32} className="mb-2" />
          <Skeleton variant="text" width={400} height={20} />
        </div>

        {/* Content grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      {/* Sidebar skeleton */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 border-r border-outline-variant/20 bg-surface-container-lowest p-4 lg:block">
        <Skeleton variant="rounded" width={140} height={32} className="mb-8" />
        <nav className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={40} />
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="border-b border-outline-variant/20 bg-surface-container-lowest px-6 py-4">
          <div className="flex items-center justify-between">
            <Skeleton variant="text" width={200} height={28} />
            <div className="flex items-center gap-4">
              <Skeleton variant="rounded" width={200} height={36} />
              <Skeleton variant="circular" width={36} height={36} />
            </div>
          </div>
        </header>

        {/* Stats row */}
        <div className="grid gap-4 p-6 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4"
            >
              <Skeleton
                variant="text"
                width={80}
                height={14}
                className="mb-2"
              />
              <Skeleton variant="text" width={120} height={32} />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="mx-6 rounded-lg border border-outline-variant/20 bg-surface-container-lowest">
          <div className="border-b border-outline-variant/20 p-4">
            <Skeleton variant="text" width={150} height={24} />
          </div>
          <div className="p-4">
            <TextSkeleton lines={8} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div
      className="mx-auto max-w-2xl p-6"
      aria-busy="true"
      aria-label="Loading profile"
    >
      {/* Profile header */}
      <div className="mb-8 flex items-center gap-6">
        <Skeleton variant="circular" width={96} height={96} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width={200} height={28} />
          <Skeleton variant="text" width={150} height={18} />
          <Skeleton variant="text" width={100} height={14} />
        </div>
      </div>

      {/* Profile sections */}
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <section
            key={i}
            className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4"
          >
            <Skeleton variant="text" width={120} height={20} className="mb-4" />
            <TextSkeleton lines={4} />
          </section>
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div
      className="mx-auto max-w-md p-6"
      aria-busy="true"
      aria-label="Loading form"
    >
      <Skeleton variant="text" width={200} height={28} className="mb-6" />

      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton variant="text" width={100} height={14} className="mb-2" />
            <Skeleton variant="rounded" height={40} />
          </div>
        ))}

        <Skeleton variant="rounded" height={44} className="mt-6" />
      </div>
    </div>
  );
}

export function ListingSkeleton() {
  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest overflow-hidden">
      <Skeleton variant="rectangular" height={200} />
      <div className="p-4 space-y-3">
        <Skeleton variant="text" width="80%" height={20} />
        <Skeleton variant="text" width="60%" height={16} />
        <div className="flex justify-between items-center pt-2">
          <Skeleton variant="text" width={80} height={24} />
          <Skeleton variant="rounded" width={100} height={32} />
        </div>
      </div>
    </div>
  );
}

export function ListingGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading listings"
    >
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8">
          <Skeleton variant="text" width={250} height={32} className="mb-2" />
          <Skeleton variant="text" width={180} height={18} />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: count }).map((_, i) => (
            <ListingSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchLoadingFilterStrip() {
  return (
    <div
      className="hide-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto border-b border-outline-variant/20 px-1 py-3"
      aria-hidden="true"
      role="presentation"
    >
      <Skeleton
        variant="text"
        width={72}
        height={16}
        animation="shimmer"
        className="hidden shrink-0 md:block motion-reduce:animate-none"
      />
      {[116, 132, 148, 124].map((width) => (
        <Skeleton
          key={width}
          variant="rounded"
          width={width}
          height={42}
          animation="shimmer"
          className="shrink-0 rounded-full border border-outline-variant/20 bg-surface-container-lowest motion-reduce:animate-none"
        />
      ))}
      <Skeleton
        variant="rounded"
        width={104}
        height={42}
        animation="shimmer"
        className="shrink-0 rounded-full border border-outline-variant/20 bg-surface-container-lowest motion-reduce:animate-none"
      />
    </div>
  );
}

function SearchLoadingListingRow({ index }: { index: number }) {
  const titleWidths = ["78%", "68%", "74%", "62%"];
  const bodyWidths = ["92%", "84%", "88%", "78%"];

  return (
    <div
      data-testid="search-loading-listing-row"
      className="relative flex flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ambient-sm md:overflow-visible md:bg-transparent md:p-1 md:shadow-none"
      aria-hidden="true"
      role="presentation"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-container-high/50 md:aspect-[16/7] md:rounded-xl">
        <Skeleton
          variant="rectangular"
          animation="shimmer"
          className="h-full w-full bg-gradient-to-br from-surface-container-high via-surface-canvas to-surface-container-high motion-reduce:animate-none"
        />
        <div className="absolute inset-0 flex items-center justify-center text-outline-variant/70">
          <div className="h-9 w-9 rounded-lg border-2 border-current opacity-45" />
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <Skeleton
            variant="circular"
            width={32}
            height={32}
            animation="shimmer"
            className="bg-surface-container-lowest/85 motion-reduce:animate-none"
          />
          <Skeleton
            variant="circular"
            width={40}
            height={40}
            animation="shimmer"
            className="bg-surface-container-lowest/85 motion-reduce:animate-none"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 md:min-w-0 md:p-1 md:py-1.5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <Skeleton
              variant="text"
              width={96}
              height={28}
              animation="shimmer"
              className="motion-reduce:animate-none"
            />
            <Skeleton
              variant="text"
              width={28}
              height={14}
              animation="shimmer"
              className="motion-reduce:animate-none"
            />
          </div>
          <Skeleton
            variant="text"
            width={52}
            height={18}
            animation="shimmer"
            className="motion-reduce:animate-none"
          />
        </div>

        <Skeleton
          variant="text"
          width={titleWidths[index % titleWidths.length]}
          height={18}
          animation="shimmer"
          className="mb-2 motion-reduce:animate-none"
        />
        <Skeleton
          variant="text"
          width={bodyWidths[index % bodyWidths.length]}
          height={14}
          animation="shimmer"
          className="mb-2 motion-reduce:animate-none"
        />
        <Skeleton
          variant="text"
          width="58%"
          height={14}
          animation="shimmer"
          className="motion-reduce:animate-none"
        />

        <div className="mt-4 hidden items-center gap-2 md:flex">
          <Skeleton
            variant="rounded"
            width={92}
            height={22}
            animation="shimmer"
            className="rounded-full motion-reduce:animate-none"
          />
          <Skeleton
            variant="rounded"
            width={78}
            height={22}
            animation="shimmer"
            className="rounded-full motion-reduce:animate-none"
          />
        </div>
      </div>
    </div>
  );
}

export function SearchResultsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section
      data-testid="search-page-loading-skeleton"
      className="min-h-full bg-surface-canvas"
      role="status"
      aria-busy="true"
      aria-label="Loading search results"
    >
      <span className="sr-only">Loading search results</span>
      <div className="mx-auto max-w-[1180px] pb-24 md:pb-6">
        <div className="px-4 pt-0 sm:px-5 lg:px-8">
          <div className="border-b border-outline-variant/25 px-1 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3">
                  <Skeleton
                    variant="text"
                    width={210}
                    height={28}
                    animation="shimmer"
                    className="mb-1"
                  />
                  <Skeleton
                    variant="rounded"
                    width={64}
                    height={24}
                    animation="shimmer"
                    className="rounded-full"
                  />
                </div>
                <Skeleton
                  variant="text"
                  width={190}
                  height={14}
                  animation="shimmer"
                  className="motion-reduce:animate-none"
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Skeleton
                  variant="rounded"
                  width={118}
                  height={44}
                  animation="shimmer"
                  className="rounded-full motion-reduce:animate-none"
                />
                <Skeleton
                  variant="rounded"
                  width={124}
                  height={44}
                  animation="shimmer"
                  className="hidden rounded-full motion-reduce:animate-none sm:block"
                />
              </div>
            </div>
          </div>

          <SearchLoadingFilterStrip />

          <div className="relative py-5">
            <div
              data-testid="search-loading-listing-list"
              className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] xl:gap-5"
            >
              {Array.from({ length: count }).map((_, index) => (
                <SearchLoadingListingRow key={index} index={index} />
              ))}
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface-canvas via-surface-canvas/90 to-transparent"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function MessageListSkeleton() {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading messages"
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <Skeleton variant="text" width={200} height={32} className="mb-2" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/20"
            >
              <Skeleton variant="circular" width={48} height={48} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="40%" height={18} />
                <Skeleton variant="text" width="70%" height={14} />
              </div>
              <Skeleton variant="text" width={60} height={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading chat"
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/20 overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center gap-4 p-4 border-b border-outline-variant/20">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="space-y-1">
              <Skeleton variant="text" width={150} height={18} />
              <Skeleton variant="text" width={100} height={12} />
            </div>
          </div>
          {/* Messages */}
          <div className="p-4 space-y-4 h-96">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
              >
                <Skeleton
                  variant="rounded"
                  width={200 + (i % 3) * 50}
                  height={40}
                />
              </div>
            ))}
          </div>
          {/* Input */}
          <div className="p-4 border-t border-outline-variant/20">
            <Skeleton variant="rounded" height={44} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminTableSkeleton() {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading admin data"
    >
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton variant="text" width={200} height={32} />
          <Skeleton variant="rounded" width={120} height={40} />
        </div>
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/20 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-5 gap-4 p-4 border-b border-outline-variant/20 bg-surface-canvas">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="text" width="80%" height={14} />
            ))}
          </div>
          {/* Table rows */}
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-5 gap-4 p-4 border-b border-outline-variant/20"
            >
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton
                  key={j}
                  variant="text"
                  width={`${60 + j * 10}%`}
                  height={16}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BookingsSkeleton() {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading bookings"
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <Skeleton variant="text" width={180} height={32} className="mb-2" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-4 p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/20"
            >
              <Skeleton variant="rounded" width={120} height={80} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="60%" height={20} />
                <Skeleton variant="text" width="40%" height={14} />
                <Skeleton variant="text" width="30%" height={14} />
              </div>
              <div className="text-right space-y-2">
                <Skeleton variant="text" width={80} height={20} />
                <Skeleton variant="rounded" width={100} height={32} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading settings"
    >
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <Skeleton variant="text" width={150} height={32} />
        </div>
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <section
              key={i}
              className="bg-surface-container-lowest rounded-lg border border-outline-variant/20 p-6"
            >
              <Skeleton
                variant="text"
                width={140}
                height={20}
                className="mb-4"
              />
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Skeleton variant="text" width={120} height={16} />
                      <Skeleton variant="text" width={200} height={12} />
                    </div>
                    <Skeleton variant="rounded" width={44} height={24} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SavedSearchesSkeleton() {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading saved searches"
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <Skeleton variant="text" width={200} height={32} className="mb-2" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/20"
            >
              <div className="space-y-2">
                <Skeleton variant="text" width={180} height={18} />
                <Skeleton variant="text" width={250} height={14} />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton variant="rounded" width={80} height={32} />
                <Skeleton variant="circular" width={32} height={32} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NotificationsSkeleton() {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading notifications"
    >
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <Skeleton variant="text" width={180} height={32} />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/20"
            >
              <Skeleton variant="circular" width={40} height={40} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="80%" height={16} />
                <Skeleton variant="text" width="60%" height={14} />
              </div>
              <Skeleton variant="text" width={50} height={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
