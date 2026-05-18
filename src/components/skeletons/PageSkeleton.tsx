import { Skeleton, TextSkeleton, CardSkeleton } from "./Skeleton";
import { ListingGridSkeleton as SearchListingGridSkeleton } from "./ListingCardSkeleton";

export function PageSkeleton() {
  return (
    <div
      className="min-h-screen bg-surface-canvas"
      aria-busy="true"
      aria-label="Loading page content"
    >
      {/* Header skeleton */}
      <header className="bg-surface-container-lowest/90 px-4 py-3 shadow-ambient-sm">
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
      <aside className="fixed left-0 top-0 hidden h-full w-64 bg-surface-container-high p-4 shadow-ambient-sm lg:block">
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
        <header className="bg-surface-container-lowest/90 px-6 py-4 shadow-ambient-sm">
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
              className="rounded-lg bg-surface-container-lowest p-4 shadow-ambient-sm"
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
        <div className="mx-6 rounded-lg bg-surface-container-lowest p-4 shadow-ambient-sm">
          <div className="rounded-lg bg-surface-canvas p-4">
            <Skeleton variant="text" width={150} height={24} />
          </div>
          <div className="mt-3 p-4">
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
            className="rounded-lg bg-surface-container-lowest p-4 shadow-ambient-sm"
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
    <div className="rounded-lg bg-surface-container-lowest overflow-hidden shadow-ambient-sm">
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

export function SearchResultsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="h-screen flex flex-col bg-surface-container-lowest overflow-hidden pt-[80px] sm:pt-[96px]"
      role="status"
      aria-busy="true"
      aria-label="Loading search results"
    >
      {/* Search Header Skeleton */}
      <header className="w-full bg-surface-container-lowest/80 backdrop-blur-[20px]">
        <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          <Skeleton
            variant="rounded"
            height={56}
            className="w-full max-w-2xl mx-auto"
          />
        </div>
      </header>

      {/* Filter Bar Skeleton */}
      <div className="w-full bg-surface-container-lowest/90 shadow-ambient-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Category tabs skeleton */}
            <div className="flex gap-2">
              <Skeleton variant="rounded" width={70} height={32} />
              <Skeleton variant="rounded" width={90} height={32} />
              <Skeleton variant="rounded" width={80} height={32} />
            </div>
            <div className="hidden w-3 sm:block" />
            <div className="flex-1" />
            {/* More filters button */}
            <Skeleton
              variant="rounded"
              width={110}
              height={36}
              className="rounded-full"
            />
          </div>
        </div>
      </div>

      {/* Results Skeleton */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-[840px] mx-auto pb-24 md:pb-6">
          <div className="px-4 sm:px-5 lg:px-8 pt-0">
            {/* Header */}
            <div className="flex flex-row items-center justify-between gap-4 py-2 mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3">
                  <Skeleton
                    variant="text"
                    width={180}
                    height={24}
                    className="mb-1"
                  />
                  <Skeleton
                    variant="rounded"
                    width={92}
                    height={24}
                    className="rounded-full"
                  />
                </div>
                <Skeleton variant="text" width={220} height={14} />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Skeleton
                  variant="rounded"
                  width={112}
                  height={36}
                  className="rounded-full"
                />
                <Skeleton variant="rounded" width={104} height={36} />
              </div>
            </div>

            {/* Listing Cards Grid */}
            <SearchListingGridSkeleton count={count} />
          </div>
        </div>
      </div>
    </div>
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
              className="flex items-center gap-4 p-4 bg-surface-container-lowest rounded-lg shadow-ambient-sm"
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
        <div className="bg-surface-container-lowest rounded-lg overflow-hidden shadow-ambient-sm">
          {/* Chat header */}
          <div className="flex items-center gap-4 p-4 bg-surface-container-high/70">
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
          <div className="p-4 bg-surface-container-high/70">
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
        <div className="bg-surface-container-lowest rounded-lg p-4 shadow-ambient-sm">
          {/* Table header */}
          <div className="grid grid-cols-5 gap-4 rounded-lg bg-surface-canvas p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="text" width="80%" height={14} />
            ))}
          </div>
          {/* Table rows */}
          <div className="mt-3 space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-5 gap-4 rounded-lg bg-surface-canvas p-4"
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
              className="flex gap-4 p-4 bg-surface-container-lowest rounded-lg shadow-ambient-sm"
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
              className="bg-surface-container-lowest rounded-lg p-6 shadow-ambient-sm"
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
              className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg shadow-ambient-sm"
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
              className="flex items-start gap-3 p-4 bg-surface-container-lowest rounded-lg shadow-ambient-sm"
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
