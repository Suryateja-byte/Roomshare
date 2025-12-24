'use client';

/**
 * NearbyPlacesMap Component
 *
 * MapLibre GL JS map with OpenStreetMap tiles for displaying nearby places.
 * Includes listing marker and POI markers.
 *
 * DESIGN DECISION:
 * - Uses OpenStreetMap tiles as default (free, no API key, no CORS issues)
 * - Radar is used for Places API only (server-side, not for map tiles)
 * - This ensures map always works without additional configuration
 */

import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import RadarAttribution from './RadarAttribution';
import type { NearbyPlace } from '@/types/nearby';

// OpenStreetMap raster tile style - free, no API key required, always works
const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
};

// Tile source type for attribution
export type TileSource = 'radar' | 'osm';

// Escape HTML to prevent XSS in popup content
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

  // Initialize map with OSM tiles
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Create map with OSM style (always works, no configuration needed)
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OSM_STYLE,
      center: [listingLng, listingLat],
      zoom: 14,
      attributionControl: false, // We use custom attribution component
    });

    mapRef.current = map;

    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Wait for map to load before adding markers
    map.on('load', () => {
      // Add listing marker (center)
      const listingMarker = new maplibregl.Marker({
        color: '#3b82f6', // Blue for listing
        scale: 1.2,
      })
        .setLngLat([listingLng, listingLat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            '<strong>Listing Location</strong>'
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
  }, [listingLat, listingLng]);

  // Update POI markers when places change
  const updateMarkers = useCallback((newPlaces: NearbyPlace[]) => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing POI markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Add new POI markers
    const newMarkers = newPlaces.map((place) => {
      const marker = new maplibregl.Marker({
        color: '#6366f1', // Indigo-500 for POIs
        scale: 0.9,
      })
        .setLngLat([place.location.lng, place.location.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(`
            <div class="p-2">
              <strong class="text-sm">${escapeHtml(place.name)}</strong>
              <p class="text-xs text-gray-600">${escapeHtml(place.address)}</p>
              <p class="text-xs text-gray-500 mt-1">${place.distanceMiles.toFixed(2)} mi</p>
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
      {/* Attribution - always OSM since we use OSM tiles */}
      <RadarAttribution tileSource="osm" />
    </div>
  );
}
