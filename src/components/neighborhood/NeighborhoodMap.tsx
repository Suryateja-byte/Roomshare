'use client';

/**
 * NeighborhoodMap - Interactive map for Pro users
 *
 * Displays:
 * - Listing location at center
 * - POI pins with clustering
 * - 5/10/15 minute walkability rings
 * - Hover/click sync with place list
 * - Dark/light mode support
 */

import ReactMapGL, { Marker, Popup, Source, Layer, type LayerProps } from 'react-map-gl/maplibre';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import { getWalkabilityRings, formatDistance } from '@/lib/geo/distance';
import type { POI } from '@/lib/places/types';
import { fixMarkerWrapperRole } from '@/components/map/fixMarkerA11y';

interface NeighborhoodMapProps {
  /** Listing center coordinates */
  center: { lat: number; lng: number };
  /** Array of POIs to display */
  pois: POI[];
  /** Currently selected place ID */
  selectedPlaceId?: string | null;
  /** Currently hovered place ID */
  hoveredPlaceId?: string | null;
  /** Callback when a POI pin is clicked */
  onPoiClick?: (poi: POI) => void;
  /** Callback when a POI pin is hovered */
  onPoiHover?: (poi: POI | null) => void;
  /** Show walkability rings */
  showWalkabilityRings?: boolean;
  /** Optional class name */
  className?: string;
}

// Cluster layer styles
const clusterLayer: LayerProps = {
  id: 'poi-clusters',
  type: 'circle',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#ef4444', // red-500
    'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 10, 26],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  },
};

const clusterLayerDark: LayerProps = {
  id: 'poi-clusters-dark',
  type: 'circle',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#f87171', // red-400
    'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 10, 26],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#18181b',
  },
};

const clusterCountLayer: LayerProps = {
  id: 'poi-cluster-count',
  type: 'symbol',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-font': ['Noto Sans Regular'],
    'text-size': 12,
  },
  paint: { 'text-color': '#ffffff' },
};

const clusterCountLayerDark: LayerProps = {
  id: 'poi-cluster-count-dark',
  type: 'symbol',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-font': ['Noto Sans Regular'],
    'text-size': 12,
  },
  paint: { 'text-color': '#18181b' },
};

// Walkability ring layer styles
const walkabilityRingLayer: LayerProps = {
  id: 'walkability-rings',
  type: 'line',
  paint: {
    'line-color': [
      'match',
      ['get', 'minutes'],
      5, '#22c55e', // green-500
      10, '#eab308', // yellow-500
      15, '#f97316', // orange-500
      '#94a3b8', // slate-400 default
    ],
    'line-width': 2,
    'line-dasharray': [4, 2],
    'line-opacity': 0.6,
  },
};

const walkabilityRingLabelLayer: LayerProps = {
  id: 'walkability-ring-labels',
  type: 'symbol',
  layout: {
    'text-field': ['concat', ['get', 'minutes'], ' min'],
    'text-font': ['Noto Sans Regular'],
    'text-size': 11,
    'symbol-placement': 'line',
    'text-max-angle': 30,
  },
  paint: {
    'text-color': [
      'match',
      ['get', 'minutes'],
      5, '#16a34a', // green-600
      10, '#ca8a04', // yellow-600
      15, '#ea580c', // orange-600
      '#64748b', // slate-500 default
    ],
    'text-halo-color': '#ffffff',
    'text-halo-width': 1,
  },
};

export function NeighborhoodMap({
  center,
  pois,
  selectedPlaceId,
  hoveredPlaceId,
  onPoiClick,
  onPoiHover,
  showWalkabilityRings = true,
  className = '',
}: NeighborhoodMapProps) {
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [popupPoi, setPopupPoi] = useState<POI | null>(null);
  const mapRef = useRef<any>(null);

  // Initial zoom level based on POI spread
  const initialZoom = useMemo(() => {
    if (pois.length === 0) return 14;
    const maxDistance = Math.max(...pois.map((p) => p.distanceMiles ?? 0));
    if (maxDistance > 1.5) return 13;
    if (maxDistance > 0.5) return 14;
    return 15;
  }, [pois]);

  const [viewState, setViewState] = useState({
    longitude: center.lng,
    latitude: center.lat,
    zoom: initialZoom,
  });

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  // Center map when center prop changes
  useEffect(() => {
    setViewState((prev) => ({
      ...prev,
      longitude: center.lng,
      latitude: center.lat,
    }));
  }, [center.lat, center.lng]);

  // Convert POIs to GeoJSON for clustering
  const poiGeojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: pois.map((poi) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [poi.lng, poi.lat],
        },
        properties: {
          placeId: poi.placeId,
          name: poi.name,
          primaryType: poi.primaryType,
          distanceMiles: poi.distanceMiles,
          walkMins: poi.walkMins,
          rating: poi.rating,
          openNow: poi.openNow,
        },
      })),
    }),
    [pois]
  );

  // Create walkability ring GeoJSON (circles around center)
  const walkabilityGeojson = useMemo(() => {
    if (!showWalkabilityRings) return null;

    const rings = getWalkabilityRings();
    const features = rings.map((ring) => {
      // Create a circle as a polygon (64 points)
      const points = 64;
      const coordinates: [number, number][] = [];

      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * 2 * Math.PI;
        // Convert meters to degrees (approximate)
        const latOffset = (ring.meters / 111320) * Math.cos(angle);
        const lngOffset =
          (ring.meters / (111320 * Math.cos((center.lat * Math.PI) / 180))) *
          Math.sin(angle);
        coordinates.push([center.lng + lngOffset, center.lat + latOffset]);
      }

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates,
        },
        properties: {
          minutes: ring.minutes,
        },
      };
    });

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [center.lat, center.lng, showWalkabilityRings]);

  // Create POI lookup map
  const poiLookup = useMemo(() => {
    const map = new Map<string, POI>();
    pois.forEach((poi) => map.set(poi.placeId, poi));
    return map;
  }, [pois]);

  // Handle cluster click to zoom
  const onClusterClick = useCallback(async (event: any) => {
    const feature = event.features?.[0];
    if (!feature || !mapRef.current) return;

    const clusterId = feature.properties?.cluster_id;
    if (!clusterId) return;

    const mapboxSource = mapRef.current.getSource('pois') as
      | GeoJSONSource
      | undefined;
    if (!mapboxSource) return;

    try {
      const zoom = await mapboxSource.getClusterExpansionZoom(clusterId);
      if (!feature.geometry || feature.geometry.type !== 'Point') return;
      mapRef.current?.flyTo({
        center: feature.geometry.coordinates as [number, number],
        zoom: zoom,
        duration: 500,
      });
    } catch (error) {
      console.warn('Cluster expansion failed', error);
    }
  }, []);

  // Fly to selected POI
  useEffect(() => {
    if (selectedPlaceId && mapRef.current) {
      const poi = poiLookup.get(selectedPlaceId);
      if (poi) {
        mapRef.current.flyTo({
          center: [poi.lng, poi.lat],
          zoom: Math.max(viewState.zoom, 15),
          duration: 300,
        });
        setPopupPoi(poi);
      }
    }
  }, [selectedPlaceId, poiLookup, viewState.zoom]);

  // Close popup when selection changes
  useEffect(() => {
    if (!selectedPlaceId) {
      setPopupPoi(null);
    }
  }, [selectedPlaceId]);

  const useClustering = pois.length >= 15;

  return (
    <div
      className={`w-full h-full rounded-xl overflow-hidden border shadow-lg relative ${className}`}
      role="region"
      aria-label="Interactive neighborhood map showing nearby places"
    >
      {/* Loading state */}
      {!isMapLoaded && (
        <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-800 z-20 flex items-center justify-center" role="status" aria-label="Loading map">
          <div className="flex flex-col items-center gap-3">
            <MapPin className="w-10 h-10 text-zinc-300 dark:text-zinc-600 animate-pulse" aria-hidden="true" />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Loading map...
            </span>
          </div>
        </div>
      )}

      <ReactMapGL
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        onLoad={() => setIsMapLoaded(true)}
        onClick={useClustering ? onClusterClick : undefined}
        interactiveLayerIds={
          useClustering ? [isDarkMode ? 'poi-clusters-dark' : 'poi-clusters'] : []
        }
        style={{ width: '100%', height: '100%' }}
        mapStyle={
          isDarkMode
            ? '/map-styles/liberty-dark.json'
            : 'https://tiles.openfreemap.org/styles/liberty'
        }
      >
        {/* Walkability rings */}
        {walkabilityGeojson && (
          <Source id="walkability" type="geojson" data={walkabilityGeojson}>
            <Layer {...walkabilityRingLayer} />
            <Layer {...walkabilityRingLabelLayer} />
          </Source>
        )}

        {/* POI clustering source */}
        {useClustering && (
          <Source
            id="pois"
            type="geojson"
            data={poiGeojson}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={40}
          >
            {isDarkMode ? (
              <>
                <Layer {...clusterLayerDark} />
                <Layer {...clusterCountLayerDark} />
              </>
            ) : (
              <>
                <Layer {...clusterLayer} />
                <Layer {...clusterCountLayer} />
              </>
            )}
          </Source>
        )}

        {/* Individual POI markers (when not clustered or unclustered points) */}
        {pois.map((poi) => (
          <Marker
            key={poi.placeId}
            longitude={poi.lng}
            latitude={poi.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setPopupPoi(poi);
              onPoiClick?.(poi);
            }}
          >
            <div
              ref={(el) => { if (el) fixMarkerWrapperRole(el); }}
              className={`
                w-6 h-6 rounded-full flex items-center justify-center cursor-pointer
                transition-transform duration-150
                focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                ${
                  hoveredPlaceId === poi.placeId || selectedPlaceId === poi.placeId
                    ? 'scale-125 z-10'
                    : ''
                }
                ${
                  selectedPlaceId === poi.placeId
                    ? 'bg-primary ring-2 ring-primary/30'
                    : 'bg-red-500 dark:bg-red-400'
                }
              `}
              role="button"
              tabIndex={0}
              aria-label={`${poi.name}${poi.distanceMiles ? `, ${formatDistance(poi.distanceMiles)}` : ''}`}
              onMouseEnter={() => onPoiHover?.(poi)}
              onMouseLeave={() => onPoiHover?.(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setPopupPoi(poi);
                  onPoiClick?.(poi);
                }
              }}
            >
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </Marker>
        ))}

        {/* Center listing marker */}
        <Marker longitude={center.lng} latitude={center.lat} anchor="bottom">
          <div className="relative" role="img" aria-label="Listing location">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg ring-4 ring-primary/30">
              <HomeIcon className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-primary" />
          </div>
        </Marker>

        {/* POI popup */}
        {popupPoi && (
          <Popup
            longitude={popupPoi.lng}
            latitude={popupPoi.lat}
            anchor="top"
            onClose={() => {
              setPopupPoi(null);
              onPoiClick?.(popupPoi);
            }}
            closeButton={true}
            closeOnClick={false}
            className={`z-50 [&_.maplibregl-popup-content]:rounded-lg [&_.maplibregl-popup-content]:p-0 ${
              isDarkMode
                ? '[&_.maplibregl-popup-tip]:border-t-zinc-800'
                : '[&_.maplibregl-popup-tip]:border-t-white'
            }`}
            maxWidth="250px"
          >
            <div
              className={`p-3 rounded-lg ${
                isDarkMode ? 'bg-zinc-800 text-white' : 'bg-white text-zinc-900'
              }`}
            >
              <h4 className="font-medium text-sm">{popupPoi.name}</h4>
              {popupPoi.primaryType && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {popupPoi.primaryType.replace(/_/g, ' ')}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs">
                {popupPoi.distanceMiles !== undefined && (
                  <span className="font-medium">
                    {formatDistance(popupPoi.distanceMiles)}
                  </span>
                )}
                {popupPoi.walkMins !== undefined && (
                  <span className="text-muted-foreground">
                    ~{popupPoi.walkMins} min walk
                  </span>
                )}
              </div>
              {popupPoi.rating && (
                <div className="flex items-center gap-1 mt-1">
                  <StarIcon className="w-3 h-3 text-yellow-500" />
                  <span className="text-xs">{popupPoi.rating.toFixed(1)}</span>
                </div>
              )}
            </div>
          </Popup>
        )}
      </ReactMapGL>

      {/* Legend */}
      {showWalkabilityRings && (
        <div
          className={`absolute bottom-4 left-4 p-2 rounded-lg text-xs ${
            isDarkMode
              ? 'bg-zinc-800/90 text-white'
              : 'bg-white/90 text-zinc-900'
          } shadow-sm`}
          role="region"
          aria-label="Map legend showing walking time zones"
        >
          <div className="font-medium mb-1">Walking time</div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-green-500" />
            <span>5 min</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-yellow-500" />
            <span>10 min</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-orange-500" />
            <span>15 min</span>
          </div>
        </div>
      )}

    </div>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 3L2 12h3v9h6v-6h2v6h6v-9h3L12 3z" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export default NeighborhoodMap;
