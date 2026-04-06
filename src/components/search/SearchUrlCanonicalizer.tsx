"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deriveSearchBoundsFromPoint } from "@/lib/search/location-bounds";

function parseFiniteCoordinate(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function SearchUrlCanonicalizer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const lat = parseFiniteCoordinate(params.get("lat"));
    const lng = parseFiniteCoordinate(params.get("lng"));
    const hasPointCoords = lat !== null && lng !== null;
    let shouldReplace = false;

    if (hasPointCoords && !params.has("where")) {
      const legacyLocationLabel = params.get("q")?.trim();
      if (legacyLocationLabel) {
        params.set("where", legacyLocationLabel);
        params.delete("q");
        shouldReplace = true;
      }
    }

    if (
      hasPointCoords &&
      (!params.has("minLng") ||
        !params.has("minLat") ||
        !params.has("maxLng") ||
        !params.has("maxLat"))
    ) {
      const bounds = deriveSearchBoundsFromPoint(lat, lng);
      params.set("minLng", bounds[0].toString());
      params.set("minLat", bounds[1].toString());
      params.set("maxLng", bounds[2].toString());
      params.set("maxLat", bounds[3].toString());
      shouldReplace = true;
    }

    if (!shouldReplace) {
      return;
    }

    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParamsString]);

  return null;
}

export default SearchUrlCanonicalizer;
