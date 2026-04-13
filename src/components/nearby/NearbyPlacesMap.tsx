"use client";

/**
 * NearbyPlacesMap Component
 *
 * MapLibre GL JS map with OpenFreeMap Liberty tiles for displaying nearby places.
 * Visually consistent with the search page map (Map.tsx).
 *
 * DESIGN DECISIONS:
 * - Uses OpenFreeMap Liberty tiles (same as search map for visual consistency)
 * - Radar is used for Places API only (server-side, not for map tiles)
 * - Glass-pill floating controls matching search map aesthetic
 * - Category-colored markers for visual distinction
 * - Attribution handled by MapLibre's built-in control (reads from style JSON)
 */

import { useEffect, useRef, useCallback, type RefObject } from "react";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/nearby-map.css";
import { Plus, Minus, Navigation, Maximize2 } from "lucide-react";
import RadarAttribution from "./RadarAttribution";
import { getCategoryColors } from "@/types/nearby";
import { escapeHtml } from "@/lib/maps/mapAdapter";
import type { NearbyPlace } from "@/types/nearby";

// SVG icon paths for category markers (14x14 viewBox, stroke-width 2)
const CATEGORY_ICON_PATHS: Record<string, string> = {
  // ShoppingCart for grocery
  "food-grocery":
    "M1 1h2l1.5 7h7l1.5-5H4.5M5.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM10.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  // Utensils for restaurant
  "indian-restaurant":
    "M3 1v5a2 2 0 0 0 2 2v5M11 1v3a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2V1M11 8v5",
  // ShoppingBag for shopping
  "shopping-mall": "M2 4h10l-1 9H3L2 4zM5 4V2a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2",
  // Fuel for gas station
  "gas-station":
    "M3 13V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10M3 6h6M11 4l1 1v4a1 1 0 0 1-1 1h0",
  // Dumbbell for gym
  gym: "M2 7h10M4 4v6M10 4v6M1 5v4M13 5v4",
  // Pill for pharmacy
  pharmacy:
    "M8.5 2.5a3.5 3.5 0 0 1 0 7l-3 3a3.5 3.5 0 1 1-3-3l3-3a3.5 3.5 0 0 1 3-4z",
  // MapPin for default
  default:
    "M7 13S2 8.5 2 5.5a5 5 0 1 1 10 0C12 8.5 7 13 7 13zM7 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
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
  return CATEGORY_ICON_PATHS["default"];
}

// OpenFreeMap tile style URLs (matching search map)
const OPENFREEMAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";

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
  const wrapper = document.createElement("div");
  wrapper.className =
    "group w-14 h-14 flex items-center justify-center cursor-pointer";

  // Inner visual marker - scales on hover via group-hover
  const container = document.createElement("div");
  container.className =
    "w-10 h-10 bg-on-surface rounded-full shadow-ambient-lg flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-110";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "white");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  // Home icon paths
  const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path1.setAttribute("d", "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z");

  const polyline = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline"
  );
  polyline.setAttribute("points", "9 22 9 12 15 12 15 22");

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
function createPOIMarkerVisual(category: string): HTMLDivElement {
  const colors = getCategoryColors(category);
  const iconPath = getCategoryIconPath(category);

  // Inner visual marker - scales on hover via group-hover
  const container = document.createElement("div");
  container.className =
    "w-8 h-8 rounded-full shadow-ambient flex items-center justify-center border-2 transition-all duration-200 ease-out group-hover:scale-110 group-active:scale-95";
  container.style.backgroundColor = colors.markerBg;
  container.style.borderColor = colors.markerBorder;

  // Create SVG icon inside the marker
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", colors.markerBorder);
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", iconPath);
  svg.appendChild(path);
  container.appendChild(svg);

  return container;
}

function getCategoryLabel(category: string): string {
  return category.replace(/-/g, " ");
}

function getMarkerAriaLabel(place: NearbyPlace): string {
  return `${place.name}, ${getCategoryLabel(place.category)}, ${place.distanceMiles.toFixed(1)} miles away`;
}

function buildPopupHtml(place: NearbyPlace): string {
  const categoryColors = getCategoryColors(place.category);

  return `
    <div class="nearby-popup-content">
      <div class="nearby-popup-category">
        <span class="nearby-popup-category-dot" style="background-color: ${categoryColors.markerBorder}"></span>
        ${escapeHtml(getCategoryLabel(place.category))}
      </div>
      <div class="nearby-popup-name">${escapeHtml(place.name)}</div>
      <div class="nearby-popup-address">${escapeHtml(place.address)}</div>
      <div class="nearby-popup-distance">${place.distanceMiles.toFixed(1)} mi away</div>
      <a class="nearby-popup-directions" href="https://www.google.com/maps/dir/?api=1&destination=${place.location.lat},${place.location.lng}" target="_blank" rel="noopener noreferrer">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
        Get directions
      </a>
    </div>
  `;
}

function applyMarkerHighlight(
  element: HTMLDivElement,
  isHighlighted: boolean
): void {
  element.classList.toggle("highlighted", isHighlighted);
}

function renderPOIMarkerElement(
  element: HTMLDivElement,
  place: NearbyPlace,
  isHighlighted: boolean
): void {
  element.className =
    "group w-12 h-12 flex items-center justify-center cursor-pointer poi-marker focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2";
  element.dataset.placeId = place.id;
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", getMarkerAriaLabel(place));
  element.replaceChildren(createPOIMarkerVisual(place.category));
  applyMarkerHighlight(element, isHighlighted);
}

function getSafeAreaInsetBottom(): number {
  if (typeof document === "undefined" || !document.body) {
    return 0;
  }

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.bottom = "0";
  probe.style.paddingBottom = "env(safe-area-inset-bottom)";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);

  const safeAreaInsetBottom =
    Number.parseFloat(window.getComputedStyle(probe).paddingBottom) || 0;

  probe.remove();
  return safeAreaInsetBottom;
}

type MarkerSnapshot = {
  lat: number;
  lng: number;
  name: string;
  address: string;
  category: string;
  distanceMiles: number;
};

type MarkerRegistryEntry = {
  element: HTMLDivElement;
  marker: maplibregl.Marker;
  popup: maplibregl.Popup;
  snapshot: MarkerSnapshot;
};

function createMarkerSnapshot(place: NearbyPlace): MarkerSnapshot {
  return {
    lat: place.location.lat,
    lng: place.location.lng,
    name: place.name,
    address: place.address,
    category: place.category,
    distanceMiles: place.distanceMiles,
  };
}

function hasMarkerSnapshotChanged(
  previousSnapshot: MarkerSnapshot,
  nextSnapshot: MarkerSnapshot
): boolean {
  return (
    previousSnapshot.lat !== nextSnapshot.lat ||
    previousSnapshot.lng !== nextSnapshot.lng ||
    previousSnapshot.name !== nextSnapshot.name ||
    previousSnapshot.address !== nextSnapshot.address ||
    previousSnapshot.category !== nextSnapshot.category ||
    previousSnapshot.distanceMiles !== nextSnapshot.distanceMiles
  );
}

interface NearbyPlacesMapProps {
  listingLat: number;
  listingLng: number;
  places: NearbyPlace[];
  className?: string;
  highlightedPlaceId?: string | null;
  isPaneInteractive?: boolean;
  externalBottomOverlayRef?: RefObject<HTMLElement | null>;
}

export default function NearbyPlacesMap({
  listingLat,
  listingLng,
  places,
  className = "",
  highlightedPlaceId,
  isPaneInteractive = true,
  externalBottomOverlayRef,
}: NearbyPlacesMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerRegistryEntry>>(new Map());
  const listingMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hasFitBoundsRef = useRef<boolean>(false);
  // Ref to hold the latest updateMarkers callback so async initMap can
  // trigger initial marker creation after the map is ready.
  const updateMarkersRef = useRef<((p: NearbyPlace[]) => void) | null>(null);
  // Ref to latest places so async initMap can read them after await
  const placesRef = useRef<NearbyPlace[]>(places);
  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  // Single warm theme — always use light map style

  const resizeMap = useCallback(() => {
    const map = mapRef.current as (maplibregl.Map & { resize?: () => void }) | null;
    if (typeof map?.resize === "function") {
      map.resize();
    }
  }, []);

  const clearMarkerRegistry = useCallback(() => {
    markersRef.current.forEach((entry) => {
      entry.marker.remove();
    });
    markersRef.current.clear();
  }, []);

  const toggleMarkerPopup = useCallback((entry: MarkerRegistryEntry) => {
    const markerWithToggle = entry.marker as maplibregl.Marker & {
      togglePopup?: () => maplibregl.Marker;
    };

    if (typeof markerWithToggle.togglePopup === "function") {
      markerWithToggle.togglePopup();
      return;
    }

    if (entry.popup.isOpen()) {
      entry.popup.remove();
      return;
    }

    if (mapRef.current) {
      entry.popup.addTo(mapRef.current);
    }
  }, []);

  const getFitBoundsPadding = useCallback(() => {
    const fallbackPadding = 24;
    const mapContainer = mapContainerRef.current;
    const safeAreaInsetBottom = getSafeAreaInsetBottom();
    const padding = {
      top: fallbackPadding,
      right: fallbackPadding,
      bottom: fallbackPadding + safeAreaInsetBottom,
      left: fallbackPadding,
    };

    if (!mapContainer) {
      return padding;
    }

    const containerRect = mapContainer.getBoundingClientRect();
    const controlsRect = controlsRef.current?.getBoundingClientRect();
    const overlayRect = externalBottomOverlayRef?.current?.getBoundingClientRect();

    if (controlsRect && controlsRef.current?.getClientRects().length) {
      padding.right = Math.max(
        padding.right,
        Math.max(0, containerRect.right - controlsRect.left) + fallbackPadding
      );
      padding.bottom = Math.max(
        padding.bottom,
        Math.max(0, containerRect.bottom - controlsRect.top) +
          fallbackPadding +
          safeAreaInsetBottom
      );
    }

    if (overlayRect && externalBottomOverlayRef?.current?.getClientRects().length) {
      padding.bottom = Math.max(
        padding.bottom,
        Math.max(0, containerRect.bottom - overlayRect.top) +
          fallbackPadding +
          safeAreaInsetBottom
      );
    }

    return padding;
  }, [externalBottomOverlayRef]);

  const fitMapToPlaces = useCallback(
    (nextPlaces: NearbyPlace[], duration: number) => {
      const map = mapRef.current;
      if (!map || nextPlaces.length === 0) {
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([listingLng, listingLat]);
      nextPlaces.forEach((place) => {
        bounds.extend([place.location.lng, place.location.lat]);
      });

      map.fitBounds(bounds, {
        padding: getFitBoundsPadding(),
        maxZoom: 15,
        duration,
      });
    },
    [getFitBoundsPadding, listingLat, listingLng]
  );

  // Update POI markers when places change
  const updateMarkers = useCallback(
    (newPlaces: NearbyPlace[]) => {
      const map = mapRef.current;
      if (!map) return;

      const existingMarkerMap = markersRef.current;
      const newPlaceIds = new Set(newPlaces.map((p) => p.id));

      Array.from(existingMarkerMap.entries()).forEach(([placeId, entry]) => {
        if (!newPlaceIds.has(placeId)) {
          entry.marker.remove();
          existingMarkerMap.delete(placeId);
        }
      });

      newPlaces.forEach((place) => {
        const snapshot = createMarkerSnapshot(place);
        const existingEntry = existingMarkerMap.get(place.id);

        if (!existingEntry) {
          const markerEl = document.createElement("div");
          const popup = new maplibregl.Popup({
            offset: 25,
            closeButton: false,
            className: "nearby-popup",
          }).setHTML(buildPopupHtml(place));

          const marker = new maplibregl.Marker({ element: markerEl })
            .setLngLat([place.location.lng, place.location.lat])
            .setPopup(popup)
            .addTo(map);

          const entry: MarkerRegistryEntry = {
            element: markerEl,
            marker,
            popup,
            snapshot,
          };

          markerEl.onkeydown = (event: KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleMarkerPopup(entry);
            }
          };

          renderPOIMarkerElement(
            markerEl,
            place,
            place.id === highlightedPlaceId
          );
          existingMarkerMap.set(place.id, entry);
          return;
        }

        if (hasMarkerSnapshotChanged(existingEntry.snapshot, snapshot)) {
          existingEntry.marker.setLngLat([place.location.lng, place.location.lat]);
          existingEntry.popup.setHTML(buildPopupHtml(place));
          existingEntry.snapshot = snapshot;
          renderPOIMarkerElement(
            existingEntry.element,
            place,
            place.id === highlightedPlaceId
          );
          return;
        }

        applyMarkerHighlight(
          existingEntry.element,
          place.id === highlightedPlaceId
        );
      });

      if (newPlaces.length === 0) {
        hasFitBoundsRef.current = false;
        return;
      }

      if (!hasFitBoundsRef.current) {
        fitMapToPlaces(newPlaces, 0);
        hasFitBoundsRef.current = true;
      }
    },
    [fitMapToPlaces, highlightedPlaceId, toggleMarkerPopup]
  );

  // Keep ref in sync so initMap can call it after async map creation
  useEffect(() => {
    updateMarkersRef.current = updateMarkers;
  }, [updateMarkers]);

  // Initialize map with OpenFreeMap Liberty tiles (matching search map)
  // Fetch style as JSON and ensure projection is set to avoid MapLibre TypeError
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      let style: string | maplibregl.StyleSpecification =
        OPENFREEMAP_STYLE_LIGHT;
      try {
        const res = await fetch(OPENFREEMAP_STYLE_LIGHT);
        if (res.ok) {
          const json = await res.json();
          if (!json.projection) {
            json.projection = { type: "mercator" };
          }
          style = json as maplibregl.StyleSpecification;
        }
      } catch {
        // Fall back to URL string if fetch fails
      }
      if (cancelled || !mapContainerRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style,
        center: [listingLng, listingLat],
        zoom: 14,
      });

      mapRef.current = map;

      // Now that the map is ready, create markers for any places that
      // were passed on initial render (the places useEffect already
      // ran and returned early because mapRef was null at that point).
      updateMarkersRef.current?.(placesRef.current);

      // Wait for map to load before adding markers
      map.on("load", () => {
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
        resizeMap();
        updateMarkersRef.current?.(placesRef.current);
      });

      // Handle any map errors
      map.on("error", (e) => {
        console.error("Map error:", e.error?.message || e);
      });
    };

    initMap();

    return () => {
      cancelled = true;
      clearMarkerRegistry();
      listingMarkerRef.current?.remove();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      listingMarkerRef.current = null;
      hasFitBoundsRef.current = false; // Reset for new map instance
    };
  }, [clearMarkerRegistry, listingLat, listingLng, resizeMap]); // Re-create map when coordinates change

  // Update markers when places change
  useEffect(() => {
    updateMarkers(places);
  }, [places, updateMarkers]);

  // Highlight marker when hovering on list item
  useEffect(() => {
    markersRef.current.forEach((entry, placeId) => {
      applyMarkerHighlight(entry.element, placeId === highlightedPlaceId);
    });
  }, [highlightedPlaceId]);

  useEffect(() => {
    const mapContainer = mapContainerRef.current;
    if (!mapContainer) {
      return;
    }

    const handleResize = () => {
      resizeMap();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resizeMap();
      }
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            handleResize();
          });

    resizeObserver?.observe(mapContainer);
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [resizeMap]);

  useEffect(() => {
    if (isPaneInteractive) {
      resizeMap();
    }
  }, [isPaneInteractive, resizeMap]);

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
    fitMapToPlaces(places, 500);
  };

  return (
    <div className={`relative h-full ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Custom Floating Controls — glass-pill style matching search map */}
      <div
        ref={controlsRef}
        className="absolute bottom-24 lg:bottom-6 right-4 z-[400] flex flex-col gap-2"
      >
        <button
          type="button"
          onClick={handleZoomIn}
          className="
            min-w-[44px] min-h-[44px]
            bg-white/90 backdrop-blur-md
            rounded-full shadow-ambient border border-outline-variant/20/50
            flex items-center justify-center
            text-on-surface-variant
            hover:bg-surface-container-lowest
            active:scale-95
            transition-all duration-200
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2
          "
          aria-label="Zoom in"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="
            min-w-[44px] min-h-[44px]
            bg-white/90 backdrop-blur-md
            rounded-full shadow-ambient border border-outline-variant/20/50
            flex items-center justify-center
            text-on-surface-variant
            hover:bg-surface-container-lowest
            active:scale-95
            transition-all duration-200
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2
          "
          aria-label="Zoom out"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleResetView}
          className="
            min-w-[44px] min-h-[44px]
            bg-on-surface/90 backdrop-blur-md
            rounded-full shadow-ambient
            flex items-center justify-center
            text-white
            hover:bg-on-surface
            active:scale-95
            transition-all duration-200
            mt-1
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2
          "
          aria-label="Reset to listing location"
        >
          <Navigation className="w-4 h-4" />
        </button>
        {places.length > 0 && (
          <button
            type="button"
            onClick={handleFitAllMarkers}
            className="
              min-w-[44px] min-h-[44px]
              bg-white/90 backdrop-blur-md
              rounded-full shadow-ambient border border-outline-variant/20/50
              flex items-center justify-center
              text-on-surface-variant
              hover:bg-surface-container-lowest
              active:scale-95
              transition-all duration-200
              mt-1
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2
            "
            aria-label="Fit all markers in view"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Radar branding — OpenFreeMap/OSM attribution handled by MapLibre attributionControl */}
      <RadarAttribution />
    </div>
  );
}
