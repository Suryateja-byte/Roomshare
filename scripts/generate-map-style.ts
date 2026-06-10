/// <reference types="node" />

/**
 * generate-map-style — builds the vendored "Warm Editorial Paper" basemap.
 *
 * Fetches the upstream OpenFreeMap Liberty style, sanitizes it with the same
 * sanitizer the runtime map uses, validates the layer-id contract the app
 * depends on (POILayer visibility toggles), applies the BASEMAP_PALETTE
 * brand rules, and writes public/map-styles/liberty-paper.json.
 *
 * Usage:
 *   pnpm map:style:generate                 # fetch upstream
 *   pnpm map:style:generate --input <file>  # offline regen from a saved copy
 *
 * The output is byte-stable for a given upstream + palette (no timestamps),
 * so re-running with no changes produces an empty git diff.
 *
 * Fails loudly (exit 1, nothing written) if upstream drifts: missing
 * contract layer ids, a palette rule matching nothing, or a rule attempting
 * to mutate text-font/sources/glyphs/sprite (glyph assets only exist for
 * the hosted Noto stacks).
 */

import fs from "fs";
import path from "path";
import {
  BASEMAP_PALETTE,
  type BasemapPaletteRule,
} from "../src/lib/maps/map-theme";
import { REQUIRED_BASEMAP_LAYER_IDS } from "../src/lib/maps/map-style-contract";
import { sanitizeStyleSpecification } from "../src/lib/maps/style-sanitize";

const UPSTREAM_URL = "https://tiles.openfreemap.org/styles/liberty";
const OUTPUT_PATH = path.join(
  __dirname,
  "..",
  "public",
  "map-styles",
  "liberty-paper.json"
);

interface StyleLayer {
  id: string;
  type?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  minzoom?: number;
  [key: string]: unknown;
}

interface StyleSpec {
  version?: number;
  name?: string;
  layers?: StyleLayer[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

function fail(message: string): never {
  console.error(`[generate-map-style] FAIL: ${message}`);
  process.exit(1);
}

function ruleMatches(rule: BasemapPaletteRule, layerId: string): boolean {
  if (typeof rule.match === "string") return rule.match === layerId;
  if (Array.isArray(rule.match)) return rule.match.includes(layerId);
  return rule.match.test(layerId);
}

/** string[] matches are a strict contract: every listed id must exist. */
function validateRuleCoverage(
  rule: BasemapPaletteRule,
  layerIds: Set<string>
): string[] {
  if (typeof rule.match === "string") {
    return layerIds.has(rule.match) ? [] : [rule.match];
  }
  if (Array.isArray(rule.match)) {
    return rule.match.filter((id) => !layerIds.has(id));
  }
  for (const id of layerIds) {
    if (rule.match.test(id)) return [];
  }
  return [String(rule.match)];
}

function assertRuleIsSafe(rule: BasemapPaletteRule): void {
  if (rule.layout && "text-font" in rule.layout) {
    fail(
      `rule "${rule.name}" mutates text-font — forbidden (glyphs only exist for hosted Noto stacks)`
    );
  }
}

async function loadUpstreamStyle(inputPath: string | null): Promise<unknown> {
  if (inputPath) {
    const raw = fs.readFileSync(inputPath, "utf8");
    return JSON.parse(raw);
  }

  const response = await fetch(UPSTREAM_URL);
  if (!response.ok) {
    fail(`upstream fetch returned ${response.status} for ${UPSTREAM_URL}`);
  }
  return response.json();
}

function applyPalette(style: StyleSpec): { rulesApplied: number; layersTouched: number } {
  const layers = style.layers ?? [];
  const touched = new Set<string>();

  for (const rule of BASEMAP_PALETTE) {
    assertRuleIsSafe(rule);

    for (const layer of layers) {
      if (!ruleMatches(rule, layer.id)) continue;
      touched.add(layer.id);

      if (rule.removePaint && layer.paint) {
        for (const key of rule.removePaint) {
          delete layer.paint[key];
        }
      }
      if (rule.paint) {
        layer.paint = { ...layer.paint, ...rule.paint };
      }
      if (rule.layout) {
        layer.layout = { ...layer.layout, ...rule.layout };
      }
      if (rule.minzoom !== undefined) {
        layer.minzoom = rule.minzoom;
      }
    }
  }

  return { rulesApplied: BASEMAP_PALETTE.length, layersTouched: touched.size };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inputFlagIndex = args.indexOf("--input");
  const inputPath = inputFlagIndex >= 0 ? (args[inputFlagIndex + 1] ?? null) : null;
  if (inputFlagIndex >= 0 && !inputPath) {
    fail("--input requires a file path");
  }

  console.log(
    `[generate-map-style] source: ${inputPath ?? UPSTREAM_URL}`
  );

  const rawStyle = await loadUpstreamStyle(inputPath);
  const style = sanitizeStyleSpecification(rawStyle) as StyleSpec;

  // --- Contract validation (before any writes) ---
  if (style.version !== 8) {
    fail(`expected style version 8, got ${String(style.version)}`);
  }
  if (!Array.isArray(style.layers) || style.layers.length === 0) {
    fail("style has no layers array");
  }

  const layerIds = new Set(style.layers.map((layer) => layer.id));

  const missingRequired = REQUIRED_BASEMAP_LAYER_IDS.filter(
    (id) => !layerIds.has(id)
  );
  if (missingRequired.length > 0) {
    fail(
      `upstream is missing app-required layer ids (POILayer contract): ${missingRequired.join(", ")}`
    );
  }

  const unmatchedByRule = BASEMAP_PALETTE.map(
    (rule) =>
      [rule.name, validateRuleCoverage(rule, layerIds)] as const
  ).filter(([, missing]) => missing.length > 0);
  if (unmatchedByRule.length > 0) {
    const detail = unmatchedByRule
      .map(([name, missing]) => `  ${name}: ${missing.join(", ")}`)
      .join("\n");
    fail(`palette rules reference layer ids missing upstream:\n${detail}`);
  }

  // --- Apply theme ---
  const { rulesApplied, layersTouched } = applyPalette(style);

  style.name = "Roomshare Liberty Paper";
  style.metadata = {
    ...style.metadata,
    "roomshare:generator": "scripts/generate-map-style.ts",
    "roomshare:upstream": UPSTREAM_URL,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(style, null, 2)}\n`, "utf8");

  console.log(
    `[generate-map-style] OK: ${rulesApplied} rules themed ${layersTouched}/${style.layers.length} layers → ${path.relative(process.cwd(), OUTPUT_PATH)}`
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
