'use client';

/**
 * NeighborhoodModule - Container orchestrating Neighborhood Intelligence
 *
 * Manages the display of neighborhood/POI information based on subscription tier:
 *
 * Free Users:
 * - ContextBar (radius, count, distances)
 * - NearbyPlacesCard (Google Places UI Kit Shadow DOM)
 * - ProUpgradeCTA (blurred map teaser)
 *
 * Pro Users:
 * - ContextBar
 * - NeighborhoodPlaceList (custom React cards with distances)
 * - NeighborhoodMap (Mapbox with POI pins, walkability rings)
 * - PlaceDetailsPanel (slide-in details)
 * - Always: gmp-place-attribution
 */

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { isProUser } from '@/lib/subscription';
import { ContextBar } from './ContextBar';
import { ProUpgradeCTA } from './ProUpgradeCTA';
import { NeighborhoodPlaceList } from './NeighborhoodPlaceList';
import { PlaceDetailsPanel } from './PlaceDetailsPanel';
import type { POI, SearchMeta, NeighborhoodSearchResult } from '@/lib/places/types';
import {
  trackNeighborhoodQuery,
  trackPlaceClicked,
  trackProUpgradeClicked,
} from '@/lib/analytics/neighborhood';

// Type for normalized intent (matches stableNormalizedIntent from NeighborhoodChat)
interface NormalizedIntent {
  mode: 'type' | 'text';
  includedTypes?: string[];
  textQuery?: string;
}

// Lazy load the map to avoid SSR issues with Mapbox
const NeighborhoodMap = dynamic(
  () => import('./NeighborhoodMap').then((mod) => mod.NeighborhoodMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 bg-muted/50 rounded-xl animate-pulse flex items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading map...</span>
      </div>
    ),
  }
);

// Lazy load NearbyPlacesCard since it uses Google Maps
const NearbyPlacesCard = dynamic(
  () => import('@/components/chat/NearbyPlacesCard').then((mod) => mod.NearbyPlacesCard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-48 bg-muted/50 rounded-xl animate-pulse" />
    ),
  }
);

interface NeighborhoodModuleProps {
  /** Listing ID for caching */
  listingId: string;
  /** Listing center coordinates */
  listingLatLng: { lat: number; lng: number };
  /** User's subscription tier */
  subscriptionTier?: string | null;
  /** Original query text */
  queryText: string;
  /** Normalized intent from the query */
  normalizedIntent: NormalizedIntent;
  /** Search radius in meters */
  radiusMeters?: number;
  /** Optional class name */
  className?: string;
  /** Callback when search succeeds (for rate limit tracking) */
  onSearchSuccess?: () => void;
  /** Whether search is allowed (rate limit) */
  canSearch?: boolean;
  /** Remaining searches (for LLM tool invocations) */
  remainingSearches?: number;
  /** Whether multiple brands were detected in query */
  multiBrandDetected?: boolean;
}

export function NeighborhoodModule({
  listingId,
  listingLatLng,
  subscriptionTier,
  queryText,
  normalizedIntent,
  radiusMeters = 1600,
  className = '',
  onSearchSuccess,
  canSearch = true,
  remainingSearches,
  multiBrandDetected,
}: NeighborhoodModuleProps) {
  // State
  const [searchResult, setSearchResult] = useState<NeighborhoodSearchResult | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Determine if user is Pro
  const isPro = isProUser(subscriptionTier);

  // Memoize POIs and meta
  const pois = searchResult?.pois ?? [];
  const meta = searchResult?.meta ?? null;

  // Handle search results from NearbyPlacesCard
  const handleSearchResultsReady = useCallback((result: NeighborhoodSearchResult) => {
    setSearchResult(result);
    setIsLoading(false);
    setError(null);

    // Track analytics
    if (result.meta) {
      trackNeighborhoodQuery({
        listingId,
        subscriptionTier,
        searchMode: result.meta.searchMode,
        includedTypes: normalizedIntent.includedTypes,
        resultCount: result.meta.resultCount,
        radiusMeters: result.meta.radiusMeters,
        closestMiles: result.meta.closestMiles,
        farthestMiles: result.meta.farthestMiles,
      });
    }
  }, [listingId, subscriptionTier, normalizedIntent.includedTypes]);

  // Handle search error
  const handleSearchError = useCallback((err: string) => {
    setError(err);
    setIsLoading(false);
  }, []);

  // Handle POI click (Pro users only)
  const handlePoiClick = useCallback((poi: POI, source: 'list' | 'map' = 'list') => {
    setSelectedPoi(poi);

    // Track analytics
    trackPlaceClicked({
      listingId,
      subscriptionTier,
      placeId: poi.placeId,
      placeName: poi.name,
      placeType: poi.primaryType,
      distanceMiles: poi.distanceMiles,
      source,
    });
  }, [listingId, subscriptionTier]);

  // Handle POI hover (Pro users only)
  const handlePoiHover = useCallback((poi: POI | null) => {
    setHoveredPoiId(poi?.placeId ?? null);
  }, []);

  // Close details panel
  const handleCloseDetails = useCallback(() => {
    setSelectedPoi(null);
  }, []);

  // Retry search after error
  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    setRetryKey((prev) => prev + 1);
  }, []);

  // Analytics callback for upgrade CTA
  const handleUpgradeClick = useCallback(() => {
    trackProUpgradeClicked({
      listingId,
      subscriptionTier,
      context: 'cta_button',
      placeCount: pois.length,
    });
  }, [listingId, subscriptionTier, pois.length]);

  // Wrapper handlers for tracking click source
  const handleListPoiClick = useCallback((poi: POI) => {
    handlePoiClick(poi, 'list');
  }, [handlePoiClick]);

  const handleMapPoiClick = useCallback((poi: POI) => {
    handlePoiClick(poi, 'map');
  }, [handlePoiClick]);

  return (
    <div className={`relative space-y-3 ${className}`}>
      {/* Context Bar - shows for all users */}
      <ContextBar
        meta={meta}
        isLoading={isLoading}
        queryText={queryText}
      />

      {/* Error state with retry */}
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={handleRetry}
            className="shrink-0 px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
            aria-label="Retry search"
          >
            Retry
          </button>
        </div>
      )}

      {/* Free User Experience */}
      {!isPro && (
        <>
          {/* Google Places UI Kit cards (Shadow DOM) */}
          <NearbyPlacesCard
            key={`free-${retryKey}`}
            latitude={listingLatLng.lat}
            longitude={listingLatLng.lng}
            normalizedIntent={normalizedIntent}
            radiusMeters={radiusMeters}
            onSearchResultsReady={handleSearchResultsReady}
            onError={handleSearchError}
            onLoadingChange={setIsLoading}
            onSearchSuccess={onSearchSuccess}
            canSearch={canSearch}
            remainingSearches={remainingSearches}
            multiBrandDetected={multiBrandDetected}
          />

          {/* Pro Upgrade CTA with blurred map */}
          {!isLoading && pois.length > 0 && (
            <ProUpgradeCTA
              placeCount={pois.length}
              onUpgradeClick={handleUpgradeClick}
            />
          )}
        </>
      )}

      {/* Pro User Experience */}
      {isPro && (
        <>
          {/* Layout: List and Map side by side on larger screens */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Custom Place List */}
            <div className="order-2 lg:order-1">
              <NeighborhoodPlaceList
                pois={pois}
                selectedPlaceId={selectedPoi?.placeId}
                hoveredPlaceId={hoveredPoiId}
                onPlaceClick={handleListPoiClick}
                onPlaceHover={handlePoiHover}
                isLoading={isLoading}
              />
            </div>

            {/* Interactive Map */}
            <div className="order-1 lg:order-2 h-64 lg:h-auto lg:min-h-[400px]">
              <NeighborhoodMap
                center={listingLatLng}
                pois={pois}
                selectedPlaceId={selectedPoi?.placeId}
                hoveredPlaceId={hoveredPoiId}
                onPoiClick={handleMapPoiClick}
                onPoiHover={handlePoiHover}
                showWalkabilityRings={true}
              />
            </div>
          </div>

          {/* Visually hidden (not display:none) so the UI Kit still runs */}
          <div
            className="absolute left-0 top-0 h-px w-px overflow-hidden opacity-0 pointer-events-none"
            aria-hidden="true"
          >
            <NearbyPlacesCard
              key={`pro-${retryKey}`}
              latitude={listingLatLng.lat}
              longitude={listingLatLng.lng}
              normalizedIntent={normalizedIntent}
              radiusMeters={radiusMeters}
              onSearchResultsReady={handleSearchResultsReady}
              onError={handleSearchError}
              onLoadingChange={setIsLoading}
              onSearchSuccess={onSearchSuccess}
              canSearch={canSearch}
              remainingSearches={remainingSearches}
              multiBrandDetected={multiBrandDetected}
            />
          </div>

          {/* Place Details Panel (slide-in) */}
          <PlaceDetailsPanel
            poi={selectedPoi}
            onClose={handleCloseDetails}
          />
        </>
      )}

      {/* Google Places Attribution - required by ToS */}
      <div className="text-xs text-muted-foreground">
        <gmp-place-attribution></gmp-place-attribution>
      </div>
    </div>
  );
}

// Declare custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gmp-place-attribution': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

export default NeighborhoodModule;
