import React from "react";
import { act, render, screen } from "@testing-library/react";

type ResizeObserverCallbackEntry = Partial<ResizeObserverEntry>;

const mapEventHandlers: Record<string, Array<() => void>> = {};
const mockMap = {
  on: jest.fn((event: string, handler: () => void) => {
    mapEventHandlers[event] = mapEventHandlers[event] || [];
    mapEventHandlers[event].push(handler);
  }),
  remove: jest.fn(),
  resize: jest.fn(),
  flyTo: jest.fn(),
  fitBounds: jest.fn(),
  zoomIn: jest.fn(),
  zoomOut: jest.fn(),
};

class MockLngLatBounds {
  extend = jest.fn().mockReturnThis();
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  observedElements = new Set<Element>();
  disconnected = false;

  constructor(private callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observedElements.add(element);
  }

  unobserve(element: Element) {
    this.observedElements.delete(element);
  }

  disconnect() {
    this.disconnected = true;
    this.observedElements.clear();
  }

  trigger(entries: ResizeObserverCallbackEntry[]) {
    this.callback(entries as ResizeObserverEntry[], this);
  }

  static reset() {
    MockResizeObserver.instances = [];
  }
}

jest.mock("maplibre-gl", () => ({
  Map: jest.fn(() => mockMap),
  Marker: jest.fn(() => ({
    setLngLat: jest.fn().mockReturnThis(),
    setPopup: jest.fn().mockReturnThis(),
    addTo: jest.fn().mockReturnThis(),
    remove: jest.fn(),
    getElement: jest.fn(() => document.createElement("div")),
  })),
  Popup: jest.fn(() => ({
    setHTML: jest.fn().mockReturnThis(),
    addTo: jest.fn().mockReturnThis(),
    remove: jest.fn(),
    isOpen: jest.fn(() => false),
  })),
  LngLatBounds: jest.fn(() => new MockLngLatBounds()),
}));

global.ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver;

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

describe("NearbyPlacesMap - Layout Smoke Tests", () => {
  const listingLat = 37.7749;
  const listingLng = -122.4194;

  const createMockPlace = (id: string) => ({
    id,
    name: `Place ${id}`,
    address: "123 Test St",
    category: "food-grocery",
    location: { lat: 37.775, lng: -122.419 },
    distanceMiles: 0.5,
  });

  const flushMapInit = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    MockResizeObserver.reset();
    Object.keys(mapEventHandlers).forEach((event) => {
      delete mapEventHandlers[event];
    });
  });

  it("renders the map container and floating controls", async () => {
    const { container } = render(
      <NearbyPlacesMap
        listingLat={listingLat}
        listingLng={listingLng}
        places={[createMockPlace("place-1")]}
      />
    );

    await flushMapInit();

    expect(container.querySelector(".w-full.h-full")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeInTheDocument();
  });

  it("calls map.resize() when ResizeObserver reports container changes", async () => {
    render(
      <NearbyPlacesMap
        listingLat={listingLat}
        listingLng={listingLng}
        places={[createMockPlace("place-1")]}
      />
    );

    await flushMapInit();
    const observer = MockResizeObserver.instances[0];

    act(() => {
      observer.trigger([
        {
          contentRect: {
            width: 800,
            height: 600,
            top: 0,
            left: 0,
            bottom: 600,
            right: 800,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          },
        },
      ]);
    });

    expect(mockMap.resize).toHaveBeenCalled();
  });

  it("resizes on window resize, orientation changes, and visibility restoration", async () => {
    render(
      <NearbyPlacesMap
        listingLat={listingLat}
        listingLng={listingLng}
        places={[createMockPlace("place-1")]}
      />
    );

    await flushMapInit();
    mockMap.resize.mockClear();

    act(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("orientationchange"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mockMap.resize).toHaveBeenCalledTimes(3);
  });

  it("resizes again when the map pane becomes interactive", async () => {
    const { rerender } = render(
      <NearbyPlacesMap
        listingLat={listingLat}
        listingLng={listingLng}
        places={[createMockPlace("place-1")]}
        isPaneInteractive={false}
      />
    );

    await flushMapInit();
    mockMap.resize.mockClear();

    rerender(
      <NearbyPlacesMap
        listingLat={listingLat}
        listingLng={listingLng}
        places={[createMockPlace("place-1")]}
        isPaneInteractive
      />
    );
    await flushMapInit();

    expect(mockMap.resize).toHaveBeenCalledTimes(1);
  });

  it("disconnects the ResizeObserver on unmount", async () => {
    const { unmount } = render(
      <NearbyPlacesMap
        listingLat={listingLat}
        listingLng={listingLng}
        places={[createMockPlace("place-1")]}
      />
    );

    await flushMapInit();
    const observer = MockResizeObserver.instances[0];

    unmount();

    expect(observer.disconnected).toBe(true);
    expect(mockMap.remove).toHaveBeenCalledTimes(1);
  });
});
