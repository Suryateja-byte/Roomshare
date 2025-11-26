import { Skeleton, TextSkeleton, CardSkeleton } from "./Skeleton";

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-50 " aria-busy="true" aria-label="Loading page content">
      {/* Header skeleton */}
      <header className="border-b border-zinc-200 bg-white px-4 py-3 ">
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
      <main className="mx-auto max-w-7xl px-4 py-8">
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
      </main>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-50 " aria-busy="true" aria-label="Loading dashboard">
      {/* Sidebar skeleton */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 border-r border-zinc-200 bg-white p-4 lg:block">
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
        <header className="border-b border-zinc-200 bg-white px-6 py-4 ">
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
              className="rounded-lg border border-zinc-200 bg-white p-4 "
            >
              <Skeleton variant="text" width={80} height={14} className="mb-2" />
              <Skeleton variant="text" width={120} height={32} />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="mx-6 rounded-lg border border-zinc-200 bg-white ">
          <div className="border-b border-zinc-200 p-4 ">
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
    <div className="mx-auto max-w-2xl p-6" aria-busy="true" aria-label="Loading profile">
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
          <section key={i} className="rounded-lg border border-zinc-200 bg-white p-4 ">
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
    <div className="mx-auto max-w-md p-6" aria-busy="true" aria-label="Loading form">
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
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden ">
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
