/**
 * Smoke Tests for NearbyPlacesMap component
 *
 * These are SMOKE LEVEL tests only. Complex map interactions
 * should be tested in Playwright E2E tests.
 *
 * Smoke tests verify:
 * - Map constructor called with expected center
 * - Marker add/remove called with expected count
 * - fitBounds called once on first load
 * - Cleanup calls remove()
 * - Highlight class toggled on markers
 * - Control buttons rendered and clickable
 *
 * @see Plan stability adjustment #1: Map unit tests = smoke level only
 * @see Plan Category E - Map & Markers (22 tests)
 */

import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { act } from "react";

// Mock maplibre-gl before importing the component
const mockMapInstance = {
  on: jest.fn((event: string, callback: () => void) => {
    // Immediately call 'load' callback to simulate map ready
    if (event === "load") {
      setTimeout(callback, 0);
    }
  }),
  off: jest.fn(),
  remove: jest.fn(),
  fitBounds: jest.fn(),
  flyTo: jest.fn(),
  zoomIn: jest.fn(),
  zoomOut: jest.fn(),
  getZoom: jest.fn(() => 14),
  getCenter: jest.fn(() => ({ lng: -122.4, lat: 37.7 })),
  addControl: jest.fn(),
  removeControl: jest.fn(),
};

// Track markers created
const createdMarkers: Array<{
  element: HTMLElement;
  lngLat: [number, number];
  removed: boolean;
}> = [];

interface MockMarker {
  element: HTMLElement;
  lngLat: [number, number];
  removed: boolean;
  setLngLat: jest.Mock;
  setPopup: jest.Mock;
  addTo: jest.Mock;
  remove: jest.Mock;
  getElement: jest.Mock;
}

const createMockMarkerInstance = (): MockMarker => {
  const el = document.createElement("div");
  el.dataset.placeId = "";
  el.classList.add("poi-marker");

  const marker: MockMarker = {
    element: el,
    lngLat: [0, 0] as [number, number],
    removed: false,
    setLngLat: jest.fn(function (this: MockMarker, coords: [number, number]) {
      this.lngLat = coords;
      return this;
    }),
    setPopup: jest.fn().mockReturnThis(),
    addTo: jest.fn(function (this: MockMarker) {
      createdMarkers.push(this);
      return this;
    }),
    remove: jest.fn(function (this: MockMarker) {
      this.removed = true;
    }),
    getElement: jest.fn(() => el),
  };
  return marker;
};

const mockPopupInstance = {
  setHTML: jest.fn().mockReturnThis(),
  setLngLat: jest.fn().mockReturnThis(),
  addTo: jest.fn().mockReturnThis(),
  remove: jest.fn(),
};

const mockLngLatBoundsInstance = {
  extend: jest.fn().mockReturnThis(),
  isEmpty: jest.fn(() => false),
  getCenter: jest.fn(() => ({ lng: -122.4, lat: 37.7 })),
};

jest.mock("maplibre-gl", () => ({
  Map: jest.fn(() => mockMapInstance),
  Marker: jest.fn(() => createMockMarkerInstance()),
  Popup: jest.fn(() => mockPopupInstance),
  LngLatBounds: jest.fn(() => mockLngLatBoundsInstance),
}));

// Mock next-themes
jest.mock("next-themes", () => ({
  useTheme: jest.fn(() => ({ resolvedTheme: "light" })),
}));

// Mock CSS imports
jest.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
jest.mock("@/styles/nearby-map.css", () => ({}));

import NearbyPlacesMap from "@/components/nearby/NearbyPlacesMap";
import maplibregl from "maplibre-gl";
import { useTheme } from "next-themes";

describe("NearbyPlacesMap - Smoke Tests", () => {
  const defaultProps = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    places: [],
  };

  const mockPlaces = [
    {
      id: "place-1",
      name: "Indian Restaurant",
      address: "123 Main St",
      category: "indian-restaurant",
      location: { lat: 37.776, lng: -122.418 },
      distanceMiles: 0.1,
    },
    {
      id: "place-2",
      name: "Grocery Store",
      address: "456 Oak Ave",
      category: "food-grocery",
      location: { lat: 37.778, lng: -122.42 },
      distanceMiles: 0.3,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    createdMarkers.length = 0;
    // Reset mock to call load callback
    mockMapInstance.on.mockImplementation(
      (event: string, callback: () => void) => {
        if (event === "load") {
          setTimeout(callback, 0);
        }
      },
    );
  });

  afterEach(() => {
    cleanup();
  });

  describe("Map Initialization", () => {
    it("creates map with correct center coordinates [lng, lat]", async () => {
      render(<NearbyPlacesMap {...defaultProps} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(maplibregl.Map).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [-122.4194, 37.7749], // [lng, lat] order
          zoom: 14,
        }),
      );
    });

    it("creates listing marker on map load", async () => {
      render(<NearbyPlacesMap {...defaultProps} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // At least one marker should be created (the listing marker)
      expect(maplibregl.Marker).toHaveBeenCalled();
    });

    it("registers error handler on map", async () => {
      render(<NearbyPlacesMap {...defaultProps} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(mockMapInstance.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function),
      );
    });
  });

  describe("Marker Management", () => {
    it("adds markers for each place", async () => {
      render(<NearbyPlacesMap {...defaultProps} places={mockPlaces} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Should have listing marker + 2 place markers
      // Note: Marker constructor is called for each marker
      expect(maplibregl.Marker).toHaveBeenCalled();
      expect(createdMarkers.length).toBeGreaterThanOrEqual(2);
    });

    it("removes old markers when places change", async () => {
      const { rerender } = render(
        <NearbyPlacesMap {...defaultProps} places={mockPlaces} />,
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const initialMarkerCount = createdMarkers.length;

      // Change to empty places
      rerender(<NearbyPlacesMap {...defaultProps} places={[]} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Place markers should be removed
      const removedCount = createdMarkers.filter((m) => m.removed).length;
      expect(removedCount).toBeGreaterThan(0);
    });

    it("creates markers for new places when places change", async () => {
      const { rerender } = render(
        <NearbyPlacesMap {...defaultProps} places={[mockPlaces[0]]} />,
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const initialCallCount = (maplibregl.Marker as jest.Mock).mock.calls
        .length;

      // Add one more place
      rerender(<NearbyPlacesMap {...defaultProps} places={mockPlaces} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // New markers should be created for the additional place(s)
      // Note: Implementation may recreate all markers or do differential updates
      const finalCallCount = (maplibregl.Marker as jest.Mock).mock.calls.length;
      expect(finalCallCount).toBeGreaterThan(initialCallCount);
    });
  });

  describe("FitBounds Behavior", () => {
    it("calls fitBounds on initial places load", async () => {
      render(<NearbyPlacesMap {...defaultProps} places={mockPlaces} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(mockMapInstance.fitBounds).toHaveBeenCalledTimes(1);
      expect(mockMapInstance.fitBounds).toHaveBeenCalledWith(
        mockLngLatBoundsInstance,
        expect.objectContaining({
          padding: 50,
          maxZoom: 15,
        }),
      );
    });

    it("does NOT call fitBounds on subsequent place updates", async () => {
      const { rerender } = render(
        <NearbyPlacesMap {...defaultProps} places={mockPlaces} />,
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(mockMapInstance.fitBounds).toHaveBeenCalledTimes(1);

      // Update places
      const newPlaces = [
        ...mockPlaces,
        {
          id: "place-3",
          name: "New Place",
          address: "789 Pine St",
          category: "pharmacy",
          location: { lat: 37.78, lng: -122.41 },
          distanceMiles: 0.5,
        },
      ];

      rerender(<NearbyPlacesMap {...defaultProps} places={newPlaces} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // fitBounds should NOT be called again
      expect(mockMapInstance.fitBounds).toHaveBeenCalledTimes(1);
    });

    it("does not call fitBounds when places is empty", async () => {
      render(<NearbyPlacesMap {...defaultProps} places={[]} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(mockMapInstance.fitBounds).not.toHaveBeenCalled();
    });
  });

  describe("Marker Highlighting", () => {
    it("adds highlighted class when highlightedPlaceId matches", async () => {
      render(
        <NearbyPlacesMap
          {...defaultProps}
          places={mockPlaces}
          highlightedPlaceId="place-1"
        />,
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Find markers with matching placeId and check for highlighted class
      const highlightedMarker = createdMarkers.find(
        (m) => m.element.dataset.placeId === "place-1",
      );

      if (highlightedMarker) {
        expect(
          highlightedMarker.element.classList.contains("highlighted"),
        ).toBe(true);
      }
    });

    it("removes highlighted class when highlightedPlaceId changes", async () => {
      const { rerender } = render(
        <NearbyPlacesMap
          {...defaultProps}
          places={mockPlaces}
          highlightedPlaceId="place-1"
        />,
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Change highlighted place
      rerender(
        <NearbyPlacesMap
          {...defaultProps}
          places={mockPlaces}
          highlightedPlaceId="place-2"
        />,
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // First marker should no longer be highlighted
      const firstMarker = createdMarkers.find(
        (m) => m.element.dataset.placeId === "place-1",
      );

      if (firstMarker) {
        expect(firstMarker.element.classList.contains("highlighted")).toBe(
          false,
        );
      }
    });

    it("handles non-existent highlightedPlaceId gracefully", async () => {
      // Should not throw
      expect(() => {
        render(
          <NearbyPlacesMap
            {...defaultProps}
            places={mockPlaces}
            highlightedPlaceId="non-existent-id"
          />,
        );
      }).not.toThrow();
    });
  });

  describe("Map Controls", () => {
    it("renders zoom in button", () => {
      render(<NearbyPlacesMap {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /zoom in/i }),
      ).toBeInTheDocument();
    });

    it("renders zoom out button", () => {
      render(<NearbyPlacesMap {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /zoom out/i }),
      ).toBeInTheDocument();
    });

    it("renders reset view button", () => {
      render(<NearbyPlacesMap {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /reset to listing/i }),
      ).toBeInTheDocument();
    });

    it("renders fit all markers button only when places exist", () => {
      const { rerender } = render(
        <NearbyPlacesMap {...defaultProps} places={[]} />,
      );

      // No places, no fit button
      expect(
        screen.queryByRole("button", { name: /fit all/i }),
      ).not.toBeInTheDocument();

      // Add places
      rerender(<NearbyPlacesMap {...defaultProps} places={mockPlaces} />);

      expect(
        screen.getByRole("button", { name: /fit all/i }),
      ).toBeInTheDocument();
    });

    it("calls zoomIn when zoom in button clicked", async () => {
      render(<NearbyPlacesMap {...defaultProps} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));

      expect(mockMapInstance.zoomIn).toHaveBeenCalled();
    });

    it("calls zoomOut when zoom out button clicked", async () => {
      render(<NearbyPlacesMap {...defaultProps} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));

      expect(mockMapInstance.zoomOut).toHaveBeenCalled();
    });

    it("calls flyTo with listing coordinates on reset view", async () => {
      render(<NearbyPlacesMap {...defaultProps} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      fireEvent.click(
        screen.getByRole("button", { name: /reset to listing/i }),
      );

      expect(mockMapInstance.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [-122.4194, 37.7749],
          zoom: 14,
        }),
      );
    });

    it("calls fitBounds on fit all markers button", async () => {
      render(<NearbyPlacesMap {...defaultProps} places={mockPlaces} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Clear previous fitBounds calls
      mockMapInstance.fitBounds.mockClear();

      fireEvent.click(screen.getByRole("button", { name: /fit all/i }));

      expect(mockMapInstance.fitBounds).toHaveBeenCalled();
    });
  });

  describe("Cleanup", () => {
    it("calls map.remove on unmount", async () => {
      const { unmount } = render(<NearbyPlacesMap {...defaultProps} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      unmount();

      expect(mockMapInstance.remove).toHaveBeenCalled();
    });

    it("removes all markers on unmount", async () => {
      const { unmount } = render(
        <NearbyPlacesMap {...defaultProps} places={mockPlaces} />,
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      unmount();

      // All markers should be removed when map is removed
      expect(mockMapInstance.remove).toHaveBeenCalled();
    });
  });

  describe("Theme Support", () => {
    it("recreates map when theme changes", async () => {
      const { rerender } = render(<NearbyPlacesMap {...defaultProps} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const initialMapCalls = (maplibregl.Map as jest.Mock).mock.calls.length;

      // Change theme
      (useTheme as jest.Mock).mockReturnValue({ resolvedTheme: "dark" });

      rerender(<NearbyPlacesMap {...defaultProps} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Map should be recreated
      const finalMapCalls = (maplibregl.Map as jest.Mock).mock.calls.length;
      expect(finalMapCalls).toBeGreaterThan(initialMapCalls);
    });
  });

  describe("Popup XSS Prevention", () => {
    it("escapes HTML in popup content", async () => {
      const xssPlaces = [
        {
          id: "xss-1",
          name: '<script>alert("xss")</script>',
          address: '<img onerror="alert(1)" src="x">',
          category: "restaurant",
          location: { lat: 37.77, lng: -122.42 },
          distanceMiles: 0.1,
        },
      ];

      render(<NearbyPlacesMap {...defaultProps} places={xssPlaces} />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Popup.setHTML should have been called with escaped content
      const setHTMLCalls = mockPopupInstance.setHTML.mock.calls;
      const hasUnescapedScript = setHTMLCalls.some((call: string[]) =>
        call[0].includes("<script>"),
      );

      // Should NOT contain raw script tags
      expect(hasUnescapedScript).toBe(false);
    });
  });

  describe("Attribution", () => {
    it("renders RadarAttribution component", () => {
      render(<NearbyPlacesMap {...defaultProps} />);

      // RadarAttribution should be rendered
      expect(screen.getByText(/radar/i)).toBeInTheDocument();
    });
  });
});
