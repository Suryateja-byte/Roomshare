'use client';

/**
 * NearbyPlacesSection Component
 *
 * Main section component that combines NearbyPlacesPanel and NearbyPlacesMap.
 * Rendered inline on listing detail pages after the Amenities section.
 *
 * Design: Premium glass card container with refined minimalist aesthetic.
 */

import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import NearbyPlacesPanel from './NearbyPlacesPanel';
import NearbyPlacesMap from './NearbyPlacesMap';
import type { NearbyPlace } from '@/types/nearby';

interface NearbyPlacesSectionProps {
  listingLat: number;
  listingLng: number;
}

export default function NearbyPlacesSection({
  listingLat,
  listingLng,
}: NearbyPlacesSectionProps) {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);

  return (
    <section className="mt-12 pt-8 border-t border-zinc-100 dark:border-zinc-800">
      {/* Premium section header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20 dark:shadow-blue-500/10">
          <MapPin className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
            Nearby Places
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Explore what&apos;s around
          </p>
        </div>
      </div>

      {/* Glass card container for content */}
      <div
        className="
          rounded-2xl
          border border-zinc-200/60 dark:border-zinc-700/40
          bg-gradient-to-br from-white/80 to-zinc-50/50
          dark:from-zinc-900/80 dark:to-zinc-800/50
          backdrop-blur-sm
          shadow-xl shadow-zinc-900/5 dark:shadow-black/20
          overflow-hidden
        "
      >
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Panel - left side with subtle border */}
          <div className="p-6 lg:border-r border-zinc-200/60 dark:border-zinc-700/40">
            <NearbyPlacesPanel
              listingLat={listingLat}
              listingLng={listingLng}
              onPlacesChange={setPlaces}
            />
          </div>

          {/* Map - right side, full bleed */}
          <div className="h-[400px] lg:h-[500px]">
            <NearbyPlacesMap
              listingLat={listingLat}
              listingLng={listingLng}
              places={places}
              className="h-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
