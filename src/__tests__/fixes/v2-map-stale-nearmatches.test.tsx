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

// ── Issue A: MAP_RELEVANT_KEYS includes nearMatches ──

describe("MAP_RELEVANT_KEYS includes nearMatches", () => {
  it("should include nearMatches in map-relevant params", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../components/PersistentMapWrapper.tsx"),
      "utf-8",
    );
    const keysMatch = source.match(
      /MAP_RELEVANT_KEYS\s*=\s*\[([\s\S]*?)\]\s*as\s*const/,
    );
    expect(keysMatch).not.toBeNull();
    expect(keysMatch![1]).toContain('"nearMatches"');
  });
});

// ── Issue B: V2MapDataSetter passes dataVersion ──

describe("V2MapDataSetter source passes dataVersion", () => {
  it("should call setV2MapData with data and dataVersion", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../components/search/V2MapDataSetter.tsx",
      ),
      "utf-8",
    );
    // Verify setV2MapData is called with dataVersion argument
    expect(source).toMatch(/setV2MapData\(data,\s*dataVersion\)/);
    // Verify dataVersion is destructured from useSearchV2Data
    expect(source).toContain("dataVersion");
    expect(source).toMatch(/useSearchV2Data\(\)/);
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
      geojson: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { id: "stale-1", title: "Stale", price: 100, image: null, availableSlots: 1, ownerId: "u1" } }] },
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
});

// ── Issue C: SearchMapUIProvider wired in SearchLayoutView ──

describe("SearchLayoutView includes SearchMapUIProvider", () => {
  it("should import and use SearchMapUIProvider", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../components/SearchLayoutView.tsx"),
      "utf-8",
    );
    expect(source).toContain("SearchMapUIProvider");
    expect(source).toMatch(/<SearchMapUIProvider/);
  });
});
