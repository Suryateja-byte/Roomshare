/**
 * Neighborhood Intelligence Analytics
 *
 * Privacy-safe event tracking for the Neighborhood Intelligence feature.
 * Events are sent to /api/metrics with HMAC-protected listing IDs.
 *
 * Events:
 * - neighborhood_query: User searches for nearby places
 * - neighborhood_radius_expanded: Search radius was automatically expanded
 * - neighborhood_place_clicked: User clicked on a place in the list/map
 * - neighborhood_map_interacted: User interacted with the map (pan, zoom, click)
 * - neighborhood_pro_upgrade_clicked: User clicked on upgrade CTA
 */

// Session ID for grouping events (generated once per page load)
let sessionId: string | null = null;

function getSessionId(): string {
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return sessionId;
}

interface BaseEvent {
  listingId: string;
  subscriptionTier?: string | null;
}

interface QueryEvent extends BaseEvent {
  searchMode: 'type' | 'text';
  includedTypes?: string[];
  resultCount: number;
  radiusMeters: number;
  closestMiles?: number;
  farthestMiles?: number;
}

interface RadiusExpandedEvent extends BaseEvent {
  originalRadius: number;
  expandedRadius: number;
  resultCount: number;
}

interface PlaceClickedEvent extends BaseEvent {
  placeId: string;
  placeName?: string;
  placeType?: string;
  distanceMiles?: number;
  source: 'list' | 'map';
}

interface MapInteractionEvent extends BaseEvent {
  action: 'pan' | 'zoom' | 'click_poi' | 'click_ring';
  zoomLevel?: number;
}

interface ProUpgradeClickedEvent extends BaseEvent {
  context: 'cta_button' | 'blur_overlay';
  placeCount?: number;
}

type NeighborhoodEvent =
  | { type: 'neighborhood_query'; data: QueryEvent }
  | { type: 'neighborhood_radius_expanded'; data: RadiusExpandedEvent }
  | { type: 'neighborhood_place_clicked'; data: PlaceClickedEvent }
  | { type: 'neighborhood_map_interacted'; data: MapInteractionEvent }
  | { type: 'neighborhood_pro_upgrade_clicked'; data: ProUpgradeClickedEvent };

/**
 * Send event to analytics endpoint
 * Fails silently to not disrupt user experience
 */
async function sendEvent(event: NeighborhoodEvent): Promise<void> {
  try {
    // Only send in browser
    if (typeof window === 'undefined') return;

    const payload = {
      eventType: event.type,
      sid: getSessionId(),
      timestamp: Date.now(),
      ...event.data,
    };

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Neighborhood Analytics]', payload);
    }

    // In production, send to analytics endpoint
    // Using navigator.sendBeacon for reliability on page unload
    if (process.env.NODE_ENV === 'production') {
      const blob = new Blob([JSON.stringify(payload)], {
        type: 'application/json',
      });
      navigator.sendBeacon('/api/metrics/ops', blob);
    }
  } catch {
    // Fail silently - analytics should never break the app
  }
}

/**
 * Track a neighborhood search query
 */
export function trackNeighborhoodQuery(data: QueryEvent): void {
  sendEvent({
    type: 'neighborhood_query',
    data,
  });
}

/**
 * Track when search radius is automatically expanded
 */
export function trackRadiusExpanded(data: RadiusExpandedEvent): void {
  sendEvent({
    type: 'neighborhood_radius_expanded',
    data,
  });
}

/**
 * Track when user clicks on a place
 */
export function trackPlaceClicked(data: PlaceClickedEvent): void {
  sendEvent({
    type: 'neighborhood_place_clicked',
    data,
  });
}

/**
 * Track map interactions
 */
export function trackMapInteraction(data: MapInteractionEvent): void {
  sendEvent({
    type: 'neighborhood_map_interacted',
    data,
  });
}

/**
 * Track Pro upgrade CTA clicks
 */
export function trackProUpgradeClicked(data: ProUpgradeClickedEvent): void {
  sendEvent({
    type: 'neighborhood_pro_upgrade_clicked',
    data,
  });
}

export type {
  QueryEvent,
  RadiusExpandedEvent,
  PlaceClickedEvent,
  MapInteractionEvent,
  ProUpgradeClickedEvent,
};
