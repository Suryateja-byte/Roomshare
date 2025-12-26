/**
 * Simple MapLibre GL mock for Jest tests
 *
 * This is a minimal stub implementation - not comprehensive.
 * Complex map interactions should be tested in Playwright E2E.
 *
 * @see Plan stability adjustment #1: Map unit tests = smoke level only
 */

// Create mock instances that can be tracked in tests
export const mockMapInstance = {
  on: jest.fn(),
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

export const mockMarkerInstance = {
  setLngLat: jest.fn().mockReturnThis(),
  setPopup: jest.fn().mockReturnThis(),
  addTo: jest.fn().mockReturnThis(),
  remove: jest.fn(),
  getElement: jest.fn(() => {
    const el = document.createElement('div');
    el.dataset.placeId = '';
    return el;
  }),
};

export const mockPopupInstance = {
  setHTML: jest.fn().mockReturnThis(),
  setLngLat: jest.fn().mockReturnThis(),
  addTo: jest.fn().mockReturnThis(),
  remove: jest.fn(),
};

export const mockLngLatBoundsInstance = {
  extend: jest.fn().mockReturnThis(),
  isEmpty: jest.fn(() => false),
  getCenter: jest.fn(() => ({ lng: -122.4, lat: 37.7 })),
};

// Mock constructors
export const MockMap = jest.fn(() => mockMapInstance);
export const MockMarker = jest.fn(() => mockMarkerInstance);
export const MockPopup = jest.fn(() => mockPopupInstance);
export const MockLngLatBounds = jest.fn(() => mockLngLatBoundsInstance);

// Setup function to install the mock
export function setupMapLibreMock() {
  jest.mock('maplibre-gl', () => ({
    Map: MockMap,
    Marker: MockMarker,
    Popup: MockPopup,
    LngLatBounds: MockLngLatBounds,
  }));
}

// Reset all mock instances
export function resetMapLibreMocks() {
  jest.clearAllMocks();

  // Reset mockReturnThis chains
  mockMarkerInstance.setLngLat.mockReturnThis();
  mockMarkerInstance.setPopup.mockReturnThis();
  mockMarkerInstance.addTo.mockReturnThis();
  mockPopupInstance.setHTML.mockReturnThis();
  mockPopupInstance.setLngLat.mockReturnThis();
  mockPopupInstance.addTo.mockReturnThis();
  mockLngLatBoundsInstance.extend.mockReturnThis();
}

// Default export for jest.mock auto-mocking
export default {
  Map: MockMap,
  Marker: MockMarker,
  Popup: MockPopup,
  LngLatBounds: MockLngLatBounds,
};
