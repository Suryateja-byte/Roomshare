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

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTheme } from 'next-themes';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/styles/nearby-map.css';
import { Plus, Minus, Navigation, Maximize2 } from 'lucide-react';
import RadarAttribution from './RadarAttribution';
import { getCategoryColors } from '@/types/nearby';
import { getStadiaStyle } from '@/lib/maps/stadia';
import type { NearbyPlace } from '@/types/nearby';

// SVG icon paths for category markers (14x14 viewBox, stroke-width 2)
const CATEGORY_ICON_PATHS: Record<string, string> = {
  // ShoppingCart for grocery
  'food-grocery': 'M1 1h2l1.5 7h7l1.5-5H4.5M5.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM10.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  // Utensils for restaurant
  'indian-restaurant': 'M3 1v5a2 2 0 0 0 2 2v5M11 1v3a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2V1M11 8v5',
  // ShoppingBag for shopping
  'shopping-mall': 'M2 4h10l-1 9H3L2 4zM5 4V2a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2',
  // Fuel for gas station
  'gas-station': 'M3 13V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10M3 6h6M11 4l1 1v4a1 1 0 0 1-1 1h0',
  // Dumbbell for gym
  'gym': 'M2 7h10M4 4v6M10 4v6M1 5v4M13 5v4',
  // Pill for pharmacy
  'pharmacy': 'M8.5 2.5a3.5 3.5 0 0 1 0 7l-3 3a3.5 3.5 0 1 1-3-3l3-3a3.5 3.5 0 0 1 3-4z',
  // MapPin for default
  'default': 'M7 13S2 8.5 2 5.5a5 5 0 1 1 10 0C12 8.5 7 13 7 13zM7 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
};

/**
 * Get the SVG icon path for a category
 */
function getCategoryIconPath(category: string): string {
  // Check for exact match first
  if (CATEGORY_ICON_PATHS[category]) {
    return CATEGORY_ICON_PATHS[category];
  }
  // Check for partial match
  for (const key of Object.keys(CATEGORY_ICON_PATHS)) {
    if (category.includes(key) || key.includes(category)) {
      return CATEGORY_ICON_PATHS[key];
    }
  }
  return CATEGORY_ICON_PATHS['default'];
}

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
 *
 * Uses a wrapper pattern to fix CSS jitter/"doom flicker":
 * - Outer wrapper provides stable hover zone (doesn't change size)
 * - Inner visual element scales on hover
 * This prevents the marker from "running away" when cursor approaches
 *
 * @see https://css-tricks.com/avoid-css-jitter/
 */
function createHomeMarkerElement(): HTMLDivElement {
  // Outer wrapper - stable hover zone, larger than visual marker
  // This element captures hover events without changing size
  const wrapper = document.createElement('div');
  wrapper.className = 'group w-14 h-14 flex items-center justify-center cursor-pointer';

  // Inner visual marker - scales on hover via group-hover
  const container = document.createElement('div');
  container.className = 'w-10 h-10 bg-zinc-900 rounded-full shadow-xl flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-110';

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
  wrapper.appendChild(container);

  return wrapper;
}

/**
 * Create a custom POI marker element with category color and icon
 *
 * Uses a wrapper pattern to fix CSS jitter/"doom flicker":
 * - Outer wrapper provides stable hover zone (doesn't change size)
 * - Inner visual element scales on hover
 * This prevents the marker from "running away" when cursor approaches
 *
 * @see https://css-tricks.com/avoid-css-jitter/
 */
function createPOIMarkerElement(category: string, isDark: boolean): HTMLDivElement {
  const colors = getCategoryColors(category);
  const iconPath = getCategoryIconPath(category);

  // Outer wrapper - stable hover zone, larger than visual marker
  // This element captures hover events without changing size
  const wrapper = document.createElement('div');
  wrapper.className = 'group w-12 h-12 flex items-center justify-center cursor-pointer poi-marker';

  // Inner visual marker - scales on hover via group-hover
  const container = document.createElement('div');
  container.className = 'w-8 h-8 rounded-full shadow-lg flex items-center justify-center border-2 transition-all duration-200 ease-out group-hover:scale-110 group-active:scale-95';
  container.style.backgroundColor = isDark ? colors.markerBgDark : colors.markerBg;
  container.style.borderColor = isDark ? colors.markerBorderDark : colors.markerBorder;

  // Create SVG icon inside the marker
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', isDark ? colors.markerBorderDark : colors.markerBorder);
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', iconPath);
  svg.appendChild(path);
  container.appendChild(svg);

  wrapper.appendChild(container);

  return wrapper;
}

interface NearbyPlacesMapProps {
  listingLat: number;
  listingLng: number;
  places: NearbyPlace[];
  className?: string;
  highlightedPlaceId?: string | null;
}

export default function NearbyPlacesMap({
  listingLat,
  listingLng,
  places,
  className = '',
  highlightedPlaceId,
}: NearbyPlacesMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const listingMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hasFitBoundsRef = useRef<boolean>(false);

  // Get current theme for dark mode support
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  // Initialize map with Stadia Maps Alidade Smooth basemap
  useEffect(() => {
    if (!mapContainerRef.current) return;

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
      hasFitBoundsRef.current = false; // Reset for new map instance
    };
  }, [listingLat, listingLng, isDarkMode]); // Re-create map when theme changes

  // Update POI markers when places change
  const updateMarkers = useCallback((newPlaces: NearbyPlace[]) => {
    const map = mapRef.current;
    if (!map) return;

    // Differential marker updates to preserve state and reduce DOM churn
    // Get existing marker IDs
    const existingMarkerMap = new Map<string, maplibregl.Marker>();
    markersRef.current.forEach((marker) => {
      const placeId = marker.getElement().dataset.placeId;
      if (placeId) {
        existingMarkerMap.set(placeId, marker);
      }
    });

    // Track new place IDs
    const newPlaceIds = new Set(newPlaces.map((p) => p.id));

    // Remove markers that no longer exist
    markersRef.current = markersRef.current.filter((marker) => {
      const placeId = marker.getElement().dataset.placeId;
      if (!placeId || !newPlaceIds.has(placeId)) {
        marker.remove();
        return false;
      }
      return true;
    });

    // Add only new markers (that don't already exist)
    newPlaces.forEach((place) => {
      if (!existingMarkerMap.has(place.id)) {
        // Create new marker with category icon and theme-aware colors
        const markerEl = createPOIMarkerElement(place.category, isDarkMode);
        markerEl.dataset.placeId = place.id; // Track by ID

        const marker = new maplibregl.Marker({ element: markerEl })
          .setLngLat([place.location.lng, place.location.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 25, closeButton: false, className: 'nearby-popup' }).setHTML(`
              <div class="nearby-popup-content">
                <div class="nearby-popup-name">${escapeHtml(place.name)}</div>
                <div class="nearby-popup-address">${escapeHtml(place.address)}</div>
                <div class="nearby-popup-distance">${place.distanceMiles.toFixed(1)} mi away</div>
              </div>
            `)
          )
          .addTo(map);

        markersRef.current.push(marker);
      }
    });

    // Fit bounds to include all markers on initial load only
    // Prevents camera animation from interfering with marker clicks
    if (newPlaces.length > 0 && !hasFitBoundsRef.current) {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([listingLng, listingLat]);
      newPlaces.forEach((place) => {
        bounds.extend([place.location.lng, place.location.lat]);
      });

      map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 15,
        duration: 0, // Disable animation to prevent marker movement during clicks
      });

      hasFitBoundsRef.current = true;
    }
  }, [listingLat, listingLng, isDarkMode]);

  // Update markers when places change
  useEffect(() => {
    updateMarkers(places);
  }, [places, updateMarkers]);

  // Highlight marker when hovering on list item
  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const el = marker.getElement();
      const placeId = el.dataset.placeId;
      if (placeId === highlightedPlaceId) {
        el.classList.add('highlighted');
      } else {
        el.classList.remove('highlighted');
      }
    });
  }, [highlightedPlaceId]);

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

  const handleFitAllMarkers = () => {
    const map = mapRef.current;
    if (!map || places.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([listingLng, listingLat]);
    places.forEach((place) => {
      bounds.extend([place.location.lng, place.location.lat]);
    });

    map.fitBounds(bounds, {
      padding: 50,
      maxZoom: 15,
      duration: 500, // Smooth animation when user explicitly requests it
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
            w-9 h-9 bg-white dark:bg-zinc-800
            rounded-lg shadow-md border border-zinc-200 dark:border-zinc-700
            flex items-center justify-center
            text-zinc-700 dark:text-zinc-200
            hover:bg-zinc-50 dark:hover:bg-zinc-700
            active:scale-95
            transition-all duration-200
          "
          aria-label="Zoom in"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="
            w-9 h-9 bg-white dark:bg-zinc-800
            rounded-lg shadow-md border border-zinc-200 dark:border-zinc-700
            flex items-center justify-center
            text-zinc-700 dark:text-zinc-200
            hover:bg-zinc-50 dark:hover:bg-zinc-700
            active:scale-95
            transition-all duration-200
          "
          aria-label="Zoom out"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          className="
            w-9 h-9 bg-zinc-900 dark:bg-white
            rounded-lg shadow-md
            flex items-center justify-center
            text-white dark:text-zinc-900
            hover:bg-zinc-800 dark:hover:bg-zinc-100
            active:scale-95
            transition-all duration-200
            mt-1
          "
          aria-label="Reset to listing location"
        >
          <Navigation className="w-4 h-4" />
        </button>
        {places.length > 0 && (
          <button
            onClick={handleFitAllMarkers}
            className="
              w-9 h-9 bg-white dark:bg-zinc-800
              rounded-lg shadow-md border border-zinc-200 dark:border-zinc-700
              flex items-center justify-center
              text-zinc-700 dark:text-zinc-200
              hover:bg-zinc-50 dark:hover:bg-zinc-700
              active:scale-95
              transition-all duration-200
              mt-1
            "
            aria-label="Fit all markers in view"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Radar branding - Stadia/OSM attribution handled by MapLibre attributionControl */}
      <RadarAttribution tileSource="stadia" />

    </div>
  );
}
