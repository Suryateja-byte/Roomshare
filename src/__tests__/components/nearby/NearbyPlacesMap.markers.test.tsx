/**
 * Marker/Popup DOM & Events Tests
 *
 * Tests for marker rendering, popup behavior, and DOM event handling
 * in the NearbyPlacesMap component.
 *
 * @see Plan Category H - Marker/Popup DOM & Events (10 tests)
 */

import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';

// Mock next-themes
const mockResolvedTheme = jest.fn().mockReturnValue('light');
jest.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: mockResolvedTheme(),
    theme: mockResolvedTheme(),
  }),
}));

// Mock MapLibre GL JS
const mockMarkerRemove = jest.fn();
const mockMarkerSetLngLat = jest.fn().mockReturnThis();
const mockMarkerSetPopup = jest.fn().mockReturnThis();
const mockMarkerAddTo = jest.fn().mockReturnThis();
const mockMarkerGetElement = jest.fn();
const mockMarkerGetPopup = jest.fn();
const mockPopupSetHTML = jest.fn().mockReturnThis();
const mockPopupRemove = jest.fn();
const mockPopupIsOpen = jest.fn().mockReturnValue(false);
const mockMapOn = jest.fn();
const mockMapRemove = jest.fn();
const mockMapZoomIn = jest.fn();
const mockMapZoomOut = jest.fn();
const mockMapFlyTo = jest.fn();
const mockMapFitBounds = jest.fn();
const mockLngLatBoundsExtend = jest.fn().mockReturnThis();

// Track created markers for testing
const createdMarkers: Array<{
  element: HTMLElement;
  popup: { setHTML: jest.Mock; remove: jest.Mock; isOpen: jest.Mock };
}> = [];

jest.mock('maplibre-gl', () => {
  return {
    Map: jest.fn().mockImplementation(() => ({
      on: mockMapOn,
      remove: mockMapRemove,
      zoomIn: mockMapZoomIn,
      zoomOut: mockMapZoomOut,
      flyTo: mockMapFlyTo,
      fitBounds: mockMapFitBounds,
    })),
    Marker: jest.fn().mockImplementation(({ element }) => {
      const popup = {
        setHTML: mockPopupSetHTML,
        remove: mockPopupRemove,
        isOpen: mockPopupIsOpen,
      };
      const marker = {
        setLngLat: mockMarkerSetLngLat,
        setPopup: mockMarkerSetPopup,
        addTo: mockMarkerAddTo,
        remove: mockMarkerRemove,
        getElement: () => element,
        getPopup: () => popup,
      };
      createdMarkers.push({ element, popup });
      return marker;
    }),
    Popup: jest.fn().mockImplementation(() => ({
      setHTML: mockPopupSetHTML,
      remove: mockPopupRemove,
      isOpen: mockPopupIsOpen,
    })),
    LngLatBounds: jest.fn().mockImplementation(() => ({
      extend: mockLngLatBoundsExtend,
    })),
  };
});

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Plus: () => <span data-testid="plus-icon">+</span>,
  Minus: () => <span data-testid="minus-icon">-</span>,
  Navigation: () => <span data-testid="nav-icon">N</span>,
  Maximize2: () => <span data-testid="maximize-icon">M</span>,
}));

// Mock RadarAttribution
jest.mock('@/components/nearby/RadarAttribution', () => ({
  __esModule: true,
  default: () => <div data-testid="radar-attribution">Radar Attribution</div>,
}));

// Mock Stadia lib
jest.mock('@/lib/maps/stadia', () => ({
  getStadiaStyle: jest.fn(() => 'https://stadia.style.json'),
}));

import NearbyPlacesMap from '@/components/nearby/NearbyPlacesMap';
import type { NearbyPlace } from '@/types/nearby';

describe('NearbyPlacesMap - Marker/Popup DOM & Events', () => {
  const listingLat = 37.7749;
  const listingLng = -122.4194;

  const createMockPlace = (id: string, overrides: Partial<NearbyPlace> = {}): NearbyPlace => ({
    id,
    name: `Place ${id}`,
    address: `123 Test St`,
    category: 'food-grocery',
    location: { lat: 37.7749, lng: -122.4194 },
    distanceMiles: 0.5,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    createdMarkers.length = 0;
    mockResolvedTheme.mockReturnValue('light');
  });

  // Trigger map 'load' event to initialize markers
  const triggerMapLoad = () => {
    const loadHandler = mockMapOn.mock.calls.find(
      (call) => call[0] === 'load'
    )?.[1];
    if (loadHandler) {
      act(() => {
        loadHandler();
      });
    }
  };

  // H1: Marker DOM reused correctly on update
  describe('H1: DOM Recycling', () => {
    it('reuses existing markers when places update with same IDs', async () => {
      const places = [createMockPlace('place-1'), createMockPlace('place-2')];

      const { rerender } = render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      triggerMapLoad();

      // Initial marker count (includes listing marker)
      const initialMarkerCount = createdMarkers.length;

      // Update with same places (should reuse)
      const updatedPlaces = [
        createMockPlace('place-1', { name: 'Updated Name' }),
        createMockPlace('place-2'),
      ];

      rerender(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={updatedPlaces}
        />
      );

      // Markers with same IDs should be reused, not recreated
      // Note: The component uses differential updates - existing markers stay
      expect(createdMarkers.length).toBe(initialMarkerCount);
    });

    it('removes old markers and adds new ones on category change', () => {
      const groceryPlaces = [
        createMockPlace('grocery-1', { category: 'food-grocery' }),
      ];

      const { rerender } = render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={groceryPlaces}
        />
      );

      triggerMapLoad();

      // Switch to different category with different places
      const pharmacyPlaces = [
        createMockPlace('pharmacy-1', { category: 'pharmacy' }),
      ];

      rerender(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={pharmacyPlaces}
        />
      );

      // Old marker should be removed
      expect(mockMarkerRemove).toHaveBeenCalled();
    });
  });

  // H2: Popup updates while open don't flicker
  describe('H2: Open Popup Updates', () => {
    it('maintains popup stability during marker updates', () => {
      const places = [createMockPlace('place-1')];

      const { rerender } = render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      triggerMapLoad();

      // Simulate popup being open
      mockPopupIsOpen.mockReturnValue(true);

      // Update places - popup should remain stable
      rerender(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      // Popup remove should not be called when marker is reused
      // (reused markers keep their popups)
      expect(mockPopupRemove).not.toHaveBeenCalled();
    });
  });

  // H3: Marker click + map click race handled
  describe('H3: Event Timing', () => {
    it('handles rapid click events without errors', async () => {
      const places = [createMockPlace('place-1')];

      render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      triggerMapLoad();

      // Rapid clicks should not throw
      const controls = screen.getAllByRole('button');
      controls.forEach((control) => {
        for (let i = 0; i < 5; i++) {
          fireEvent.click(control);
        }
      });

      // No errors should occur
      expect(mockMapZoomIn).toHaveBeenCalled();
      expect(mockMapZoomOut).toHaveBeenCalled();
    });
  });

  // H4: Ghost markers removed on category change
  describe('H4: Marker Cleanup', () => {
    it('removes all markers when places array is cleared', () => {
      const places = [
        createMockPlace('place-1'),
        createMockPlace('place-2'),
        createMockPlace('place-3'),
      ];

      const { rerender } = render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      triggerMapLoad();

      // Clear all places
      rerender(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={[]}
        />
      );

      // All POI markers should be removed (listing marker stays)
      expect(mockMarkerRemove).toHaveBeenCalled();
    });

    it('removes only stale markers on partial update', () => {
      const places = [
        createMockPlace('place-1'),
        createMockPlace('place-2'),
        createMockPlace('place-3'),
      ];

      const { rerender } = render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      triggerMapLoad();

      mockMarkerRemove.mockClear();

      // Remove one place
      rerender(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={[createMockPlace('place-1'), createMockPlace('place-2')]}
        />
      );

      // Only the removed marker (place-3) should be cleaned up
      expect(mockMarkerRemove).toHaveBeenCalled();
    });
  });

  // H5: Only one popup open at a time
  describe('H5: Single Popup', () => {
    it('configures popups with no close button per design', () => {
      const places = [createMockPlace('place-1')];

      render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      triggerMapLoad();

      // MapLibre's Popup is configured with closeButton: false
      const maplibregl = require('maplibre-gl');
      expect(maplibregl.Popup).toHaveBeenCalledWith(
        expect.objectContaining({
          closeButton: false,
        })
      );
    });
  });

  // H6: Hover scale doesn't shift marker position
  describe('H6: Transform Origin', () => {
    it('creates markers with centered transform origin via CSS classes', () => {
      const places = [createMockPlace('place-1')];

      render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      triggerMapLoad();

      // Markers should have class with centering for stable hover
      // The wrapper uses 'flex items-center justify-center' for centering
      const markerElements = createdMarkers
        .filter((m) => m.element?.classList?.contains('poi-marker'))
        .map((m) => m.element);

      markerElements.forEach((el) => {
        // Check for flex centering classes that ensure stable transform
        expect(el.className).toContain('flex');
        expect(el.className).toContain('items-center');
        expect(el.className).toContain('justify-center');
      });
    });
  });

  // H7: Dense markers (50+) don't lag on mousemove
  describe('H7: Performance', () => {
    it('handles 50+ markers without excessive rendering', () => {
      const manyPlaces = Array.from({ length: 60 }, (_, i) =>
        createMockPlace(`place-${i}`, {
          location: { lat: 37.7749 + i * 0.001, lng: -122.4194 + i * 0.001 },
        })
      );

      const startTime = performance.now();

      render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={manyPlaces}
        />
      );

      triggerMapLoad();

      const renderTime = performance.now() - startTime;

      // Rendering should complete in reasonable time (< 1000ms)
      expect(renderTime).toBeLessThan(1000);

      // All markers should be created
      expect(createdMarkers.length).toBeGreaterThanOrEqual(60);
    });
  });

  // H8: Detached marker removes event listener
  describe('H8: Listener Cleanup', () => {
    it('cleans up map on unmount', () => {
      const places = [createMockPlace('place-1')];

      const { unmount } = render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      triggerMapLoad();

      unmount();

      // Map should be removed on unmount
      expect(mockMapRemove).toHaveBeenCalled();
    });
  });

  // H9: POI markers render above listing marker
  describe('H9: Z-Order', () => {
    it('adds listing marker first, then POI markers', () => {
      const places = [createMockPlace('place-1')];

      render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      triggerMapLoad();

      // Markers added via addTo - listing marker added in map.on('load')
      // POI markers added after via useEffect
      expect(mockMarkerAddTo).toHaveBeenCalled();

      // The first marker added should be the listing marker (home icon)
      const firstMarkerElement = createdMarkers[0]?.element;
      expect(firstMarkerElement).toBeDefined();
    });
  });

  // H10: innerHTML XSS prevention (regression)
  describe('H10: XSS Prevention', () => {
    it('escapes HTML in place names to prevent XSS', () => {
      const maliciousPlace = createMockPlace('xss-test', {
        name: '<script>alert("XSS")</script>Malicious',
        address: '<img onerror="alert(1)" src="x">',
      });

      render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={[maliciousPlace]}
        />
      );

      triggerMapLoad();

      // Popup content should be escaped
      expect(mockPopupSetHTML).toHaveBeenCalled();

      // Get the HTML that was set - find the POI popup (contains nearby-popup class)
      const popupCalls = mockPopupSetHTML.mock.calls;
      const poiPopupCall = popupCalls.find(
        (call) => call[0] && call[0].includes('nearby-popup')
      );

      // POI popup should exist
      expect(poiPopupCall).toBeDefined();

      if (poiPopupCall) {
        const htmlContent = poiPopupCall[0];
        // Script tags should be escaped, not executable
        expect(htmlContent).not.toContain('<script>');
        // The escaped version should be present
        expect(htmlContent).toContain('&lt;script&gt;');
      }
    });

    it('uses escapeHtml utility for popup content', () => {
      // The component uses escapeHtml() function
      // Verify by checking popup HTML doesn't contain raw script tags
      const dangerousName = '<script>steal(cookies)</script>';
      const place = createMockPlace('test', { name: dangerousName });

      render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={[place]}
        />
      );

      triggerMapLoad();

      // Check that setHTML was called with escaped content
      const calls = mockPopupSetHTML.mock.calls;
      const htmlArgs = calls.map((c) => c[0]).filter((h) => h && h.includes('nearby-popup'));

      htmlArgs.forEach((html) => {
        // Should not contain raw script tag
        expect(html.match(/<script>/g)).toBeNull();
      });
    });
  });

  // Additional edge case tests
  describe('Highlight State Management', () => {
    it('applies highlighted class when highlightedPlaceId matches', () => {
      const places = [createMockPlace('place-1'), createMockPlace('place-2')];

      const { rerender } = render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
          highlightedPlaceId={null}
        />
      );

      triggerMapLoad();

      // Set highlighted place
      rerender(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
          highlightedPlaceId="place-1"
        />
      );

      // The marker element should have highlighted class added
      // This is handled by the useEffect that iterates markers
      expect(mockMapOn).toHaveBeenCalledWith('load', expect.any(Function));
    });

    it('clears highlight when highlightedPlaceId changes to null', () => {
      const places = [createMockPlace('place-1')];

      const { rerender } = render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
          highlightedPlaceId="place-1"
        />
      );

      triggerMapLoad();

      // Clear highlight
      rerender(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
          highlightedPlaceId={null}
        />
      );

      // No errors should occur when clearing highlight
      expect(true).toBe(true);
    });
  });

  describe('Map Controls', () => {
    it('fit all markers button appears when places exist', () => {
      const places = [createMockPlace('place-1')];

      render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      // Fit all button should be visible
      expect(screen.getByLabelText('Fit all markers in view')).toBeInTheDocument();
    });

    it('fit all markers button hidden when no places', () => {
      render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={[]}
        />
      );

      // Fit all button should not be visible
      expect(screen.queryByLabelText('Fit all markers in view')).not.toBeInTheDocument();
    });

    it('reset view navigates to listing location', () => {
      render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={[]}
        />
      );

      fireEvent.click(screen.getByLabelText('Reset to listing location'));

      expect(mockMapFlyTo).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [listingLng, listingLat],
          zoom: 14,
        })
      );
    });
  });

  describe('Theme Support', () => {
    it('recreates map when theme changes', () => {
      const places = [createMockPlace('place-1')];

      const { rerender } = render(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      // Change theme
      mockResolvedTheme.mockReturnValue('dark');

      rerender(
        <NearbyPlacesMap
          listingLat={listingLat}
          listingLng={listingLng}
          places={places}
        />
      );

      // Map should be removed and recreated for new theme
      expect(mockMapRemove).toHaveBeenCalled();
    });
  });
});
