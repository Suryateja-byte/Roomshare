/**
 * Contract tests for the vendored basemap artifact
 * (public/map-styles/liberty-paper.json, written by
 * scripts/generate-map-style.ts).
 *
 * These read the committed file — no network. They fail if someone edits
 * the artifact by hand in a way that breaks runtime assumptions, or if a
 * regeneration slips past the generator's own validation.
 */

import fs from "fs";
import path from "path";
import {
  REQUIRED_BASEMAP_LAYER_IDS,
  ALLOWED_REMOTE_HOSTS,
} from "@/lib/maps/map-style-contract";
import { PAPER_BASEMAP } from "@/lib/maps/map-theme";
import { sanitizeStyleSpecification } from "@/lib/maps/style-sanitize";

const ARTIFACT_PATH = path.join(
  process.cwd(),
  "public",
  "map-styles",
  "liberty-paper.json"
);

interface StyleLayer {
  id: string;
  type?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

interface StyleSpec {
  version: number;
  glyphs?: string;
  sprite?: string;
  sources: Record<
    string,
    { url?: string; tiles?: string[]; [key: string]: unknown }
  >;
  layers: StyleLayer[];
  metadata?: Record<string, unknown>;
}

function collectRemoteUrls(style: StyleSpec): string[] {
  const urls: string[] = [];
  if (style.glyphs) urls.push(style.glyphs);
  if (style.sprite) urls.push(style.sprite);
  for (const source of Object.values(style.sources)) {
    if (typeof source.url === "string") urls.push(source.url);
    if (Array.isArray(source.tiles)) {
      urls.push(...source.tiles.filter((t): t is string => typeof t === "string"));
    }
  }
  return urls.filter((url) => /^https?:\/\//.test(url));
}

describe("liberty-paper.json artifact contract", () => {
  const style: StyleSpec = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));

  it("is a version 8 style with layers", () => {
    expect(style.version).toBe(8);
    expect(style.layers.length).toBeGreaterThan(50);
  });

  it("carries the generator provenance stamp", () => {
    expect(style.metadata?.["roomshare:generator"]).toBe(
      "scripts/generate-map-style.ts"
    );
  });

  it("contains every layer id the app toggles at runtime (POILayer contract)", () => {
    const layerIds = new Set(style.layers.map((layer) => layer.id));
    for (const id of REQUIRED_BASEMAP_LAYER_IDS) {
      expect(layerIds).toContain(id);
    }
  });

  it("references only allowlisted remote hosts (tiles/glyphs/sprites)", () => {
    const urls = collectRemoteUrls(style);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      const host = new URL(url).host;
      expect(ALLOWED_REMOTE_HOSTS).toContain(host);
    }
  });

  it("contains no invalid nested-zoom text-size expressions (pre-sanitized)", () => {
    // The sanitizer returns the same reference when nothing needs fixing.
    expect(sanitizeStyleSpecification(style)).toBe(style);
  });

  it("has the Warm Editorial Paper theme applied", () => {
    const background = style.layers.find((layer) => layer.id === "background");
    expect(background?.paint?.["background-color"]).toBe(PAPER_BASEMAP.land);

    const water = style.layers.find((layer) => layer.id === "water");
    expect(water?.paint?.["fill-color"]).toBe(PAPER_BASEMAP.water);

    const minorRoad = style.layers.find((layer) => layer.id === "road_minor");
    expect(minorRoad?.paint?.["line-color"]).toBe(PAPER_BASEMAP.roadWhite);
  });

  it("hides non-interstate highway shields", () => {
    for (const id of ["highway-shield-non-us", "road_shield_us"]) {
      const layer = style.layers.find((l) => l.id === id);
      expect(layer?.layout?.visibility).toBe("none");
    }
  });

  it("never overrides GL text fonts (glyph fontstack constraint)", () => {
    // Every text-font in the artifact must be an upstream Noto stack —
    // the generator is forbidden from mutating fonts, and hand edits
    // introducing custom fonts would 404 against the glyph server.
    for (const layer of style.layers) {
      const font = layer.layout?.["text-font"];
      if (!font) continue;
      for (const stack of font as string[]) {
        expect(stack).toMatch(/^Noto Sans/);
      }
    }
  });
});
