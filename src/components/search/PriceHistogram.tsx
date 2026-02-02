'use client';

import { useMemo } from 'react';
import type { PriceHistogramBucket } from '@/app/api/search/facets/route';

// Pre-computed skeleton heights to avoid Math.random() during render
const SKELETON_HEIGHTS = [45, 72, 33, 58, 80, 25, 67, 41, 55, 38, 75, 50];

interface PriceHistogramProps {
  buckets: PriceHistogramBucket[] | null;
  selectedMin: number;
  selectedMax: number;
  height?: number;
  barGap?: number;
}

export function PriceHistogram({
  buckets,
  selectedMin,
  selectedMax,
  height = 80,
  barGap = 1,
}: PriceHistogramProps) {
  const maxCount = useMemo(() => {
    if (!buckets || buckets.length === 0) return 0;
    return Math.max(...buckets.map((b) => b.count));
  }, [buckets]);

  return (
    <div
      className="absolute inset-x-0 top-0 flex items-end gap-px"
      style={{ height }}
      aria-hidden="true"
    >
      {buckets && buckets.length > 0 && maxCount > 0 ? (
        buckets.map((bucket) => {
          const barHeight = Math.max(2, (bucket.count / maxCount) * height);
          const inRange = bucket.max > selectedMin && bucket.min < selectedMax;
          return (
            <div
              key={bucket.min}
              className="flex-1 rounded-t-sm transition-colors duration-150"
              style={{
                height: barHeight,
                marginLeft: barGap / 2,
                marginRight: barGap / 2,
                backgroundColor: inRange
                  ? 'var(--color-zinc-900, #18181b)'
                  : 'var(--color-zinc-200, #e4e4e7)',
              }}
            />
          );
        })
      ) : (
        <div className="flex-1 flex items-end gap-px h-full">
          {SKELETON_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-zinc-100 dark:bg-zinc-800"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
