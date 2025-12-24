'use client';

/**
 * NearbyPlacesMap Component
 *
 * MapLibre GL JS map with Stadia Maps Alidade Smooth basemap for displaying nearby places.
 * Includes listing marker and POI markers with category-specific colors.
 *
 * DESIGN DECISIONS:
 * - Uses Stadia Maps Alidade Smooth (vector tiles, dark mode support, clean design)
 * - Radar is used for Places API only (server-side, not for map tiles)
 * - Custom floating controls for premium look
 * - Category-colored markers for visual distinction
 * - Attribution handled by MapLibre's built-in control (reads from style JSON)
 *
 * AUTHENTICATION:
 * - localhost: No API key required
 * - Production: Domain auth preferred, API key fallback
 *
 * @see https://docs.stadiamaps.com/map-styles/alidade-smooth/
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useTheme } from 'next-themes';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Plus, Minus, Navigation } from 'lucide-react';
import RadarAttribution from './RadarAttribution';
import { getCategoryColors } from '@/types/nearby';
import { getStadiaStyle } from '@/lib/maps/stadia';
import type { NearbyPlace } from '@/types/nearby';

// Tile source type for attribution
export type TileSource = 'radar' | 'stadia';

// Escape HTML to prevent XSS in popup content
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create a custom home marker element using safe DOM methods
 */
function createHomeMarkerElement(): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'w-10 h-10 bg-zinc-900 rounded-full shadow-xl flex items-center justify-center transform hover:scale-110 transition-transform cursor-pointer';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'white');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  // Home icon paths
  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'm3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '9 22 9 12 15 12 15 22');

  svg.appendChild(path1);
  svg.appendChild(polyline);
  container.appendChild(svg);

  return container;
}

/**
 * Create a custom POI marker element with category color
 */
function createPOIMarkerElement(category: string): HTMLDivElement {
  const colors = getCategoryColors(category);

  const container = document.createElement('div');
  container.className = 'w-8 h-8 rounded-full shadow-lg flex items-center justify-center border-2 transform hover:scale-110 transition-transform cursor-pointer';
  container.style.backgroundColor = colors.markerBg;
  container.style.borderColor = colors.markerBorder;

  // Create a simple circle indicator inside
  const inner = document.createElement('div');
  inner.className = 'w-3 h-3 rounded-full';
  inner.style.backgroundColor = colors.markerBorder;
  container.appendChild(inner);

  return container;
}

interface NearbyPlacesMapProps {
  listingLat: number;
  listingLng: number;
  places: NearbyPlace[];
  className?: string;
}

export default function NearbyPlacesMap({
  listingLat,
  listingLng,
  places,
  className = '',
}: NearbyPlacesMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const listingMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Get current theme for dark mode support
  const { resolvedTheme } = useTheme();

  // Initialize map with Stadia Maps Alidade Smooth basemap
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Determine dark mode from resolved theme
    const isDarkMode = resolvedTheme === 'dark';

    // Get Stadia style URL (optional API key for non-domain-auth production)
    const styleUrl = getStadiaStyle(isDarkMode, process.env.NEXT_PUBLIC_STADIA_API_KEY);

    // Create map with Stadia Maps style
    // Attribution is shown by default - MapLibre reads it from Stadia's style JSON
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [listingLng, listingLat],
      zoom: 14,
    });

    mapRef.current = map;

    // No default navigation controls - we add custom ones

    // Wait for map to load before adding markers
    map.on('load', () => {
      // Add listing marker (center) with custom element
      const homeEl = createHomeMarkerElement();
      const listingMarker = new maplibregl.Marker({ element: homeEl })
        .setLngLat([listingLng, listingLat])
        .setPopup(
          new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(
            '<div class="px-3 py-2 font-semibold text-sm">Listing Location</div>'
          )
        )
        .addTo(map);

      listingMarkerRef.current = listingMarker;
    });

    // Handle any map errors
    map.on('error', (e) => {
      console.error('Map error:', e.error?.message || e);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      listingMarkerRef.current = null;
    };
  }, [listingLat, listingLng, resolvedTheme]); // Re-create map when theme changes

  // Update POI markers when places change
  const updateMarkers = useCallback((newPlaces: NearbyPlace[]) => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing POI markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Add new POI markers with category colors
    const newMarkers = newPlaces.map((place) => {
      const markerEl = createPOIMarkerElement(place.category);

      const marker = new maplibregl.Marker({ element: markerEl })
        .setLngLat([place.location.lng, place.location.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(`
            <div class="p-3 max-w-[200px]">
              <div class="font-semibold text-sm text-zinc-900">${escapeHtml(place.name)}</div>
              <div class="text-xs text-zinc-500 mt-1">${escapeHtml(place.address)}</div>
              <div class="text-xs text-zinc-400 mt-2">${place.distanceMiles.toFixed(1)} mi away</div>
            </div>
          `)
        )
        .addTo(map);

      return marker;
    });

    markersRef.current = newMarkers;

    // Fit bounds to include all markers if there are places
    if (newPlaces.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([listingLng, listingLat]);
      newPlaces.forEach((place) => {
        bounds.extend([place.location.lng, place.location.lat]);
      });

      map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 15,
      });
    }
  }, [listingLat, listingLng]);

  // Update markers when places change
  useEffect(() => {
    updateMarkers(places);
  }, [places, updateMarkers]);

  // Map control handlers
  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleResetView = () => {
    mapRef.current?.flyTo({
      center: [listingLng, listingLat],
      zoom: 14,
      duration: 1000,
    });
  };

  return (
    <div className={`relative h-full ${className}`}>
      <div
        ref={mapContainerRef}
        className="w-full h-full"
        style={{ minHeight: '400px' }}
      />

      {/* Inner shadow overlay for depth */}
      <div
        className="
          absolute inset-0 pointer-events-none
          shadow-[inset_0_2px_20px_rgba(0,0,0,0.05)]
          dark:shadow-[inset_0_2px_20px_rgba(0,0,0,0.2)]
        "
      />

      {/* Custom Floating Controls */}
      <div className="absolute bottom-24 lg:bottom-6 right-4 lg:right-6 z-[400] flex flex-col gap-2">
        <button
          onClick={handleZoomIn}
          className="
            w-10 h-10 bg-white dark:bg-zinc-800
            rounded-xl shadow-lg
            flex items-center justify-center
            text-zinc-700 dark:text-zinc-200
            hover:bg-zinc-50 dark:hover:bg-zinc-700
            active:scale-95
            transition-all duration-200
          "
          aria-label="Zoom in"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          onClick={handleZoomOut}
          className="
            w-10 h-10 bg-white dark:bg-zinc-800
            rounded-xl shadow-lg
            flex items-center justify-center
            text-zinc-700 dark:text-zinc-200
            hover:bg-zinc-50 dark:hover:bg-zinc-700
            active:scale-95
            transition-all duration-200
          "
          aria-label="Zoom out"
        >
          <Minus className="w-5 h-5" />
        </button>
        <button
          onClick={handleResetView}
          className="
            w-10 h-10 bg-zinc-900 dark:bg-white
            rounded-xl shadow-lg
            flex items-center justify-center
            text-white dark:text-zinc-900
            hover:bg-zinc-800 dark:hover:bg-zinc-100
            active:scale-95
            transition-all duration-200
            mt-2
          "
          aria-label="Reset to listing location"
        >
          <Navigation className="w-5 h-5" />
        </button>
      </div>

      {/* Radar branding - Stadia/OSM attribution handled by MapLibre attributionControl */}
      <RadarAttribution tileSource="stadia" />
    </div>
  );
}
