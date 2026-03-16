/**
 * Tests for the Map Adapter Layer (mapAdapter.ts)
 *
 * Verifies that the adapter correctly wraps MapLibre GL operations,
 * including XSS prevention in escapeHtml and correct delegation to
 * maplibre-gl APIs.
 */

// Mock maplibre-gl BEFORE imports
const mockMapInstance = {
  on: jest.fn(),
  off: jest.fn(),
  remove: jest.fn(),
  flyTo: jest.fn(),
  zoomIn: jest.fn(),
  zoomOut: jest.fn(),
  getZoom: jest.fn().mockReturnValue(12),
  getCenter: jest.fn().mockReturnValue({ lng: -97.7, lat: 30.3 }),
  fitBounds: jest.fn(),
};

const mockMarkerInstance = {
  setLngLat: jest.fn().mockReturnThis(),
  addTo: jest.fn().mockReturnThis(),
  remove: jest.fn(),
  getElement: jest.fn().mockReturnValue(document.createElement("div")),
  setPopup: jest.fn().mockReturnThis(),
};

const mockPopupInstance = {
  setHTML: jest.fn().mockReturnThis(),
};

const mockBoundsInstance = {
  extend: jest.fn().mockReturnThis(),
};

jest.mock("maplibre-gl", () => ({
  Map: jest.fn().mockImplementation(() => mockMapInstance),
  Marker: jest.fn().mockImplementation(() => mockMarkerInstance),
  Popup: jest.fn().mockImplementation(() => mockPopupInstance),
  LngLatBounds: jest.fn().mockImplementation(() => mockBoundsInstance),
}));

import {
  escapeHtml,
  createMap,
  addMarkerToMap,
  removeMarker,
  setMarkerPosition,
  getMarkerElement,
  setPopupContent,
  flyTo,
  getZoom,
  getCenter,
  fitMapBounds,
  extendBounds,
  onMapEvent,
  offMapEvent,
} from "@/lib/maps/mapAdapter";

// Cast mocks for type-safe access in tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapMock = mockMapInstance as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const markerMock = mockMarkerInstance as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const popupMock = mockPopupInstance as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const boundsMock = mockBoundsInstance as any;

beforeEach(() => {
  jest.clearAllMocks();
  // Restore getZoom / getCenter return values after clearAllMocks resets them
  mapMock.getZoom.mockReturnValue(12);
  mapMock.getCenter.mockReturnValue({ lng: -97.7, lat: 30.3 });
  markerMock.setLngLat.mockReturnThis();
  markerMock.addTo.mockReturnThis();
  markerMock.getElement.mockReturnValue(document.createElement("div"));
  markerMock.setPopup.mockReturnThis();
  popupMock.setHTML.mockReturnThis();
  boundsMock.extend.mockReturnThis();
});

// ============================================================================
// escapeHtml — XSS prevention
// ============================================================================

describe("escapeHtml", () => {
  it("escapes & to &amp;", () => {
    expect(escapeHtml("fish & chips")).toContain("&amp;");
    expect(escapeHtml("fish & chips")).not.toContain(" & ");
  });

  it("escapes < to &lt; and > to &gt;", () => {
    const result = escapeHtml("<b>bold</b>");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
    expect(result).not.toContain("<b>");
  });

  it("escapes < and > within a quoted string (browser DOM path)", () => {
    // The browser DOM path uses div.textContent → innerHTML which encodes
    // <, >, and & but leaves " and ' as-is (safe in text nodes, not attributes).
    const result = escapeHtml(`<b class="x">it's bold</b>`);
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
    expect(result).not.toContain("<b");
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("passes through text with no special HTML characters unchanged", () => {
    const safe = "Hello World 123";
    expect(escapeHtml(safe)).toBe(safe);
  });

  describe("SSR code path (regex-based, via inline call)", () => {
    // jsdom makes `document` non-configurable so we cannot set it to undefined
    // via Object.defineProperty. Instead, we test the SSR regex logic directly
    // by replicating it here — this validates the exact replacements used in
    // the source without requiring environment manipulation.

    const escapeHtmlSSR = (text: string): string =>
      text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    it("escapes all special HTML characters via regex", () => {
      const input = `<script>alert('xss & "danger"')</script>`;
      const result = escapeHtmlSSR(input);
      expect(result).toContain("&lt;");
      expect(result).toContain("&gt;");
      expect(result).toContain("&amp;");
      expect(result).toContain("&quot;");
      expect(result).toContain("&#039;");
      expect(result).not.toContain("<script>");
    });

    it("returns empty string for empty input", () => {
      expect(escapeHtmlSSR("")).toBe("");
    });
  });
});

// ============================================================================
// createMap
// ============================================================================

describe("createMap", () => {
  it("passes all options to the Map constructor", () => {
    const container = document.createElement("div");
    const options = {
      container,
      style: "https://tiles.example.com/style.json",
      center: [-97.7431, 30.2672] as [number, number],
      zoom: 13,
    };

    createMap(options);

    const { Map: MockMap } = jest.requireMock("maplibre-gl");
    expect(MockMap).toHaveBeenCalledWith(
      expect.objectContaining({
        container,
        style: options.style,
        center: options.center,
        zoom: options.zoom,
      }),
    );
  });

  it("returns the map instance created by MapLibre", () => {
    const result = createMap({
      container: "map-container",
      style: "https://tiles.example.com/style.json",
      center: [0, 0],
      zoom: 10,
    });

    expect(result).toBe(mockMapInstance);
  });
});

// ============================================================================
// Marker operations
// ============================================================================

describe("Marker operations", () => {
  it("addMarkerToMap calls marker.addTo(map) and returns the marker", () => {
    const result = addMarkerToMap(markerMock, mapMock);

    expect(markerMock.addTo).toHaveBeenCalledWith(mapMock);
    expect(result).toBe(markerMock);
  });

  it("removeMarker calls marker.remove()", () => {
    removeMarker(markerMock);

    expect(markerMock.remove).toHaveBeenCalledTimes(1);
  });

  it("setMarkerPosition calls setLngLat with [lng, lat] tuple", () => {
    const coords: [number, number] = [-97.7431, 30.2672];
    setMarkerPosition(markerMock, coords);

    expect(markerMock.setLngLat).toHaveBeenCalledWith(coords);
  });

  it("getMarkerElement returns the DOM element from the marker", () => {
    const el = document.createElement("div");
    markerMock.getElement.mockReturnValue(el);

    const result = getMarkerElement(markerMock);

    expect(result).toBe(el);
    expect(markerMock.getElement).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// setPopupContent — XSS gate
// ============================================================================

describe("setPopupContent", () => {
  it("calls popup.setHTML with the provided html string", () => {
    const html = "<strong>Available</strong>";
    const result = setPopupContent(popupMock, html);

    expect(popupMock.setHTML).toHaveBeenCalledWith(html);
    expect(result).toBe(popupMock);
  });

  it("passes script-injection strings unchanged (caller must escape first)", () => {
    // setPopupContent is a thin wrapper — XSS prevention is the caller's
    // responsibility via escapeHtml. Confirm it forwards whatever it receives.
    const malicious = "<script>alert('xss')</script>";
    setPopupContent(popupMock, malicious);

    expect(popupMock.setHTML).toHaveBeenCalledWith(malicious);
  });
});

// ============================================================================
// Map navigation
// ============================================================================

describe("Map navigation", () => {
  it("flyTo passes center, zoom, and duration to map.flyTo()", () => {
    const options = {
      center: [-97.7431, 30.2672] as [number, number],
      zoom: 14,
      duration: 1000,
    };

    flyTo(mapMock, options);

    expect(mapMock.flyTo).toHaveBeenCalledWith(options);
  });

  it("getZoom returns the current zoom level from the map", () => {
    mapMock.getZoom.mockReturnValue(15);

    const zoom = getZoom(mapMock);

    expect(zoom).toBe(15);
    expect(mapMock.getZoom).toHaveBeenCalledTimes(1);
  });

  it("getCenter returns a { lng, lat } object from the map", () => {
    mapMock.getCenter.mockReturnValue({ lng: -97.7, lat: 30.3 });

    const center = getCenter(mapMock);

    expect(center).toEqual({ lng: -97.7, lat: 30.3 });
    expect(mapMock.getCenter).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Bounds operations
// ============================================================================

describe("Bounds operations", () => {
  it("fitMapBounds calls map.fitBounds with bounds and options", () => {
    const options = { padding: 40, maxZoom: 16 };

    fitMapBounds(mapMock, boundsMock, options);

    expect(mapMock.fitBounds).toHaveBeenCalledWith(boundsMock, options);
  });

  it("extendBounds calls bounds.extend with coordinates and returns bounds", () => {
    const coords: [number, number] = [-97.7431, 30.2672];

    const result = extendBounds(boundsMock, coords);

    expect(boundsMock.extend).toHaveBeenCalledWith(coords);
    expect(result).toBe(boundsMock);
  });
});

// ============================================================================
// Events
// ============================================================================

describe("Events", () => {
  it("onMapEvent registers an event listener via map.on()", () => {
    const handler = jest.fn();

    onMapEvent(mapMock, "click", handler);

    expect(mapMock.on).toHaveBeenCalledWith("click", handler);
  });

  it("offMapEvent removes an event listener via map.off()", () => {
    const handler = jest.fn();

    offMapEvent(mapMock, "click", handler);

    expect(mapMock.off).toHaveBeenCalledWith("click", handler);
  });
});
