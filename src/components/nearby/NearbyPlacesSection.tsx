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

        {/* Desktop View Toggle */}
        <div className="hidden lg:flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button className="px-3 py-1 rounded-md bg-white dark:bg-zinc-700 shadow-sm text-sm font-medium text-zinc-900 dark:text-white transition-all">
            Map
          </button>
          <button className="px-3 py-1 rounded-md text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
            Satellite
          </button>
        </div>
      </div>

      {/* Main Container - Clean Border */}
      <div
        className="
          relative w-full
          h-[60vh] sm:h-[550px] lg:h-[600px]
          bg-white dark:bg-zinc-900
          rounded-2xl
          border border-zinc-200 dark:border-zinc-800
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
            viewMode={viewMode}
            onViewModeChange={setViewMode}
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
      </div>
    </section>
  );
}
