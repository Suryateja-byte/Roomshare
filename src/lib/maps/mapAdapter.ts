/**
 * Map Adapter Layer for MapLibre GL
 *
 * Provides a simplified interface for map operations that:
 * 1. Prevents mock sprawl in tests (test "calls adapter correctly" not MapLibre imitation)
 * 2. Enables easier switching between map libraries if needed
 * 3. Centralizes map configuration and error handling
 *
 * @see Plan stability adjustment #2: Create Map Adapter Layer
 */

import maplibregl from 'maplibre-gl';
import type { Map, Marker, Popup, LngLatBounds, MapOptions, MarkerOptions, PopupOptions } from 'maplibre-gl';

// Re-export types for consumers
export type { Map as MapInstance, Marker as MarkerInstance, Popup as PopupInstance, LngLatBounds as BoundsInstance };

// ============================================================================
// Adapter Types
// ============================================================================

export interface MapAdapterOptions {
  container: HTMLElement | string;
  style: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  attributionControl?: boolean;
}

export interface MarkerAdapterOptions {
  element?: HTMLElement;
  anchor?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  offset?: [number, number];
}

export interface PopupAdapterOptions {
  offset?: number | [number, number];
  closeButton?: boolean;
  closeOnClick?: boolean;
  className?: string;
  maxWidth?: string;
}

export interface FitBoundsOptions {
  padding?: number | { top: number; bottom: number; left: number; right: number };
  maxZoom?: number;
  duration?: number;
}

export interface FlyToOptions {
  center: [number, number];
  zoom?: number;
  duration?: number;
}

// ============================================================================
// Map Adapter Functions
// ============================================================================

/**
 * Create a new map instance
 */
export function createMap(options: MapAdapterOptions): Map {
  return new maplibregl.Map({
    container: options.container,
    style: options.style,
    center: options.center,
    zoom: options.zoom,
    attributionControl: options.attributionControl,
  });
}

/**
 * Create a new marker instance
 */
export function createMarker(options: MarkerAdapterOptions = {}): Marker {
  return new maplibregl.Marker({
    element: options.element,
    anchor: options.anchor,
    offset: options.offset,
  });
}

/**
 * Create a new popup instance
 */
export function createPopup(options: PopupAdapterOptions = {}): Popup {
  return new maplibregl.Popup({
    offset: options.offset,
    closeButton: options.closeButton,
    closeOnClick: options.closeOnClick,
    className: options.className,
    maxWidth: options.maxWidth,
  });
}

/**
 * Create a new LngLatBounds instance
 */
export function createBounds(): LngLatBounds {
  return new maplibregl.LngLatBounds();
}

/**
 * Add a marker to a map
 */
export function addMarkerToMap(marker: Marker, map: Map): Marker {
  return marker.addTo(map);
}

/**
 * Remove a marker from the map
 */
export function removeMarker(marker: Marker): void {
  marker.remove();
}

/**
 * Set marker position
 */
export function setMarkerPosition(marker: Marker, lngLat: [number, number]): Marker {
  return marker.setLngLat(lngLat);
}

/**
 * Set marker popup
 */
export function setMarkerPopup(marker: Marker, popup: Popup): Marker {
  return marker.setPopup(popup);
}

/**
 * Set popup HTML content
 */
export function setPopupContent(popup: Popup, html: string): Popup {
  return popup.setHTML(html);
}

/**
 * Fit map bounds to include all coordinates
 */
export function fitMapBounds(map: Map, bounds: LngLatBounds, options?: FitBoundsOptions): void {
  map.fitBounds(bounds, options);
}

/**
 * Extend bounds with a coordinate
 */
export function extendBounds(bounds: LngLatBounds, lngLat: [number, number]): LngLatBounds {
  return bounds.extend(lngLat);
}

/**
 * Fly the map to a location
 */
export function flyTo(map: Map, options: FlyToOptions): void {
  map.flyTo(options);
}

/**
 * Zoom in on the map
 */
export function zoomIn(map: Map): void {
  map.zoomIn();
}

/**
 * Zoom out on the map
 */
export function zoomOut(map: Map): void {
  map.zoomOut();
}

/**
 * Get current map zoom level
 */
export function getZoom(map: Map): number {
  return map.getZoom();
}

/**
 * Get current map center
 */
export function getCenter(map: Map): { lng: number; lat: number } {
  return map.getCenter();
}

/**
 * Add event listener to map
 */
export function onMapEvent(map: Map, event: string, handler: (e: unknown) => void): void {
  map.on(event as keyof maplibregl.MapEventType, handler as () => void);
}

/**
 * Remove event listener from map
 */
export function offMapEvent(map: Map, event: string, handler: (e: unknown) => void): void {
  map.off(event as keyof maplibregl.MapEventType, handler as () => void);
}

/**
 * Remove/destroy a map instance
 */
export function removeMap(map: Map): void {
  map.remove();
}

/**
 * Get marker DOM element
 */
export function getMarkerElement(marker: Marker): HTMLElement {
  return marker.getElement();
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape HTML to prevent XSS in popup content
 * Safe implementation using DOM methods
 */
export function escapeHtml(text: string): string {
  // SSR check
  if (typeof document === 'undefined') {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Adapter Object (for easier mocking in tests)
// ============================================================================

/**
 * Map adapter object providing all map operations
 * Can be mocked in tests to verify component calls adapter correctly
 */
export const mapAdapter = {
  createMap,
  createMarker,
  createPopup,
  createBounds,
  addMarkerToMap,
  removeMarker,
  setMarkerPosition,
  setMarkerPopup,
  setPopupContent,
  fitMapBounds,
  extendBounds,
  flyTo,
  zoomIn,
  zoomOut,
  getZoom,
  getCenter,
  onMapEvent,
  offMapEvent,
  removeMap,
  getMarkerElement,
  escapeHtml,
} as const;

export default mapAdapter;
