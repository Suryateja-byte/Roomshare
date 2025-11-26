"use client";

export default function OfflinePage() {
  return (
    <div
      role="main"
      className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-8 "
    >
      {/* Offline icon */}
      <div className="mb-6 rounded-full bg-zinc-200 p-4 ">
        <svg
          className="h-12 w-12 text-zinc-500 "
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
      </div>

      <h1 className="mb-2 text-2xl font-bold text-zinc-900 ">
        You&apos;re offline
      </h1>

      <p className="mb-8 max-w-md text-center text-zinc-600 ">
        It looks like you&apos;ve lost your internet connection. Some features may be unavailable until you&apos;re back online.
      </p>

      <div className="flex flex-col items-center gap-4">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 "
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Try again
        </button>

        <p className="text-sm text-zinc-500 ">
          We&apos;ll automatically reconnect when you&apos;re back online.
        </p>
      </div>
    </div>
  );
}
