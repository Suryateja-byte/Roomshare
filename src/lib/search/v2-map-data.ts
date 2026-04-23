import type { MapListingData } from "@/lib/data";
import { sanitizeMapListings } from "@/lib/maps/sanitize-map-listings";
import type { SearchV2Map } from "./types";

export function searchV2MapToListings(mapData: SearchV2Map): MapListingData[] {
  const pinTierMap = new Map<string, "primary" | "mini">();
  if (mapData.pins) {
    for (const pin of mapData.pins) {
      if (pin.tier) {
        pinTierMap.set(pin.id, pin.tier);
      }
    }
  }

  return sanitizeMapListings(
    mapData.geojson.features
      .filter((feature) => {
        const coordinates = feature.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          return false;
        }

        const [lng, lat] = coordinates;
        return (
          Number.isFinite(lng) &&
          Number.isFinite(lat) &&
          lat >= -90 &&
          lat <= 90 &&
          lng >= -180 &&
          lng <= 180
        );
      })
      .map((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        return {
          id: feature.properties.id,
          title: feature.properties.title ?? "",
          price: feature.properties.price,
          availableSlots: feature.properties.availableSlots,
          publicAvailability: feature.properties.publicAvailability,
          groupContext: feature.properties.groupContext ?? null,
          images: feature.properties.image ? [feature.properties.image] : [],
          location: { lng, lat },
          tier: pinTierMap.get(feature.properties.id),
        };
      })
  );
}
