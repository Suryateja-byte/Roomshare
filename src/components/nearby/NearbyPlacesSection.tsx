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

  return (
    <section id="nearby-places" className="mt-12 pt-8 border-t border-zinc-100 dark:border-zinc-800">
      {/* Premium section header */}
      <div className="flex items-center justify-between mb-6 lg:mb-8 px-1 sm:px-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20 dark:shadow-blue-500/10">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
              Nearby Places
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Discover convenience at your doorstep
            </p>
          </div>
        </div>

        {/* Desktop View Toggle (Map/Satellite - visual only for now) */}
        <div className="hidden lg:flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-full border border-zinc-200 dark:border-zinc-800">
          <button className="px-4 py-1.5 rounded-full bg-white dark:bg-zinc-700 shadow-sm text-sm font-medium text-zinc-900 dark:text-white transition-all">
            Map
          </button>
          <button className="px-4 py-1.5 rounded-full text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
            Satellite
          </button>
        </div>
      </div>

      {/* Main Container - Taller for premium feel */}
      <div
        className="
          relative w-full
          h-[65vh] sm:h-[600px] lg:h-[700px]
          bg-white dark:bg-zinc-900
          rounded-3xl
          border border-zinc-200 dark:border-zinc-800
          shadow-xl shadow-zinc-200/50 dark:shadow-none
          overflow-hidden
          lg:flex lg:flex-row
        "
      >
        {/* Left Panel: Search & List */}
        <div
          className={`
            w-full h-full
            absolute inset-0 z-30
            lg:static lg:z-auto lg:w-[420px]
            flex flex-col
            border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800
            bg-white dark:bg-zinc-900
            transition-all duration-300 ease-out
            ${viewMode === 'list'
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : 'translate-y-5 opacity-0 pointer-events-none lg:translate-y-0 lg:opacity-100 lg:pointer-events-auto'
            }
          `}
        >
          <NearbyPlacesPanel
            listingLat={listingLat}
            listingLng={listingLng}
            onPlacesChange={setPlaces}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>

        {/* Right Panel: Map - always visible, takes full space on mobile when map mode */}
        <div className="w-full h-full absolute inset-0 z-10 lg:static lg:flex-1">
          <NearbyPlacesMap
            listingLat={listingLat}
            listingLng={listingLng}
            places={places}
            className="h-full"
          />
        </div>
      </div>
    </section>
  );
}
