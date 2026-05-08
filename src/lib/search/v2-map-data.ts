import type { MapListingData } from "@/lib/data";
import type { SearchV2Map } from "./types";
import type { GroupContextPresentation } from "@/lib/search-types";
import { toPublicCoordinates } from "./public-coordinates";

const PUBLIC_GROUP_KEY_PREFIX = "pg1_";

function isPublicGroupContext(
  groupContext: GroupContextPresentation | null | undefined
): groupContext is GroupContextPresentation {
  return (
    !!groupContext &&
    typeof groupContext.contextKey === "string" &&
    groupContext.contextKey.startsWith(PUBLIC_GROUP_KEY_PREFIX)
  );
}

export function searchV2MapToListings(mapData: SearchV2Map): MapListingData[] {
  const pinTierMap = new Map<string, "primary" | "mini">();
  if (mapData.pins) {
    for (const pin of mapData.pins) {
      if (pin.tier) {
        pinTierMap.set(pin.id, pin.tier);
      }
    }
  }

  return mapData.geojson.features.reduce<MapListingData[]>(
    (listings, feature) => {
      const coordinates = feature.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return listings;
      }

      const [lng, lat] = coordinates;
      if (
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return listings;
      }

      const publicCoordinates = toPublicCoordinates({ lat, lng });
      const publicAvailability = feature.properties.publicAvailability;

      listings.push({
        id: feature.properties.id,
        title: feature.properties.title ?? "",
        price: Math.max(0, feature.properties.price ?? 0),
        availableSlots: publicAvailability.openSlots,
        totalSlots: publicAvailability.totalSlots,
        images: feature.properties.image ? [feature.properties.image] : [],
        location: {
          lat: publicCoordinates.lat,
          lng: publicCoordinates.lng,
        },
        publicAvailability,
        groupKey: null,
        groupSummary: null,
        groupContext: isPublicGroupContext(feature.properties.groupContext)
          ? feature.properties.groupContext
          : null,
        tier: pinTierMap.get(feature.properties.id),
      });

      return listings;
    },
    []
  );
}
