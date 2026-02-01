'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { SplitStayPair } from '@/lib/search/split-stay';

interface SplitStayCardProps {
  pair: SplitStayPair;
}

/**
 * SplitStayCard — Shows two listings side-by-side for split-stay trips.
 * Used when a single listing can't cover the full requested duration.
 */
export function SplitStayCard({ pair }: SplitStayCardProps) {
  const { first, second, combinedPrice, splitLabel } = pair;

  return (
    <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
          Split Stay · {splitLabel}
        </p>
      </div>

      {/* Two listings side by side */}
      <div className="grid grid-cols-2 divide-x divide-zinc-100 dark:divide-zinc-800">
        <SplitStayHalf listing={first} label="First stay" />
        <SplitStayHalf listing={second} label="Then" />
      </div>

      {/* Connecting arc visual */}
      <div className="flex items-center justify-center py-1 -mt-1">
        <svg width="60" height="16" viewBox="0 0 60 16" className="text-zinc-300 dark:text-zinc-600" aria-hidden="true">
          <path d="M5 8 C20 0, 40 0, 55 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
          <circle cx="5" cy="8" r="2.5" fill="currentColor" />
          <circle cx="55" cy="8" r="2.5" fill="currentColor" />
        </svg>
      </div>

      {/* Combined price footer */}
      <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-baseline justify-between">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">Combined total</span>
        <span className="font-bold text-lg text-zinc-900 dark:text-white">
          ${combinedPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}

function SplitStayHalf({ listing, label }: { listing: SplitStayPair['first']; label: string }) {
  const image = listing.images?.[0];

  return (
    <Link href={`/listings/${listing.id}`} className="block p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
      <p className="text-2xs text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wide mb-1.5">
        {label}
      </p>
      {image && (
        <div className="relative aspect-[4/3] rounded-lg overflow-hidden mb-2">
          <Image src={image} alt={listing.title} fill className="object-cover" sizes="(max-width: 640px) 50vw, 25vw" />
        </div>
      )}
      <h4 className="text-sm font-medium text-zinc-900 dark:text-white line-clamp-1">{listing.title}</h4>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
        ${listing.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo
      </p>
    </Link>
  );
}

export default SplitStayCard;
