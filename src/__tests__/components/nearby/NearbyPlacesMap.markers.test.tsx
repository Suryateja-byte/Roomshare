import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { getCategoryColors } from "@/types/nearby";
import type { NearbyPlace } from "@/types/nearby";

type MockMapEventHandler = (...args: unknown[]) => void;

const mapEventHandlers: Record<string, MockMapEventHandler[]> = {};

class MockLngLatBounds {
  coords: [number, number][] = [];

  extend(coord: [number, number]) {
    this.coords.push(coord);
    return this;
  }
}

class MockPopup {
  html = "";
  isOpenState = false;

  setHTML = jest.fn((html: string) => {
    this.html = html;
    return this;
  });

  remove = jest.fn(() => {
    this.isOpenState = false;
    return this;
  });

  isOpen = jest.fn(() => this.isOpenState);

  addTo = jest.fn(() => {
    this.isOpenState = true;
    return this;
  });
}

class MockMarker {
  element: HTMLDivElement;
  lngLat: [number, number] = [0, 0];
  popup: MockPopup | null = null;
  removed = false;

  constructor(element: HTMLDivElement) {
    this.element = element;
  }

  setLngLat = jest.fn((coords: [number, number]) => {
    this.lngLat = coords;
    return this;
  });

  setPopup = jest.fn((popup: MockPopup) => {
    this.popup = popup;
    return this;
  });

  addTo = jest.fn(() => {
    createdMarkers.push(this);
    return this;
  });

  remove = jest.fn(() => {
    this.removed = true;
    return this;
  });

  getElement = jest.fn(() => this.element);

  getPopup = jest.fn(() => this.popup);

  togglePopup = jest.fn(() => {
    if (!this.popup) {
      return this;
    }

    this.popup.isOpenState = !this.popup.isOpenState;
    return this;
  });
}

const createdMarkers: MockMarker[] = [];
const mockMap = {
  on: jest.fn((event: string, handler: MockMapEventHandler) => {
    mapEventHandlers[event] = mapEventHandlers[event] || [];
    mapEventHandlers[event].push(handler);
  }),
  remove: jest.fn(),
  fitBounds: jest.fn(),
  zoomIn: jest.fn(),
  zoomOut: jest.fn(),
  flyTo: jest.fn(),
  resize: jest.fn(),
};

jest.mock("maplibre-gl", () => ({
  Map: jest.fn(() => mockMap),
  Marker: jest.fn(({ element }) => new MockMarker(element)),
  Popup: jest.fn(() => new MockPopup()),
  LngLatBounds: jest.fn(() => new MockLngLatBounds()),
}));

jest.mock("lucide-react", () => ({
  Plus: () => <span data-testid="plus-icon">+</span>,
  Minus: () => <span data-testid="minus-icon">-</span>,
  Navigation: () => <span data-testid="nav-icon">N</span>,
  Maximize2: () => <span data-testid="maximize-icon">M</span>,
}));

jest.mock("@/components/nearby/RadarAttribution", () => ({
  __esModule: true,
  default: () => <div data-testid="radar-attribution">Radar Attribution</div>,
}));

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        version: 8,
        sources: {},
        layers: [],
        projection: { type: "mercator" },
      }),
  })
) as jest.Mock;

import NearbyPlacesMap from "@/components/nearby/NearbyPlacesMap";

describe("NearbyPlacesMap - Marker Registry And Semantics", () => {
  const listingLat = 37.7749;
  const listingLng = -122.4194;

  const createMockPlace = (
    id: string,
    overrides: Partial<NearbyPlace> = {}
  ): NearbyPlace => ({
    id,
    name: `Place ${id}`,
    address: `123 ${id} St`,
    category: "food-grocery",
    location: { lat: 37.7749, lng: -122.4194 },
    distanceMiles: 0.5,
    ...overrides,
  });

  const normalizeCssColor = (value: string) => {
    const probe = document.createElement("div");
    probe.style.borderColor = value;
    return probe.style.borderColor;
  };

  const flushMapInit = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const triggerMapEvent = async (event: string) => {
    await act(async () => {
      for (const handler of mapEventHandlers[event] || []) {
        handler();
      }
    });
  };

  const renderLoadedMap = async (
    props: Partial<React.ComponentProps<typeof NearbyPlacesMap>> = {}
  ) => {
    const utils = render(
      <NearbyPlacesMap
        listingLat={listingLat}
        listingLng={listingLng}
        places={[]}
        {...props}
      />
    );

    await flushMapInit();
    await triggerMapEvent("load");
    return utils;
  };

  const getPOIMarker = (placeId: string) => {
    const marker = createdMarkers.find(
      (candidate) => candidate.element.dataset.placeId === placeId
    );

    if (!marker) {
      throw new Error(`No POI marker found for ${placeId}`);
    }

    return marker;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createdMarkers.length = 0;
    Object.keys(mapEventHandlers).forEach((event) => {
      delete mapEventHandlers[event];
    });
  });

  it("reuses same-id markers and updates coordinates, popup html, and visuals in place", async () => {
    const initialPlace = createMockPlace("place-1");
    const { rerender } = await renderLoadedMap({ places: [initialPlace] });

    const poiMarker = getPOIMarker("place-1");
    const markerCountAfterInitialRender = createdMarkers.length;

    const updatedPlace = createMockPlace("place-1", {
      name: "Updated Pharmacy",
      address: "456 Market St",
      category: "pharmacy",
      location: { lat: 37.785, lng: -122.41 },
      distanceMiles: 1.2,
    });

    rerender(
      <NearbyPlacesMap
        listingLat={listingLat}
        listingLng={listingLng}
        places={[updatedPlace]}
      />
    );
    await flushMapInit();

    expect(createdMarkers).toHaveLength(markerCountAfterInitialRender);
    expect(poiMarker.setLngLat).toHaveBeenLastCalledWith([-122.41, 37.785]);
    expect(poiMarker.popup?.setHTML).toHaveBeenCalledWith(
      expect.stringContaining("Updated Pharmacy")
    );
    expect(poiMarker.element).toHaveAttribute(
      "aria-label",
      "Updated Pharmacy, pharmacy, 1.2 miles away"
    );

    const markerVisual = poiMarker.element.firstElementChild as HTMLDivElement;
    expect(markerVisual.style.borderColor).toBe(
      normalizeCssColor(getCategoryColors("pharmacy").markerBorder)
    );
  });

  it("removes stale markers on partial updates and clears marker registry on unmount", async () => {
    const placeOne = createMockPlace("place-1");
    const placeTwo = createMockPlace("place-2");
    const { rerender, unmount } = await renderLoadedMap({
      places: [placeOne, placeTwo],
    });

    const markerOne = getPOIMarker("place-1");
    const markerTwo = getPOIMarker("place-2");

    rerender(
      <NearbyPlacesMap
        listingLat={listingLat}
        listingLng={listingLng}
        places={[placeOne]}
      />
    );
    await flushMapInit();

    expect(markerTwo.remove).toHaveBeenCalledTimes(1);
    expect(markerOne.remove).not.toHaveBeenCalled();

    unmount();

    expect(markerOne.remove).toHaveBeenCalledTimes(1);
    expect(mockMap.remove).toHaveBeenCalledTimes(1);
  });

  it("gives POI markers explicit button semantics and keyboard popup activation", async () => {
    await renderLoadedMap({ places: [createMockPlace("place-1")] });
    const marker = getPOIMarker("place-1");

    expect(marker.element).toHaveAttribute("role", "button");
    expect(marker.element).toHaveAttribute(
      "aria-label",
      "Place place-1, food grocery, 0.5 miles away"
    );
    expect(marker.element.tabIndex).toBe(0);

    fireEvent.keyDown(marker.element, { key: "Enter" });
    fireEvent.keyDown(marker.element, { key: " " });

    expect(marker.togglePopup).toHaveBeenCalledTimes(2);
  });

  it("applies highlight state during marker creation and updates it on rerender", async () => {
    const placeOne = createMockPlace("place-1");
    const placeTwo = createMockPlace("place-2");
    const { rerender } = await renderLoadedMap({
      places: [placeOne, placeTwo],
      highlightedPlaceId: "place-1",
    });

    const markerOne = getPOIMarker("place-1");
    const markerTwo = getPOIMarker("place-2");

    expect(markerOne.element.classList.contains("highlighted")).toBe(true);
    expect(markerTwo.element.classList.contains("highlighted")).toBe(false);

    rerender(
      <NearbyPlacesMap
        listingLat={listingLat}
        listingLng={listingLng}
        places={[placeOne, placeTwo]}
        highlightedPlaceId="place-2"
      />
    );
    await flushMapInit();

    expect(markerOne.element.classList.contains("highlighted")).toBe(false);
    expect(markerTwo.element.classList.contains("highlighted")).toBe(true);
  });

  it("escapes popup HTML content before rendering", async () => {
    const maliciousPlace = createMockPlace("xss", {
      name: '<script>alert("xss")</script>Malicious',
      address: '<img src=x onerror="alert(1)">',
    });

    await renderLoadedMap({ places: [maliciousPlace] });

    const marker = getPOIMarker("xss");
    const popupHtml = marker.popup?.html || "";

    expect(popupHtml).not.toContain("<script>");
    expect(popupHtml).toContain("&lt;script&gt;");
    expect(popupHtml).not.toContain('onerror="alert(1)"');
  });

  it("uses overlay-aware bounds padding for explicit fit-all actions", async () => {
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);
    const overlayRef = { current: overlay };

    const { container } = await renderLoadedMap({
      places: [createMockPlace("place-1")],
      externalBottomOverlayRef: overlayRef,
    });

    const mapContainer = container.querySelector(".w-full.h-full") as HTMLDivElement;
    const controls = screen.getByRole("button", { name: /zoom in/i })
      .parentElement as HTMLDivElement;
    const rect = (top: number, left: number, right: number, bottom: number) => ({
      top,
      left,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
      toJSON: () => ({}),
    });

    Object.defineProperty(mapContainer, "getBoundingClientRect", {
      configurable: true,
      value: () => rect(0, 0, 400, 500),
    });
    Object.defineProperty(controls, "getBoundingClientRect", {
      configurable: true,
      value: () => rect(280, 330, 374, 420),
    });
    Object.defineProperty(controls, "getClientRects", {
      configurable: true,
      value: () => [rect(280, 330, 374, 420)],
    });
    Object.defineProperty(overlay, "getBoundingClientRect", {
      configurable: true,
      value: () => rect(430, 120, 280, 474),
    });
    Object.defineProperty(overlay, "getClientRects", {
      configurable: true,
      value: () => [rect(430, 120, 280, 474)],
    });

    mockMap.fitBounds.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /fit all markers/i }));

    expect(mockMap.fitBounds).toHaveBeenCalledWith(
      expect.any(MockLngLatBounds),
      expect.objectContaining({
        padding: expect.objectContaining({
          top: 24,
          left: 24,
          right: expect.any(Number),
          bottom: expect.any(Number),
        }),
        maxZoom: 15,
        duration: 500,
      })
    );

    const [, options] = mockMap.fitBounds.mock.calls[0];
    expect(options.padding.right).toBeGreaterThan(24);
    expect(options.padding.bottom).toBeGreaterThan(24);

    overlay.remove();
  });
});
