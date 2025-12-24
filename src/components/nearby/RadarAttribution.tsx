'use client';

/**
 * RadarAttribution Component
 *
 * Shows Radar branding for the Places API. Stadia Maps and OpenStreetMap
 * attribution is handled by MapLibre's built-in attributionControl which
 * reads from the style JSON.
 *
 * Design: Refined glass badge with subtle hover effect.
 *
 * COMPLIANCE:
 * - Radar: Shows "Powered by Radar" for Places API
 * - Stadia/OSM: Handled automatically by MapLibre attributionControl
 *
 * @see https://radar.com/terms
 * @see https://stadiamaps.com/attribution/
 */

import React from 'react';
import type { TileSource } from './NearbyPlacesMap';

interface RadarAttributionProps {
  className?: string;
  tileSource?: TileSource;
}

export default function RadarAttribution({
  className = '',
  tileSource = 'radar',
}: RadarAttributionProps) {
  // For 'stadia' tileSource, Stadia/OSM attribution is handled by MapLibre's
  // built-in attributionControl. This component just shows Radar branding.
  const isStadia = tileSource === 'stadia';

  return (
    <a
      href="https://radar.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`
        absolute bottom-3 left-3
        z-[1000]
        inline-flex items-center gap-1.5
        px-2.5 py-1.5
        bg-white/95 dark:bg-zinc-900/95
        backdrop-blur-md
        border border-zinc-200/50 dark:border-zinc-700/50
        rounded-lg
        shadow-lg shadow-black/5 dark:shadow-black/30
        text-xs font-medium text-zinc-600 dark:text-zinc-400
        hover:text-zinc-900 dark:hover:text-zinc-200
        hover:border-zinc-300 dark:hover:border-zinc-600
        transition-all duration-200
        pointer-events-auto
        ${className}
      `}
      style={{
        // Ensure visibility with safe area insets for mobile
        paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
        marginLeft: 'max(12px, env(safe-area-inset-left))',
      }}
      aria-label={isStadia ? 'Places data by Radar' : 'Powered by Radar'}
    >
      {/* Radar logo SVG */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="opacity-70"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
      <span>Radar</span>
    </a>
  );
}
