'use client';

import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MapEmptyStateProps {
  onZoomOut: () => void;
  searchParams: URLSearchParams;
}

export function MapEmptyState({ onZoomOut }: MapEmptyStateProps) {
  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 px-5 py-4 max-w-[280px] text-center pointer-events-auto">
      <MapPin className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">No listings in this area</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Try zooming out or adjusting your filters</p>
      <div className="flex gap-2 justify-center">
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-8"
          onClick={onZoomOut}
        >
          Zoom out
        </Button>
      </div>
    </div>
  );
}
