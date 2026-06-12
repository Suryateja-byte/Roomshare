// Custom event used to move the persistent search map. The map component in
// PersistentMapWrapper never remounts across search navigations, so any flow
// that changes the searched location MUST dispatch this event for the map to
// follow (see project memory: persistent map + event dispatch pattern).
export const MAP_FLY_TO_EVENT = "mapFlyToLocation";

export interface MapFlyToEventDetail {
  lat: number;
  lng: number;
  bbox?: [number, number, number, number];
  zoom?: number;
}

export function dispatchMapFlyTo(detail: MapFlyToEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<MapFlyToEventDetail>(MAP_FLY_TO_EVENT, { detail })
  );
}
