/**
 * Roomshare map theme — "Warm Editorial Paper".
 *
 * THE single source of brand color values for everything map-related:
 * GL layer paint (clusters, boundary, privacy), and the BASEMAP_PALETTE
 * rules the build-time generator (scripts/generate-map-style.ts) applies
 * to the upstream OpenFreeMap Liberty style.
 *
 * MAP_BRAND mirrors src/app/globals.css @theme — keep in sync. (CSS custom
 * properties cannot be read by GL paint expressions or a node script, so a
 * TS mirror is the pragmatic single source for map code. Tailwind class
 * strings in components must stay literal for the compiler — they reference
 * the same globals.css tokens directly.)
 *
 * Pure constants, no React — importable from node scripts and Jest.
 */

export const MAP_BRAND = {
  canvas: "#fbf9f4",
  white: "#ffffff",
  containerHigh: "#eae8e3",
  primary: "#9a4027",
  primaryContainer: "#b9583c",
  tertiary: "#904917",
  ink: "#1b1c19",
  inkVariant: "#4a4941",
  outlineVariant: "#dcc1b9",
  destructive: "#c4321c",
  success: "#2d7a3a",
  warning: "#b45309",
  info: "#1e6fa0",
} as const;

/**
 * Basemap-only neutrals derived from the brand palette. The land tone sits
 * slightly deeper than the app canvas so white UI chrome and white roads
 * both read against it; roads are LIGHTER than land (paper showing through).
 */
export const PAPER_BASEMAP = {
  land: "#f3efe5",
  landHalo: "rgba(243,239,229,0.9)", // label halos in the land tone
  landHaloSoft: "rgba(243,239,229,0.85)",
  water: "#c4d3d8",
  waterway: "#aac3c9",
  waterwayTunnel: "#c2d2d6",
  waterLabel: "#3e5560",
  park: "#dde5d2",
  parkOutline: "rgba(167,184,146,0.55)",
  parkFillOutline: "rgba(183,198,164,0.5)",
  wood: "#d5dfc6",
  grass: "#e2e8d4",
  roadWhite: "#ffffff",
  roadTrunk: "#fffdf7",
  roadMotorway: "#faf1e2", // warm parchment — differentiation by width + warmth
  casingMotorway: "#d9c9ab",
  casingTrunk: "#d9cfb8",
  casingSecondary: "#ddd5c3",
  casingMinor: "#e3ddcf",
  casingService: "#e7e1d2",
  path: "#ccc5b2",
  railMajor: "#d8d0bf",
  railTransit: "#c7bfae",
  building: "#ebe4d4",
  building3d: "#eae3d2",
  labelInk: "#1b1c19",
  labelCity: "#2f2e29",
  labelStrong: "#4a4941", // 7.88:1 vs land
  labelMedium: "#57544a", // 6.60:1 vs land
  labelSoft: "#6e6a5e", // 4.71:1 vs land
  labelTransit: "#4d6577", // 5.31:1 vs land
  boundary: "#a09885",
  boundarySoft: "#b5ad9c",
} as const;

/**
 * GL cluster chip values ("Paper chips" family). Consumed by Map.tsx layer
 * definitions and NeighborhoodMap. Dark values keep the preparatory dark
 * layers compiling (production is light-only).
 */
export const CLUSTER_THEME = {
  light: {
    fill: MAP_BRAND.white,
    stroke: MAP_BRAND.ink,
    strokeWidth: 1.5,
    strokeOpacity: 0.9,
    countText: MAP_BRAND.ink,
  },
  dark: {
    fill: MAP_BRAND.canvas,
    stroke: MAP_BRAND.ink,
    strokeWidth: 2,
    strokeOpacity: 1,
    countText: MAP_BRAND.ink,
  },
  /** Soft shadow halo rendered beneath cluster chips (GL has no box-shadow) */
  halo: {
    color: MAP_BRAND.ink,
    opacity: 0.16,
    blur: 0.9,
    translate: [0, 2] as [number, number],
  },
} as const;

/** Search-area boundary polygon — a whisper-opacity brand hint, not debug chrome */
export const BOUNDARY_THEME = {
  line: MAP_BRAND.primary,
  lineOpacity: 0.3,
  lineWidth: 1.25,
  dasharray: [3, 3] as [number, number],
  fill: MAP_BRAND.primary,
  fillOpacity: 0.04,
} as const;

// ============================================================================
// BASEMAP_PALETTE — generator rules
// ============================================================================

/**
 * One themed override applied to upstream Liberty layers.
 *
 * match semantics (enforced by the generator):
 * - string    → exactly this layer id must exist
 * - string[]  → EVERY listed id must exist (strict group contract)
 * - RegExp    → at least one layer id must match
 *
 * paint/layout values are shallow-merged per matched layer; removePaint
 * deletes properties (needed where a sprite fill-pattern must give way to
 * fill-color). Rules may set paint colors/opacities, text paint, visibility,
 * letter-spacing, and layer minzoom — NEVER text-font, sources, glyphs, or
 * sprite (glyph/sprite assets live on the allowlisted host).
 */
export interface BasemapPaletteRule {
  name: string;
  match: string | string[] | RegExp;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  removePaint?: string[];
  minzoom?: number;
}

const B = PAPER_BASEMAP;

export const BASEMAP_PALETTE: BasemapPaletteRule[] = [
  // --- Land -----------------------------------------------------------------
  { name: "background", match: "background", paint: { "background-color": B.land } },
  {
    name: "shaded-relief",
    match: "natural_earth",
    paint: {
      "raster-opacity": ["interpolate", ["exponential", 1.5], ["zoom"], 0, 0.1, 6, 0.03],
      "raster-saturation": -0.85,
      "raster-brightness-min": 0.85,
    },
  },
  {
    name: "landuse-residential",
    match: "landuse_residential",
    paint: {
      "fill-color": "#ece6d6",
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 12, 0.15],
    },
  },
  { name: "landuse-school", match: "landuse_school", paint: { "fill-color": "#f0ebdc" } },
  { name: "landuse-hospital", match: "landuse_hospital", paint: { "fill-color": "#f2eae2" } },
  { name: "landuse-cemetery", match: "landuse_cemetery", paint: { "fill-color": "#e9e7d8" } },
  {
    name: "landuse-pitch-track",
    match: ["landuse_pitch", "landuse_track"],
    paint: { "fill-color": "#e4e8d8" },
  },
  { name: "landcover-sand", match: "landcover_sand", paint: { "fill-color": "#ece2cc" } },
  { name: "landcover-ice", match: "landcover_ice", paint: { "fill-color": "#f0f2ef" } },
  { name: "landcover-wetland", match: "landcover_wetland", paint: { "fill-opacity": 0.25 } },

  // --- Parks / toggleable landcover (ids gated by REQUIRED_BASEMAP_LAYER_IDS)
  {
    name: "park",
    match: "park",
    paint: { "fill-color": B.park, "fill-opacity": 0.75, "fill-outline-color": B.parkFillOutline },
  },
  { name: "park-outline", match: "park_outline", paint: { "line-color": B.parkOutline } },
  { name: "wood", match: "landcover_wood", paint: { "fill-color": B.wood, "fill-opacity": 0.5 } },
  { name: "grass", match: "landcover_grass", paint: { "fill-color": B.grass, "fill-opacity": 0.45 } },

  // --- Water ------------------------------------------------------------------
  { name: "water", match: "water", paint: { "fill-color": B.water } },
  {
    name: "waterways",
    match: ["waterway_river", "waterway_other"],
    paint: { "line-color": B.waterway },
  },
  { name: "waterway-tunnel", match: "waterway_tunnel", paint: { "line-color": B.waterwayTunnel } },

  // --- Roads: fills (white paper-showing-through; widths/dashes kept) ---------
  {
    name: "motorway-fill",
    match: [
      "road_motorway", "bridge_motorway", "tunnel_motorway",
      "road_motorway_link", "bridge_motorway_link", "tunnel_motorway_link",
    ],
    paint: { "line-color": B.roadMotorway },
  },
  {
    name: "trunk-primary-fill",
    match: ["road_trunk_primary", "bridge_trunk_primary", "tunnel_trunk_primary"],
    paint: { "line-color": B.roadTrunk },
  },
  {
    name: "secondary-tertiary-fill",
    match: ["road_secondary_tertiary", "bridge_secondary_tertiary", "tunnel_secondary_tertiary"],
    paint: { "line-color": B.roadWhite },
  },
  {
    name: "minor-street-fill",
    match: ["road_minor", "bridge_street", "tunnel_minor"],
    paint: { "line-color": B.roadWhite },
  },
  {
    name: "service-track-fill",
    match: ["road_service_track", "bridge_service_track", "tunnel_service_track"],
    paint: { "line-color": B.roadWhite },
  },
  {
    name: "link-fill",
    match: ["road_link", "bridge_link", "tunnel_link"],
    paint: { "line-color": B.roadWhite },
  },
  {
    name: "path-pedestrian",
    match: ["road_path_pedestrian", "bridge_path_pedestrian", "tunnel_path_pedestrian"],
    paint: { "line-color": B.path },
  },

  // --- Roads: casings ----------------------------------------------------------
  {
    name: "motorway-casing",
    match: [
      "road_motorway_casing", "bridge_motorway_casing", "tunnel_motorway_casing",
      "road_motorway_link_casing", "bridge_motorway_link_casing", "tunnel_motorway_link_casing",
    ],
    paint: { "line-color": B.casingMotorway },
  },
  {
    name: "trunk-primary-casing",
    match: ["road_trunk_primary_casing", "bridge_trunk_primary_casing", "tunnel_trunk_primary_casing"],
    paint: { "line-color": B.casingTrunk },
  },
  {
    name: "secondary-tertiary-casing",
    match: [
      "road_secondary_tertiary_casing", "bridge_secondary_tertiary_casing", "tunnel_secondary_tertiary_casing",
    ],
    paint: { "line-color": B.casingSecondary },
  },
  {
    name: "minor-street-casing",
    match: ["road_minor_casing", "bridge_street_casing", "tunnel_street_casing"],
    paint: { "line-color": B.casingMinor },
  },
  {
    name: "service-track-casing",
    match: ["road_service_track_casing", "bridge_service_track_casing", "tunnel_service_track_casing"],
    paint: { "line-color": B.casingService },
  },
  {
    name: "link-casing",
    match: ["road_link_casing", "bridge_link_casing", "tunnel_link_casing"],
    paint: { "line-color": B.casingSecondary },
  },
  {
    name: "path-casing",
    match: "bridge_path_pedestrian_casing",
    paint: { "line-color": B.casingService },
  },
  {
    // After per-class colors: tunnels recede via opacity (dasharrays kept)
    name: "tunnel-casing-opacity",
    match: [
      "tunnel_motorway_casing", "tunnel_motorway_link_casing", "tunnel_trunk_primary_casing",
      "tunnel_secondary_tertiary_casing", "tunnel_street_casing", "tunnel_link_casing",
      "tunnel_service_track_casing",
    ],
    paint: { "line-opacity": 0.6 },
  },
  {
    name: "road-area-pattern",
    match: "road_area_pattern",
    removePaint: ["fill-pattern"],
    paint: { "fill-color": "#efeadc" },
  },

  // --- Rail / transit / aeroway -------------------------------------------------
  {
    name: "major-rail",
    match: [
      "road_major_rail", "road_major_rail_hatching",
      "bridge_major_rail", "bridge_major_rail_hatching",
      "tunnel_major_rail", "tunnel_major_rail_hatching",
    ],
    paint: { "line-color": B.railMajor },
  },
  {
    name: "transit-rail",
    match: [
      "road_transit_rail", "road_transit_rail_hatching",
      "bridge_transit_rail", "bridge_transit_rail_hatching",
      "tunnel_transit_rail", "tunnel_transit_rail_hatching",
    ],
    paint: { "line-color": B.railTransit },
  },
  {
    name: "one-way-arrows",
    match: ["road_one_way_arrow", "road_one_way_arrow_opposite"],
    paint: { "icon-opacity": 0.3 },
  },
  { name: "aeroway-fill", match: "aeroway_fill", paint: { "fill-color": "#edeadf" } },
  {
    name: "aeroway-lines",
    match: ["aeroway_runway", "aeroway_taxiway"],
    paint: { "line-color": "#e2dcc9" },
  },

  // --- Buildings ------------------------------------------------------------------
  {
    name: "building",
    match: "building",
    paint: {
      "fill-color": B.building,
      "fill-outline-color": [
        "interpolate", ["linear"], ["zoom"],
        13, "rgba(224,215,196,0.35)",
        14, "#e0d7c4",
      ],
    },
  },
  {
    name: "building-3d",
    match: "building-3d",
    paint: {
      "fill-extrusion-color": B.building3d,
      "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.8, 16, 0.65],
    },
  },

  // --- Admin boundaries -------------------------------------------------------------
  {
    name: "boundary-3",
    match: "boundary_3",
    paint: { "line-color": B.boundarySoft, "line-opacity": 0.6 },
  },
  {
    name: "boundary-2",
    match: "boundary_2",
    paint: {
      "line-color": B.boundary,
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.3, 4, 0.8],
    },
  },
  { name: "boundary-disputed", match: "boundary_disputed", paint: { "line-color": B.boundary } },

  // --- Road labels + shields ----------------------------------------------------------
  {
    name: "road-name-major",
    match: "highway-name-major",
    paint: {
      "text-color": B.labelStrong,
      "text-halo-color": MAP_BRAND.white,
      "text-halo-width": 1.2,
      "text-halo-blur": 0.5,
    },
  },
  {
    name: "road-name-minor",
    match: "highway-name-minor",
    paint: { "text-color": B.labelSoft, "text-halo-color": MAP_BRAND.white, "text-halo-width": 1.1 },
  },
  {
    name: "road-name-path",
    match: "highway-name-path",
    paint: { "text-color": B.labelSoft, "text-halo-color": B.landHaloSoft, "text-halo-width": 1 },
  },
  {
    name: "shields-hidden",
    match: ["highway-shield-non-us", "road_shield_us"],
    layout: { visibility: "none" },
  },
  {
    name: "shield-interstate",
    match: "highway-shield-us-interstate",
    minzoom: 10,
    paint: { "icon-opacity": 0.8 },
  },

  // --- POIs (minzooms kept; sprites aren't recolorable — opacity-muted) ---------------
  {
    name: "poi-landmarks",
    match: ["poi_r1", "poi_r7", "poi_r20"],
    paint: {
      "icon-opacity": 0.7,
      "text-color": B.labelSoft,
      "text-halo-color": B.landHaloSoft,
      "text-halo-width": 1.1,
      "text-halo-blur": 0.5,
    },
  },
  {
    name: "poi-transit",
    match: "poi_transit",
    paint: {
      "icon-opacity": 0.85,
      "text-color": B.labelTransit,
      "text-halo-color": B.landHaloSoft,
      "text-halo-width": 1.1,
    },
  },
  {
    name: "airport",
    match: "airport",
    paint: {
      "icon-opacity": 0.8,
      "text-color": B.labelMedium,
      "text-halo-color": B.landHaloSoft,
      "text-halo-width": 1.1,
    },
  },

  // --- Water labels ----------------------------------------------------------------------
  {
    name: "water-labels",
    match: ["waterway_line_label", "water_name_point_label", "water_name_line_label"],
    paint: {
      "text-color": B.waterLabel,
      "text-halo-color": "rgba(255,255,255,0.85)",
      "text-halo-width": 1.5,
    },
  },

  // --- Place labels (fonts/sizes kept — Newsreader is not a GL glyph stack) ----------------
  {
    name: "label-city-capital",
    match: "label_city_capital",
    paint: {
      "text-color": B.labelInk,
      "text-halo-color": B.landHalo,
      "text-halo-width": 1.2,
      "text-halo-blur": 1,
    },
  },
  {
    name: "label-city",
    match: "label_city",
    paint: {
      "text-color": B.labelCity,
      "text-halo-color": B.landHalo,
      "text-halo-width": 1.2,
      "icon-opacity": 0.6,
    },
  },
  {
    name: "label-town",
    match: "label_town",
    paint: {
      "text-color": B.labelStrong,
      "text-halo-color": B.landHalo,
      "text-halo-width": 1.2,
      "icon-opacity": 0.6,
    },
  },
  {
    name: "label-village",
    match: "label_village",
    paint: {
      "text-color": B.labelMedium,
      "text-halo-color": B.landHalo,
      "text-halo-width": 1.2,
      "icon-opacity": 0.6,
    },
  },
  {
    // Suburb/neighbourhood labels — the key wayfinding layer for Roomshare
    name: "label-neighbourhood",
    match: "label_other",
    paint: { "text-color": B.labelMedium, "text-halo-color": B.landHalo, "text-halo-width": 1.2 },
    layout: { "text-letter-spacing": 0.15 },
  },
  {
    name: "label-state",
    match: "label_state",
    paint: { "text-color": B.labelSoft, "text-halo-color": B.landHalo, "text-halo-width": 1.2 },
  },
  {
    name: "label-country",
    match: ["label_country_1", "label_country_2", "label_country_3"],
    paint: { "text-color": B.labelStrong, "text-halo-color": B.landHalo, "text-halo-width": 1.2 },
  },
];

/*
 * Dial-to-neutral fallback (if the warm tint reads too strong): swap
 *   land #f3efe5 → #f1f0ec, building #ebe4d4 → #e8e6e0 (outline #dcdad3),
 *   roadMotorway/casingMotorway #faf1e2/#d9c9ab → #f4f2ed/#d5d2c9,
 *   landuse_residential #ece6d6 → #eceae4
 * then `pnpm map:style:generate`.
 */
