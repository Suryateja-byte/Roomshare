/**
 * Unit tests for the module-scope map style + camera caches that keep the
 * /search map's remount (e.g. returning from a listing detail page, which
 * unmounts the whole /search layout) flash-free and viewport-stable.
 *
 * Each test re-imports the module via jest.resetModules() so the module-scope
 * state does not leak between cases.
 */

import type { StyleSpecification } from "maplibre-gl";

const makeStyle = (name: string): StyleSpecification =>
  ({ version: 8, name, sources: {}, layers: [] }) as StyleSpecification;

describe("style-cache", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe("resolved style cache", () => {
    it("returns null before any style is cached", async () => {
      const mod = await import("@/lib/maps/style-cache");
      expect(mod.getCachedLightStyle()).toBeNull();
      expect(mod.getCachedDarkStyle()).toBeNull();
    });

    it("round-trips light and dark styles independently", async () => {
      const mod = await import("@/lib/maps/style-cache");
      const light = makeStyle("light");
      const dark = makeStyle("dark");

      mod.setCachedLightStyle(light);
      expect(mod.getCachedLightStyle()).toBe(light);
      expect(mod.getCachedDarkStyle()).toBeNull();

      mod.setCachedDarkStyle(dark);
      expect(mod.getCachedDarkStyle()).toBe(dark);
      expect(mod.getCachedLightStyle()).toBe(light);
    });
  });

  describe("boundsSignatureFromParams", () => {
    it("returns null when any bound param is missing", async () => {
      const { boundsSignatureFromParams } = await import(
        "@/lib/maps/style-cache"
      );
      expect(
        boundsSignatureFromParams(
          new URLSearchParams("minLat=1&maxLat=2&minLng=3")
        )
      ).toBeNull();
    });

    it("returns null when a bound param is non-finite", async () => {
      const { boundsSignatureFromParams } = await import(
        "@/lib/maps/style-cache"
      );
      expect(
        boundsSignatureFromParams(
          new URLSearchParams("minLat=abc&maxLat=2&minLng=3&maxLng=4")
        )
      ).toBeNull();
    });

    it("quantizes to 3 decimals so near-equal bounds share a signature", async () => {
      const { boundsSignatureFromParams } = await import(
        "@/lib/maps/style-cache"
      );
      const a = new URLSearchParams(
        "minLat=37.70001&maxLat=37.80000&minLng=-122.50000&maxLng=-122.40000"
      );
      const b = new URLSearchParams(
        "minLat=37.70004&maxLat=37.80000&minLng=-122.50000&maxLng=-122.40000"
      );
      expect(boundsSignatureFromParams(a)).toBe(boundsSignatureFromParams(b));
    });

    it("matches the raw-bounds signature (write-side vs read-side parity)", async () => {
      const { boundsSignature, boundsSignatureFromParams } = await import(
        "@/lib/maps/style-cache"
      );
      // Write side: the map's live bounds at moveEnd (minLat, maxLat, minLng, maxLng).
      const writeKey = boundsSignature(37.7012, 37.8009, -122.5031, -122.4002);
      // Read side: those same bounds as the search URL serializes them at 3 decimals.
      const readKey = boundsSignatureFromParams(
        new URLSearchParams(
          "minLat=37.701&maxLat=37.801&minLng=-122.503&maxLng=-122.400"
        )
      );
      expect(readKey).toBe(writeKey);
    });
  });

  describe("camera cache", () => {
    const camera = {
      longitude: -122.45,
      latitude: 37.75,
      zoom: 14.2,
      bearing: 0,
      pitch: 0,
    };

    it("returns null on a key miss and the snapshot on a key match", async () => {
      const { setCachedCamera, getCachedCamera } = await import(
        "@/lib/maps/style-cache"
      );
      setCachedCamera("key-a", camera);
      expect(getCachedCamera("key-a")).toEqual(camera);
      expect(getCachedCamera("key-b")).toBeNull();
    });

    it("only retains the most recently set key (new viewport supersedes old)", async () => {
      const { setCachedCamera, getCachedCamera } = await import(
        "@/lib/maps/style-cache"
      );
      setCachedCamera("key-a", camera);
      const moved = { ...camera, zoom: 10 };
      setCachedCamera("key-b", moved);
      expect(getCachedCamera("key-a")).toBeNull();
      expect(getCachedCamera("key-b")).toEqual(moved);
    });
  });
});
