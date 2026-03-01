'use client';

/**
 * NearbyPlacesSection Component
 *
 * Main section component that combines NearbyPlacesPanel and NearbyPlacesMap.
 * Rendered inline on listing detail pages after the Amenities section.
 *
 * Design: Premium glass card container with refined minimalist aesthetic.
 * Features: Mobile list/map toggle, taller container, view mode switching.
 */

import { useState } from 'react';
import { MapPin, Map as MapIcon, List as ListIcon } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);

  return (
    <section id="nearby-places" className="mt-12 pt-8 border-t border-zinc-100 dark:border-zinc-800">
      {/* Minimal Section Header */}
      <div className="flex items-center justify-between mb-6 px-1 sm:px-0">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Nearby Places
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Discover convenience at your doorstep
          </p>
        </div>

      </div>

      {/* Main Container - Clean Border */}
      <div
        className="
          relative w-full
          h-[60vh] sm:h-[550px] lg:h-[600px]
          bg-white dark:bg-zinc-900
          rounded-2xl
          border border-zinc-200/80 dark:border-zinc-800/80
          shadow-2xl
          overflow-hidden
          lg:flex lg:flex-row
        "
      >
        {/* Left Panel: Search & List */}
        <div
          className={`
            w-full h-full
            absolute inset-0 z-30
            lg:static lg:z-auto lg:w-[400px]
            flex flex-col
            border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800
            bg-white dark:bg-zinc-900
            transition-all duration-300 ease-out
            ${viewMode === 'list'
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : 'translate-y-4 opacity-0 pointer-events-none lg:translate-y-0 lg:opacity-100 lg:pointer-events-auto'
            }
          `}
        >
          <NearbyPlacesPanel
            listingLat={listingLat}
            listingLng={listingLng}
            onPlacesChange={setPlaces}
            onPlaceHover={setHoveredPlaceId}
          />
        </div>

        {/* Right Panel: Map */}
        <div className="w-full h-full absolute inset-0 z-10 lg:static lg:flex-1 bg-zinc-50 dark:bg-zinc-900">
          <NearbyPlacesMap
            listingLat={listingLat}
            listingLng={listingLng}
            places={places}
            highlightedPlaceId={hoveredPlaceId}
            className="h-full"
          />
        </div>

        {/* Mobile Floating Toggle Button — rendered at container level for correct z-index stacking */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 lg:hidden">
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
            className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full shadow-xl shadow-zinc-900/20 font-semibold text-sm transform transition-transform active:scale-95 hover:scale-105"
          >
            <span>{viewMode === 'list' ? 'Map' : 'List'}</span>
            {viewMode === 'list' ? (
              <MapIcon className="w-4 h-4" />
            ) : (
              <ListIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
