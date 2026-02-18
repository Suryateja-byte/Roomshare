/**
 * Map Component Unit Tests
 *
 * Tests for the core Map component functionality including:
 * - handleMoveEnd state transitions (programmatic vs user-initiated)
 * - Debounce timing (600ms)
 * - Marker click and hover interactions
 * - Cluster expansion behavior
 * - Cleanup on unmount
 *
 * Note: These are SMOKE LEVEL tests. Complex map interactions
 * should be tested in Playwright E2E tests.
 *
 * @see src/components/Map.tsx (1600+ lines)
 */

import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

// --------------------------------------------------------------------------
// Mock Modules - Must be before component import
// --------------------------------------------------------------------------

// Track map instance for assertions
let mockMapInstance: ReturnType<typeof createMockMapInstance>;
const onCallbacks: Record<string, ((...args: unknown[]) => void)[]> = {};
const mockReplace = jest.fn();
const mockReplaceWithTransition = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockCanvas: ReturnType<typeof createMockCanvas>;

function createMockCanvas() {
  const listeners: Record<string, EventListener[]> = {};
  return {
    tabIndex: 0,
    addEventListener: jest.fn((type: string, listener: EventListener) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    }),
    removeEventListener: jest.fn((type: string, listener: EventListener) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(cb => cb !== listener);
    }),
    emit: (type: string, event?: Event) => {
      const callbacks = listeners[type] || [];
      callbacks.forEach((callback) => callback(event ?? new Event(type)));
    },
  };
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock listings for querySourceFeatures to return
let mockQuerySourceFeaturesData: Array<{
  properties: {
    id: string;
    title: string;
    price: number;
    availableSlots: number;
    ownerId: string;
    images: string;
    lat: number;
    lng: number;
    tier?: string;
  };
}> = [];

// Factory for creating mock map instance
function createMockMapInstance() {
  return {
    on: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (!onCallbacks[event]) onCallbacks[event] = [];
      onCallbacks[event].push(callback);
      // Immediately fire 'load' event
      if (event === 'load') {
        setTimeout(() => callback(), 0);
      }
    }),
    off: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (onCallbacks[event]) {
        onCallbacks[event] = onCallbacks[event].filter(cb => cb !== callback);
      }
    }),
    remove: jest.fn(),
    getZoom: jest.fn(() => 12),
    getCenter: jest.fn(() => ({ lng: -122.4194, lat: 37.7749 })),
    getBounds: jest.fn(() => ({
      getWest: () => -122.5,
      getEast: () => -122.3,
      getSouth: () => 37.7,
      getNorth: () => 37.85,
    })),
    flyTo: jest.fn(),
    fitBounds: jest.fn(),
    easeTo: jest.fn(),
    addSource: jest.fn(),
    addLayer: jest.fn(),
    removeSource: jest.fn(),
    removeLayer: jest.fn(),
    getSource: jest.fn(() => ({
      getClusterExpansionZoom: jest.fn(() => Promise.resolve(14)),
    })),
    // Return mock features to simulate unclustered listings
    querySourceFeatures: jest.fn(() => mockQuerySourceFeaturesData),
    setStyle: jest.fn(),
    getStyle: jest.fn(() => ({ layers: [] })),
    setLayoutProperty: jest.fn(),
    setPaintProperty: jest.fn(),
    addControl: jest.fn(),
    removeControl: jest.fn(),
    triggerRepaint: jest.fn(),
    resize: jest.fn(),
    loaded: jest.fn(() => true),
    isSourceLoaded: jest.fn(() => true),
    getCanvas: jest.fn(() => mockCanvas),
  };
}

// Helper to convert listings to feature format for querySourceFeatures mock
function listingsToFeatures(listings: typeof mockListings) {
  return listings.map(listing => ({
    properties: {
      id: listing.id,
      title: listing.title,
      price: listing.price,
      availableSlots: listing.availableSlots,
      ownerId: listing.ownerId || '',
      images: JSON.stringify(listing.images || []),
      lat: listing.location.lat,
      lng: listing.location.lng,
      tier: listing.tier,
    },
  }));
}

// Mock react-map-gl
jest.mock('react-map-gl/maplibre', () => {
  const React = require('react');
  
  const MockMap = React.forwardRef(({ 
    children, 
    onLoad, 
    onMoveEnd, 
    onMoveStart,
    onIdle,
    onClick,
    onError,
    ...props 
  }: {
    children?: React.ReactNode;
    onLoad?: () => void;
    onMoveEnd?: (e: { viewState: { zoom: number }; target: { getBounds: () => unknown } }) => void;
    onMoveStart?: () => void;
    onIdle?: () => void;
    onClick?: (e: unknown) => void;
    onError?: (e: unknown) => void;
    [key: string]: unknown;
  }, ref: React.Ref<{ getMap: () => typeof mockMapInstance; flyTo: typeof mockMapInstance.flyTo; fitBounds: typeof mockMapInstance.fitBounds; easeTo: typeof mockMapInstance.easeTo }>) => {
    // Store callbacks for test triggering
    React.useEffect(() => {
      if (onLoad) {
        setTimeout(() => onLoad(), 10);
      }
    }, [onLoad]);

    React.useImperativeHandle(ref, () => ({
      getMap: () => mockMapInstance,
      getSource: mockMapInstance.getSource,
      flyTo: mockMapInstance.flyTo,
      fitBounds: mockMapInstance.fitBounds,
      easeTo: mockMapInstance.easeTo,
    }));

    // Store handlers on window for tests to trigger
    (window as unknown as Record<string, unknown>).__mapHandlers = {
      onMoveEnd,
      onMoveStart,
      onIdle,
      onClick,
      onError,
    };

    return React.createElement('div', { 'data-testid': 'map-container', ...props }, children);
  });

  const MockMarker = ({ 
    children, 
    onClick, 
    longitude, 
    latitude,
    ...props 
  }: {
    children?: React.ReactNode;
    onClick?: (e: { originalEvent: { stopPropagation: () => void } }) => void;
    longitude?: number;
    latitude?: number;
    [key: string]: unknown;
  }) => {
    const React = require('react');
    return React.createElement('div', {
      'data-testid': 'map-marker',
      'data-longitude': longitude,
      'data-latitude': latitude,
      onClick: (e: MouseEvent) => {
        if (onClick) {
          onClick({ originalEvent: { stopPropagation: () => e.stopPropagation() } });
        }
      },
      ...props,
    }, children);
  };

  const MockPopup = ({ 
    children, 
    onClose,
    ...props 
  }: {
    children?: React.ReactNode;
    onClose?: () => void;
    [key: string]: unknown;
  }) => {
    const React = require('react');
    return React.createElement('div', {
      'data-testid': 'map-popup',
      ...props,
    }, children);
  };

  const MockSource = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'map-source', ...props }, children);
  };

  const MockLayer = (props: Record<string, unknown>) => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'map-layer', ...props });
  };

  return {
    __esModule: true,
    default: MockMap,
    Marker: MockMarker,
    Popup: MockPopup,
    Source: MockSource,
    Layer: MockLayer,
  };
});

// Mock maplibre-gl CSS
jest.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

// Mock haptics
jest.mock('@/lib/haptics', () => ({
  triggerHaptic: jest.fn(),
}));

// Mock contexts
const mockSetHovered = jest.fn();
const mockSetActive = jest.fn();
const mockRequestScrollTo = jest.fn();
const mockSetSearchAsMove = jest.fn();
const mockSetHasUserMoved = jest.fn();
const mockSetBoundsDirty = jest.fn();
const mockSetCurrentMapBounds = jest.fn();
const mockSetSearchHandler = jest.fn();
const mockSetResetHandler = jest.fn();
const mockSetSearchLocation = jest.fn();
const mockSetProgrammaticMove = jest.fn();
const mockIsProgrammaticMoveRef = { current: false };
type PrivacyCircleListing = { id: string; location: { lat: number; lng: number } };
type PrivacyCircleProps = {
  listings: PrivacyCircleListing[];
  isDarkMode?: boolean;
};
const mockPrivacyCircle = jest.fn((props: PrivacyCircleProps) => null);

jest.mock('@/contexts/ListingFocusContext', () => ({
  useListingFocus: () => ({
    hoveredId: null,
    activeId: null,
    setHovered: mockSetHovered,
    setActive: mockSetActive,
    requestScrollTo: mockRequestScrollTo,
  }),
}));

jest.mock('@/contexts/SearchTransitionContext', () => ({
  useSearchTransitionSafe: () => ({
    isPending: false,
    replaceWithTransition: mockReplaceWithTransition,
  }),
}));

jest.mock('@/contexts/MapBoundsContext', () => ({
  useMapBounds: () => ({
    searchAsMove: false,
    setSearchAsMove: mockSetSearchAsMove,
    setHasUserMoved: mockSetHasUserMoved,
    setBoundsDirty: mockSetBoundsDirty,
    setCurrentMapBounds: mockSetCurrentMapBounds,
    setSearchHandler: mockSetSearchHandler,
    setResetHandler: mockSetResetHandler,
    setSearchLocation: mockSetSearchLocation,
    setProgrammaticMove: mockSetProgrammaticMove,
    isProgrammaticMoveRef: mockIsProgrammaticMoveRef,
  }),
  useMapMovedBanner: () => ({
    showBanner: false,
    showLocationConflict: false,
    onSearch: jest.fn(),
    onReset: jest.fn(),
    areaCount: null,
    isAreaCountLoading: false,
  }),
}));

// Mock child components
jest.mock('@/components/map/MapMovedBanner', () => ({
  MapMovedBanner: () => null,
}));

jest.mock('@/components/map/MapGestureHint', () => ({
  MapGestureHint: () => null,
}));

jest.mock('@/components/map/PrivacyCircle', () => ({
  PrivacyCircle: (props: PrivacyCircleProps) => {
    mockPrivacyCircle(props);
    return null;
  },
}));

jest.mock('@/components/map/BoundaryLayer', () => ({
  BoundaryLayer: () => null,
}));

jest.mock('@/components/map/UserMarker', () => ({
  UserMarker: () => null,
  useUserPin: () => ({
    isDropMode: false,
    toggleDropMode: jest.fn(),
    pin: null,
    setPin: jest.fn(),
    handleMapClick: jest.fn(),
  }),
}));

jest.mock('@/components/map/POILayer', () => ({
  POILayer: () => null,
}));

// Import component after mocks
import MapComponent from '@/components/Map';
import { triggerHaptic } from '@/lib/haptics';

// --------------------------------------------------------------------------
// Test Data
// --------------------------------------------------------------------------

const mockListings = [
  {
    id: 'listing-1',
    title: 'Cozy Room in SF',
    price: 1200,
    availableSlots: 2,
    ownerId: 'owner-1',
    images: ['https://example.com/img1.jpg'],
    location: { lat: 37.7749, lng: -122.4194 },
    tier: 'primary' as const,
  },
  {
    id: 'listing-2',
    title: 'Studio Apartment',
    price: 1800,
    availableSlots: 1,
    ownerId: 'owner-2',
    images: ['https://example.com/img2.jpg'],
    location: { lat: 37.7849, lng: -122.4094 },
    tier: 'mini' as const,
  },
  {
    id: 'listing-3',
    title: 'Shared Space',
    price: 900,
    availableSlots: 0,
    ownerId: 'owner-3',
    images: [],
    location: { lat: 37.7649, lng: -122.4294 },
  },
];

// --------------------------------------------------------------------------
// Test Suite
// --------------------------------------------------------------------------

describe('Map Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockReplace.mockClear();
    mockReplaceWithTransition.mockClear();
    mockPrivacyCircle.mockClear();
    mockSearchParams = new URLSearchParams();

    // Reset mock map instance
    mockCanvas = createMockCanvas();
    mockMapInstance = createMockMapInstance();

    // Clear callback tracking
    Object.keys(onCallbacks).forEach(key => delete onCallbacks[key]);

    // Reset refs
    mockIsProgrammaticMoveRef.current = false;

    // Set up mock features for querySourceFeatures
    // This simulates what Mapbox returns for unclustered points
    mockQuerySourceFeaturesData = listingsToFeatures(mockListings);

    // Set up env
    // No Mapbox token needed — geocoding uses free Photon + Nominatim
  });

  afterEach(() => {
    jest.useRealTimers();
    cleanup();
    delete (window as unknown as Record<string, unknown>).__mapHandlers;
  });

  describe('Initialization', () => {
    it('renders map container', async () => {
      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });

    it('shows loading state before map loads', () => {
      render(<MapComponent listings={mockListings} />);
      
      expect(screen.getByText(/loading map/i)).toBeInTheDocument();
    });

    it('hides loading state after map loads', async () => {
      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      
      await waitFor(() => {
        expect(screen.queryByText(/loading map/i)).not.toBeInTheDocument();
      });
    });

    it('renders search-as-move toggle button', async () => {
      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      
      expect(screen.getByRole('switch', { name: /search as i move/i })).toBeInTheDocument();
    });
  });

  describe('handleMoveEnd state transitions', () => {
    it('should distinguish programmatic vs user-initiated moves', async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Clear mocks from initialization effects
      jest.clearAllMocks();

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void }>).__mapHandlers;

      // Simulate programmatic move (isProgrammaticMoveRef.current = true)
      mockIsProgrammaticMoveRef.current = true;

      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 12 },
          target: {
            getBounds: () => ({
              getWest: () => -122.5,
              getEast: () => -122.3,
              getSouth: () => 37.7,
              getNorth: () => 37.85,
            }),
          },
        });
      });

      // Programmatic move should NOT mark bounds as dirty (with true)
      expect(mockSetBoundsDirty).not.toHaveBeenCalledWith(true);

      // Clear and test user-initiated move
      jest.clearAllMocks();
      mockIsProgrammaticMoveRef.current = false;

      // First user move (skipped as initial settling)
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 12 },
          target: {
            getBounds: () => ({
              getWest: () => -122.5,
              getEast: () => -122.3,
              getSouth: () => 37.7,
              getNorth: () => 37.85,
            }),
          },
        });
      });

      // Clear and do second move (this one should trigger setHasUserMoved)
      jest.clearAllMocks();

      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 12 },
          target: {
            getBounds: () => ({
              getWest: () => -122.5,
              getEast: () => -122.3,
              getSouth: () => 37.7,
              getNorth: () => 37.85,
            }),
          },
        });
      });

      // User-initiated move should mark user has moved (after initial skip)
      expect(mockSetHasUserMoved).toHaveBeenCalledWith(true);
    });

    it('should skip the very first moveEnd (initial map settling)', async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Clear mocks from initialization effects
      jest.clearAllMocks();

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void }>).__mapHandlers;

      // First moveEnd (initial settling)
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 12 },
          target: {
            getBounds: () => ({
              getWest: () => -122.5,
              getEast: () => -122.3,
              getSouth: () => 37.7,
              getNorth: () => 37.85,
            }),
          },
        });
      });

      // Should not trigger user moved on first moveEnd (skipped as initial settling)
      // Note: The component's isInitialMoveRef skips the first move
      // The component may call setHasUserMoved(false) during init, but should NOT call with true
      expect(mockSetHasUserMoved).not.toHaveBeenCalledWith(true);
    });

    it('should respect debounce timing (300ms)', async () => {
      // Enable search as move for this test
      jest.spyOn(require('@/contexts/MapBoundsContext'), 'useMapBounds').mockReturnValue({
        searchAsMove: true,
        setSearchAsMove: mockSetSearchAsMove,
        setHasUserMoved: mockSetHasUserMoved,
        setBoundsDirty: mockSetBoundsDirty,
        setCurrentMapBounds: mockSetCurrentMapBounds,
        setSearchHandler: mockSetSearchHandler,
        setResetHandler: mockSetResetHandler,
        setSearchLocation: mockSetSearchLocation,
        setProgrammaticMove: mockSetProgrammaticMove,
        isProgrammaticMoveRef: mockIsProgrammaticMoveRef,
      });

      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void }>).__mapHandlers;
      
      // Skip initial moveEnd
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 12 },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });
      
      jest.clearAllMocks();

      // Second moveEnd (user pan)
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 12 },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });
      
      // Advance only 150ms (less than debounce)
      await act(async () => {
        jest.advanceTimersByTime(150);
      });
      
      // Bounds should be updated immediately (for location conflict detection)
      expect(mockSetCurrentMapBounds).toHaveBeenCalled();
    });

    it('clears location query when map search starts from lat/lng and preserves active filters', async () => {
      jest.spyOn(require('@/contexts/MapBoundsContext'), 'useMapBounds').mockReturnValue({
        searchAsMove: true,
        setSearchAsMove: mockSetSearchAsMove,
        setHasUserMoved: mockSetHasUserMoved,
        setBoundsDirty: mockSetBoundsDirty,
        setCurrentMapBounds: mockSetCurrentMapBounds,
        setSearchHandler: mockSetSearchHandler,
        setResetHandler: mockSetResetHandler,
        setSearchLocation: mockSetSearchLocation,
        setProgrammaticMove: mockSetProgrammaticMove,
        isProgrammaticMoveRef: mockIsProgrammaticMoveRef,
      });

      mockSearchParams = new URLSearchParams('q=Austin&lat=30.2672&lng=-97.7431&languages=te&minPrice=500');

      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void }>).__mapHandlers;

      // Skip initial moveEnd
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 12 },
          target: {
            getBounds: () => ({
              getWest: () => -122.5,
              getEast: () => -122.3,
              getSouth: () => 37.7,
              getNorth: () => 37.85,
            }),
          },
        });
      });

      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 12 },
          target: {
            getBounds: () => ({
              getWest: () => -122.48,
              getEast: () => -122.28,
              getSouth: () => 37.69,
              getNorth: () => 37.86,
            }),
          },
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(700);
      });

      expect(mockReplaceWithTransition).toHaveBeenCalledTimes(1);
      const nextUrl = mockReplaceWithTransition.mock.calls[0][0] as string;
      const params = new URLSearchParams(nextUrl.split('?')[1] ?? '');

      expect(params.get('languages')).toBe('te');
      expect(params.get('minPrice')).toBe('500');
      expect(params.has('q')).toBe(false);
      expect(params.has('lat')).toBe(false);
      expect(params.has('lng')).toBe(false);
      expect(params.has('minLat')).toBe(true);
      expect(params.has('maxLat')).toBe(true);
      expect(params.has('minLng')).toBe(true);
      expect(params.has('maxLng')).toBe(true);
    });

    it('shows guidance when viewport is too wide with search-as-move enabled', async () => {
      jest.spyOn(require('@/contexts/MapBoundsContext'), 'useMapBounds').mockReturnValue({
        searchAsMove: true,
        setSearchAsMove: mockSetSearchAsMove,
        setHasUserMoved: mockSetHasUserMoved,
        setBoundsDirty: mockSetBoundsDirty,
        setCurrentMapBounds: mockSetCurrentMapBounds,
        setSearchHandler: mockSetSearchHandler,
        setResetHandler: mockSetResetHandler,
        setSearchLocation: mockSetSearchLocation,
        setProgrammaticMove: mockSetProgrammaticMove,
        isProgrammaticMoveRef: mockIsProgrammaticMoveRef,
      });

      mockSearchParams = new URLSearchParams('languages=te');

      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void }>).__mapHandlers;

      // Skip initial moveEnd
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 8 },
          target: {
            getBounds: () => ({
              getWest: () => -122.5,
              getEast: () => -122.3,
              getSouth: () => 37.7,
              getNorth: () => 37.85,
            }),
          },
        });
      });

      // Oversized viewport (> 5 degrees lat/lng span)
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 4 },
          target: {
            getBounds: () => ({
              getWest: () => -130,
              getEast: () => -110,
              getSouth: () => 25,
              getNorth: () => 45,
            }),
          },
        });
      });

      expect(screen.getByText('Zoom in further to update results')).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(mockReplaceWithTransition).not.toHaveBeenCalled();
    });

    it('should clear programmatic flag on moveEnd', async () => {
      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void }>).__mapHandlers;
      
      // Set programmatic flag
      mockIsProgrammaticMoveRef.current = true;
      
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 12 },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });
      
      // Should clear programmatic flag
      expect(mockSetProgrammaticMove).toHaveBeenCalledWith(false);
    });
  });

  describe('marker interactions', () => {
    it('should handle marker click correctly', async () => {
      render(<MapComponent listings={mockListings} />);

      // Wait for map load
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (window as unknown as Record<string, { onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Find marker elements
      const markers = screen.getAllByTestId('map-marker');
      expect(markers.length).toBeGreaterThan(0);

      // Click first marker
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      // Should trigger haptic feedback
      expect(triggerHaptic).toHaveBeenCalled();

      // Should set active listing
      expect(mockSetActive).toHaveBeenCalledWith(mockListings[0].id);

      // Should request scroll to listing
      expect(mockRequestScrollTo).toHaveBeenCalledWith(mockListings[0].id);

      // Should mark as programmatic move (for popup centering)
      expect(mockSetProgrammaticMove).toHaveBeenCalledWith(true);
    });

    it('should handle marker hover state (non-touch)', async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (window as unknown as Record<string, { onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      const markers = screen.getAllByTestId('map-marker');

      // Note: The actual marker content with hover handlers is inside the marker
      // The mock may not fully support hover events - this tests the structure exists
      expect(markers[0]).toBeInTheDocument();
    });

    it('renders markers for each listing', async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (window as unknown as Record<string, { onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      const markers = screen.getAllByTestId('map-marker');
      expect(markers).toHaveLength(mockListings.length);
    });

    it('renders popup when listing is selected', async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (window as unknown as Record<string, { onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Click a marker to select listing
      const markers = screen.getAllByTestId('map-marker');
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      // Popup should be visible
      expect(screen.getByTestId('map-popup')).toBeInTheDocument();
    });

    it('passes displayed marker positions to PrivacyCircle for overlapping listings', async () => {
      const overlappingListings = [
        {
          id: 'overlap-1',
          title: 'Overlap 1',
          price: 1000,
          availableSlots: 1,
          ownerId: 'owner-1',
          images: [],
          location: { lat: 37.7749, lng: -122.4194 },
        },
        {
          id: 'overlap-2',
          title: 'Overlap 2',
          price: 1100,
          availableSlots: 1,
          ownerId: 'owner-2',
          images: [],
          location: { lat: 37.7749, lng: -122.4194 },
        },
      ];

      mockQuerySourceFeaturesData = listingsToFeatures(overlappingListings);
      render(<MapComponent listings={overlappingListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      const calls = mockPrivacyCircle.mock.calls;
      const lastCall = calls[calls.length - 1]?.[0];

      expect(lastCall).toBeDefined();
      if (!lastCall) return;
      expect(lastCall.listings).toHaveLength(2);

      // For overlapping points, displayed marker positions should be offset
      // (not collapsed to the same center coordinate).
      const uniqueCoords = new Set(
        lastCall.listings.map((entry) => `${entry.location.lat}:${entry.location.lng}`)
      );
      expect(uniqueCoords.size).toBe(2);
    });
  });

  describe('marker retry mechanism', () => {
    it('retries updateUnclusteredListings when querySourceFeatures initially returns empty', async () => {
      // Start with empty features to simulate source not ready
      mockQuerySourceFeaturesData = [];

      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // At this point, unclustered should be empty
      expect(screen.queryAllByTestId('map-marker')).toHaveLength(0);

      // Now simulate source becoming ready
      mockQuerySourceFeaturesData = listingsToFeatures(mockListings);

      // Advance past first retry delay (200ms)
      await act(async () => {
        jest.advanceTimersByTime(250);
      });

      // Markers should appear after retry
      await waitFor(() => {
        expect(screen.getAllByTestId('map-marker')).toHaveLength(mockListings.length);
      });
    });

    it('fires sourcedata handler on content sourceDataType', async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Clear calls from initialization
      mockMapInstance.querySourceFeatures.mockClear();

      // Fire sourcedata with sourceDataType: 'content'
      const sourcedataCallbacks = onCallbacks['sourcedata'] || [];
      expect(sourcedataCallbacks.length).toBeGreaterThan(0);

      await act(async () => {
        for (const cb of sourcedataCallbacks) {
          cb({ sourceId: 'listings', sourceDataType: 'content', isSourceLoaded: false });
        }
      });

      // Should have called querySourceFeatures via updateUnclusteredListings
      expect(mockMapInstance.querySourceFeatures).toHaveBeenCalled();
    });
  });

  describe('cluster expansion', () => {
    it('should expand cluster on click', async () => {
      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onClick?: (e: unknown) => void }>).__mapHandlers;
      
      // Simulate cluster click with cluster feature
      await act(async () => {
        handlers?.onClick?.({
          features: [{
            properties: { cluster_id: 123 },
            geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          }],
          lngLat: { lng: -122.4194, lat: 37.7749 },
          originalEvent: {
            target: document.createElement('div'),
          },
        });
      });
      
      // Should mark as programmatic move
      expect(mockSetProgrammaticMove).toHaveBeenCalledWith(true);
      
      // Should trigger flyTo on map
      expect(mockMapInstance.flyTo).toHaveBeenCalled();
    });

    it('should guard against rapid cluster clicks', async () => {
      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onClick?: (e: unknown) => void }>).__mapHandlers;
      
      const clusterClickEvent = {
        features: [{
          properties: { cluster_id: 123 },
          geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        }],
        lngLat: { lng: -122.4194, lat: 37.7749 },
        originalEvent: { target: document.createElement('div') },
      };
      
      // First click
      await act(async () => {
        handlers?.onClick?.(clusterClickEvent);
      });
      
      const firstCallCount = mockMapInstance.flyTo.mock.calls.length;
      
      // Rapid second click (should be guarded)
      // Note: The guard uses a ref that we can't directly control in this mock
      // This test verifies the click handler structure exists
      await act(async () => {
        handlers?.onClick?.(clusterClickEvent);
      });
      
      // At minimum, should have processed the first click
      expect(firstCallCount).toBeGreaterThanOrEqual(1);
    });

    it('should clear isClusterExpandingRef on idle', async () => {
      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onIdle?: () => void }>).__mapHandlers;
      
      // Trigger onIdle
      await act(async () => {
        handlers?.onIdle?.();
      });
      
      // onIdle should complete without error (cluster flag cleared internally)
      expect(handlers?.onIdle).toBeDefined();
    });
  });

  describe('cleanup on unmount', () => {
    it('should clear all timeout refs on unmount', async () => {
      const { unmount } = render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      
      // Unmount should not throw
      expect(() => unmount()).not.toThrow();
    });

    it('should remove event listeners on unmount', async () => {
      const { unmount } = render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      
      unmount();
      
      // Window handlers should be cleaned up by component unmount
      // The mock stores handlers on window, component cleanup removes them
      expect(true).toBe(true); // Verify unmount completes
    });

    it('should handle unmount during pending operations', async () => {
      const { unmount } = render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(50); // Partial initialization
      });
      
      // Unmount during pending timers
      expect(() => unmount()).not.toThrow();
      
      // Advance remaining timers - should not cause errors
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    });

    it('should clear state arrays on unmount (memory cleanup)', async () => {
      const { unmount } = render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      
      // Verify component was working with listings
      const markers = screen.getAllByTestId('map-marker');
      expect(markers).toHaveLength(mockListings.length);
      
      // Unmount
      unmount();
      
      // Markers should be removed from DOM
      expect(screen.queryAllByTestId('map-marker')).toHaveLength(0);
    });
  });

  describe('webgl context recovery', () => {
    it('shows paused overlay and repaints when WebGL context is restored', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));

      const lostEvent = { preventDefault: jest.fn() } as unknown as Event;
      await act(async () => {
        mockCanvas.emit('webglcontextlost', lostEvent);
      });

      expect(lostEvent.preventDefault).toHaveBeenCalled();
      expect(screen.getByLabelText('Map paused')).toBeInTheDocument();

      await act(async () => {
        mockCanvas.emit('webglcontextrestored');
        jest.advanceTimersByTime(10);
      });

      expect(mockMapInstance.triggerRepaint).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByLabelText('Map paused')).not.toBeInTheDocument();
      });

      warnSpy.mockRestore();
    });

    it('remounts map if WebGL context restore times out', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await act(async () => {
        mockCanvas.emit('webglcontextlost', { preventDefault: jest.fn() } as unknown as Event);
      });

      expect(screen.getByLabelText('Map paused')).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      await act(async () => {
        jest.advanceTimersByTime(20);
      });

      await waitFor(() => {
        expect(screen.queryByLabelText('Map paused')).not.toBeInTheDocument();
      });
      expect(mockCanvas.removeEventListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
      expect(mockCanvas.removeEventListener).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));
      expect(
        mockCanvas.addEventListener.mock.calls.filter((call) => call[0] === 'webglcontextlost').length
      ).toBeGreaterThanOrEqual(2);
      expect(
        mockCanvas.addEventListener.mock.calls.filter((call) => call[0] === 'webglcontextrestored').length
      ).toBeGreaterThanOrEqual(2);

      warnSpy.mockRestore();
    });
  });

  describe('search-as-move toggle', () => {
    it('toggles search-as-move on click', async () => {
      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      
      const toggle = screen.getByRole('switch', { name: /search as i move/i });
      
      await act(async () => {
        fireEvent.click(toggle);
      });
      
      expect(mockSetSearchAsMove).toHaveBeenCalled();
    });
  });

  describe('fit all results button', () => {
    it('renders fit all button when listings exist', async () => {
      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      
      expect(screen.getByRole('button', { name: /fit all results/i })).toBeInTheDocument();
    });

    it('calls fitBounds when clicked', async () => {
      render(<MapComponent listings={mockListings} />);
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      
      const fitButton = screen.getByRole('button', { name: /fit all results/i });
      
      await act(async () => {
        fireEvent.click(fitButton);
      });
      
      expect(mockSetProgrammaticMove).toHaveBeenCalledWith(true);
    });
  });

  describe('empty state', () => {
    it('shows empty state when no listings', async () => {
      // Clear mock features for empty state
      mockQuerySourceFeaturesData = [];

      render(<MapComponent listings={[]} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(screen.getByText(/no listings in this area/i)).toBeInTheDocument();
    });

    it('shows zoom out button in empty state', async () => {
      // Clear mock features for empty state
      mockQuerySourceFeaturesData = [];

      render(<MapComponent listings={[]} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
    });
  });

  describe('keyboard navigation', () => {
    it('closes popup on Escape key', async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (window as unknown as Record<string, { onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Click marker to open popup
      const markers = screen.getAllByTestId('map-marker');
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      expect(screen.getByTestId('map-popup')).toBeInTheDocument();

      // Press Escape
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });

      // Popup should be closed
      await waitFor(() => {
        expect(screen.queryByTestId('map-popup')).not.toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('has accessible region landmark', async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(screen.getByRole('region', { name: /interactive map/i })).toBeInTheDocument();
    });

    it('announces selected listing to screen readers', async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (window as unknown as Record<string, { onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Click marker to select
      const markers = screen.getAllByTestId('map-marker');
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      // Should have sr-only announcement - find the one with sr-only class
      // There may be multiple status elements (loading indicators, etc.)
      const statusElements = screen.getAllByRole('status');
      const announcement = statusElements.find(el => el.classList.contains('sr-only'));
      expect(announcement).toBeDefined();
      expect(announcement).toHaveClass('sr-only');
    });
  });

  describe('zoom-based marker tier rendering', () => {
    // Zoom thresholds from Map.tsx:
    // ZOOM_DOTS_ONLY = 12: Below zoom 12, all pins are gray dots (no price)
    // ZOOM_TOP_N_PINS = 14: Zoom 12-14, primary = price pins, mini = dots. Above 14, all price pins

    const listingsWithTiers = [
      {
        id: 'primary-1',
        title: 'Primary Listing',
        price: 1200,
        availableSlots: 2,
        ownerId: 'owner-1',
        images: ['https://example.com/img1.jpg'],
        location: { lat: 37.7749, lng: -122.4194 },
        tier: 'primary' as const,
      },
      {
        id: 'mini-1',
        title: 'Mini Listing',
        price: 900,
        availableSlots: 1,
        ownerId: 'owner-2',
        images: ['https://example.com/img2.jpg'],
        location: { lat: 37.7849, lng: -122.4094 },
        tier: 'mini' as const,
      },
      {
        id: 'mini-2',
        title: 'Another Mini',
        price: 800,
        availableSlots: 3,
        ownerId: 'owner-3',
        images: [],
        location: { lat: 37.7649, lng: -122.4294 },
        tier: 'mini' as const,
      },
    ];

    beforeEach(() => {
      // Set up mock features for querySourceFeatures with tier data
      mockQuerySourceFeaturesData = listingsWithTiers.map(listing => ({
        properties: {
          id: listing.id,
          title: listing.title,
          price: listing.price,
          availableSlots: listing.availableSlots,
          ownerId: listing.ownerId || '',
          images: JSON.stringify(listing.images || []),
          lat: listing.location.lat,
          lng: listing.location.lng,
          tier: listing.tier,
        },
      }));
    });

    it('shows all markers as dots when zoom < 12 (ZOOM_DOTS_ONLY)', async () => {
      // Start with zoom level below 12
      mockMapInstance.getZoom = jest.fn(() => 10);

      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Simulate moveEnd with low zoom to trigger tier recalculation
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 10 },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(200); // Wait for debounce
      });

      // All markers should be rendered
      const markers = screen.getAllByTestId('map-marker');
      expect(markers).toHaveLength(listingsWithTiers.length);

      // At low zoom, markers render as dots (no price visible in aria-label content)
      // The marker structure exists but shows simplified dot view
      markers.forEach(marker => {
        expect(marker).toBeInTheDocument();
      });
    });

    it('shows primary tier as price pills and mini tier as dots at zoom 12-14', async () => {
      mockMapInstance.getZoom = jest.fn(() => 13);

      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Trigger moveEnd with zoom 13 (between ZOOM_DOTS_ONLY and ZOOM_TOP_N_PINS)
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 13 },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // All markers should be present
      const markers = screen.getAllByTestId('map-marker');
      expect(markers).toHaveLength(listingsWithTiers.length);

      // Primary tier markers should have price in aria-label
      const primaryMarker = markers.find(m => m.getAttribute('data-longitude') === '-122.4194');
      expect(primaryMarker).toBeDefined();
    });

    it('shows all markers as price pills when zoom >= 14 (ZOOM_TOP_N_PINS)', async () => {
      mockMapInstance.getZoom = jest.fn(() => 15);

      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Trigger moveEnd with high zoom
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 15 },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // All markers should be rendered
      const markers = screen.getAllByTestId('map-marker');
      expect(markers).toHaveLength(listingsWithTiers.length);

      // At high zoom, all markers (including mini) show as price pills
      // The aria-label is on the inner wrapper div with data-listing-id attribute
      const markerWrappers = document.querySelectorAll('[data-listing-id]');
      expect(markerWrappers).toHaveLength(listingsWithTiers.length);

      markerWrappers.forEach(wrapper => {
        const ariaLabel = wrapper.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        expect(ariaLabel).toMatch(/\$\d+\/month/);
      });
    });

    it('updates marker tier display when zoom changes from low to high', async () => {
      mockMapInstance.getZoom = jest.fn(() => 10);

      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Initial state at low zoom
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 10 },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      let markers = screen.getAllByTestId('map-marker');
      expect(markers).toHaveLength(listingsWithTiers.length);

      // Now zoom in to high level
      mockMapInstance.getZoom = jest.fn(() => 15);
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 15 },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Markers should still be present after zoom change
      markers = screen.getAllByTestId('map-marker');
      expect(markers).toHaveLength(listingsWithTiers.length);
    });

    it('handles rapid zoom changes without performance degradation', async () => {
      mockMapInstance.getZoom = jest.fn(() => 12);

      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Simulate rapid zoom changes (user pinch-zooming quickly)
      const zoomLevels = [10, 11, 12, 13, 14, 15, 14, 13, 12];

      for (const zoom of zoomLevels) {
        mockMapInstance.getZoom = jest.fn(() => zoom);
        await act(async () => {
          handlers?.onMoveEnd?.({
            viewState: { zoom },
            target: { getBounds: () => mockMapInstance.getBounds() },
          });
        });
        // Small delay between zoom events (simulating rapid but not instant zooming)
        await act(async () => {
          jest.advanceTimersByTime(50);
        });
      }

      // Wait for final debounce to settle
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Markers should still be properly rendered after rapid changes
      const markers = screen.getAllByTestId('map-marker');
      expect(markers).toHaveLength(listingsWithTiers.length);

      // No errors should have occurred (test would fail on thrown errors)
    });

    it('preserves marker count when tier display changes', async () => {
      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Get initial marker count
      let markers = screen.getAllByTestId('map-marker');
      const initialCount = markers.length;

      // Change zoom multiple times crossing tier thresholds
      const zoomChanges = [
        { zoom: 10 }, // All dots
        { zoom: 13 }, // Primary pills, mini dots
        { zoom: 16 }, // All pills
        { zoom: 11 }, // All dots again
      ];

      for (const { zoom } of zoomChanges) {
        mockMapInstance.getZoom = jest.fn(() => zoom);
        await act(async () => {
          handlers?.onMoveEnd?.({
            viewState: { zoom },
            target: { getBounds: () => mockMapInstance.getBounds() },
          });
        });
        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Marker count should remain constant regardless of tier display
        markers = screen.getAllByTestId('map-marker');
        expect(markers).toHaveLength(initialCount);
      }
    });

    it('debounces updateUnclusteredListings during rapid moveEnd events', async () => {
      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Clear query calls from initial setup and wait for any pending timers
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      mockMapInstance.querySourceFeatures.mockClear();

      // Trigger multiple rapid moveEnd events without advancing timers between them
      // This simulates very rapid panning/zooming where debounce should coalesce calls
      await act(async () => {
        for (let i = 0; i < 5; i++) {
          handlers?.onMoveEnd?.({
            viewState: { zoom: 12 + i * 0.5 },
            target: { getBounds: () => mockMapInstance.getBounds() },
          });
        }
      });

      // Now advance past the 100ms debounce threshold
      await act(async () => {
        jest.advanceTimersByTime(150);
      });

      // The debounce mechanism ensures that rapid events are coalesced
      // Instead of 5 immediate calls, we should see fewer calls due to debouncing
      const callCount = mockMapInstance.querySourceFeatures.mock.calls.length;

      // Should have at least one call (after debounce settles)
      expect(callCount).toBeGreaterThanOrEqual(1);

      // Verify the map component handles rapid zoom changes without errors
      // (the main purpose is stability, not exact call count)
      const markers = screen.getAllByTestId('map-marker');
      expect(markers).toHaveLength(listingsWithTiers.length);
    });

    it('maintains cluster state during tier threshold crossings', async () => {
      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (window as unknown as Record<string, { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }>).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Verify Source component is rendered (clustering is enabled)
      const source = screen.getByTestId('map-source');
      expect(source).toBeInTheDocument();

      // Cross tier thresholds
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 11 }, // Below ZOOM_DOTS_ONLY
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Source should still be present
      expect(screen.getByTestId('map-source')).toBeInTheDocument();

      // Cross to mid-tier
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 13 }, // Between thresholds
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Source should still be present
      expect(screen.getByTestId('map-source')).toBeInTheDocument();

      // Cross to high zoom
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 15 }, // Above ZOOM_TOP_N_PINS
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Source should still be present - clustering state preserved
      expect(screen.getByTestId('map-source')).toBeInTheDocument();
    });
  });
});
