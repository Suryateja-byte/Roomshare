/**
 * Tests for v2 map stale data protection and nearMatches desync fixes.
 *
 * Issue A: MAP_RELEVANT_KEYS was missing "nearMatches", causing list/map desync.
 * Issue B: V2MapDataSetter wasn't passing dataVersion, bypassing stale data guard.
 */

import { renderHook, act } from "@testing-library/react";
import React from "react";
import {
  SearchV2DataProvider,
  useSearchV2Data,
} from "@/contexts/SearchV2DataContext";
import type { V2MapData } from "@/contexts/SearchV2DataContext";
import { buildPublicAvailability } from "@/lib/search/public-availability";

// ── Issue A: MAP_RELEVANT_KEYS includes nearMatches ──

describe("MAP_RELEVANT_KEYS includes nearMatches", () => {
  it("should include nearMatches in map-relevant params", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../components/PersistentMapWrapper.tsx"),
      "utf-8"
    );
    const keysMatch = source.match(
      /MAP_RELEVANT_KEYS\s*=\s*\[([\s\S]*?)\]\s*as\s*const/
    );
    expect(keysMatch).not.toBeNull();
    expect(keysMatch![1]).toContain('"nearMatches"');
  });
});

// ── Issue B: V2MapDataSetter does NOT pass dataVersion (fix #135) ──
//
// P2-FIX (#135): Don't pass dataVersion - page.tsx data is always fresh for current URL.
// Passing dataVersion caused race condition: when URL changes, context's effect increments
// dataVersionRef immediately but state update is batched. This effect would then pass
// the OLD version (from state) which gets rejected because ref already has new version.
// Version checking is only needed for async responses, not synchronous page props.

describe("V2MapDataSetter source does NOT pass dataVersion", () => {
  it("should call setV2MapData with data only (no dataVersion)", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../components/search/V2MapDataSetter.tsx"),
      "utf-8"
    );
    // Verify setV2MapData is called WITHOUT dataVersion argument
    expect(source).toMatch(/setV2MapData\(data\)/);
    // Should NOT have dataVersion in the setV2MapData call
    expect(source).not.toMatch(/setV2MapData\(data,\s*dataVersion\)/);
    // PERF-H2: V2MapDataSetter now uses useSearchV2Setters() (setter-only context)
    // to avoid re-renders when v2MapData/isV2Enabled/dataVersion state changes.
    expect(source).toMatch(/useSearchV2Setters\(\)/);
  });
});

// ── Issue B: Version guard rejects stale data ──

describe("SearchV2DataContext version guard", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SearchV2DataProvider>{children}</SearchV2DataProvider>
  );

  const testData: V2MapData = {
    geojson: { type: "FeatureCollection", features: [] },
    mode: "geojson",
  };

  it("should accept data when version matches current", () => {
    const { result } = renderHook(() => useSearchV2Data(), { wrapper });

    act(() => {
      result.current.setV2MapData(testData, 0);
    });

    expect(result.current.v2MapData).toEqual(testData);
  });

  it("should reject data when version does not match", () => {
    const { result } = renderHook(() => useSearchV2Data(), { wrapper });

    // Set valid data first
    act(() => {
      result.current.setV2MapData(testData, 0);
    });
    expect(result.current.v2MapData).toEqual(testData);

    // Try stale version
    const staleData: V2MapData = {
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [0, 0] },
            properties: {
              id: "stale-1",
              title: "Stale",
              price: 100,
              image: null,
              availableSlots: 1,
              publicAvailability: buildPublicAvailability({
                availableSlots: 1,
                totalSlots: 1,
              }),
              ownerId: "u1",
            },
          },
        ],
      },
      mode: "geojson",
    };

    act(() => {
      result.current.setV2MapData(staleData, 999);
    });

    // Should still have original data
    expect(result.current.v2MapData).toEqual(testData);
  });

  it("should accept data when no version provided (backward compat)", () => {
    const { result } = renderHook(() => useSearchV2Data(), { wrapper });

    act(() => {
      result.current.setV2MapData(testData);
    });

    expect(result.current.v2MapData).toEqual(testData);
  });

  it("preserves host-managed publicAvailability blocks unchanged in stored map data", () => {
    const { result } = renderHook(() => useSearchV2Data(), { wrapper });
    const hostManagedAvailability = buildPublicAvailability({
      availabilitySource: "HOST_MANAGED",
      openSlots: 2,
      totalSlots: 4,
      availableFrom: "2026-06-01",
      availableUntil: "2026-12-01",
      minStayMonths: 3,
      lastConfirmedAt: "2026-04-15T12:30:00.000Z",
    });
    const hostManagedMapData: V2MapData = {
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [-122.4194, 37.7749],
            },
            properties: {
              id: "host-1",
              title: "Host Managed",
              price: 1400,
              image: null,
              availableSlots: 2,
              publicAvailability: hostManagedAvailability,
            },
          },
        ],
      },
      pins: [
        {
          id: "host-1",
          lat: 37.7749,
          lng: -122.4194,
          price: 1400,
          publicAvailability: hostManagedAvailability,
        },
      ],
      mode: "pins",
    };

    act(() => {
      result.current.setV2MapData(hostManagedMapData);
    });

    expect(
      result.current.v2MapData?.geojson.features[0].properties.publicAvailability
    ).toEqual(hostManagedAvailability);
    expect(result.current.v2MapData?.pins?.[0].publicAvailability).toEqual(
      hostManagedAvailability
    );
  });
});

// ── Issue C: SearchMapUIProvider wired in SearchLayoutView ──

describe("SearchLayoutView includes SearchMapUIProvider", () => {
  it("should import and use SearchMapUIProvider", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../components/SearchLayoutView.tsx"),
      "utf-8"
    );
    expect(source).toContain("SearchMapUIProvider");
    expect(source).toMatch(/<SearchMapUIProvider/);
  });
});
