'use client';

interface TrustBadgeProps {
  avgRating?: number | null;
  reviewCount?: number;
}

/**
 * TrustBadge — Shows "Guest Favorite" for highly-rated listings.
 * Renders nothing if criteria not met.
 */
export function TrustBadge({ avgRating, reviewCount = 0 }: TrustBadgeProps) {
  const rating = Number.isFinite(avgRating) ? avgRating! : 0;
  if (rating < 4.9 || reviewCount < 5) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-2xs font-bold uppercase tracking-wide bg-gradient-to-r from-amber-100 to-yellow-50 dark:from-amber-900/60 dark:to-yellow-900/40 text-amber-800 dark:text-amber-200 shadow-sm border border-amber-200/60 dark:border-amber-700/40">
      <svg
        className="w-3 h-3"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 0l2.47 5.01L16 5.81l-4 3.9.94 5.49L8 12.49l-4.94 2.71L4 9.71 0 5.81l5.53-.8z" />
      </svg>
      Guest Favorite
    </span>
  );
}

export default TrustBadge;
