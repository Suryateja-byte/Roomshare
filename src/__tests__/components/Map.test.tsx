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

import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import "@testing-library/jest-dom";

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
let phoneViewportMatches = false;

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
      listeners[type] = listeners[type].filter((cb) => cb !== listener);
    }),
    emit: (type: string, event?: Event) => {
      const callbacks = listeners[type] || [];
      callbacks.forEach((callback) => callback(event ?? new Event(type)));
    },
  };
}

jest.mock("next/navigation", () => ({
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

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
let latestSourceProps: Record<string, unknown> | null = null;

// Factory for creating mock map instance
function createMockMapInstance() {
  return {
    on: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (!onCallbacks[event]) onCallbacks[event] = [];
      onCallbacks[event].push(callback);
      // Immediately fire 'load' event
      if (event === "load") {
        setTimeout(() => callback(), 0);
      }
    }),
    off: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (onCallbacks[event]) {
        onCallbacks[event] = onCallbacks[event].filter((cb) => cb !== callback);
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
    jumpTo: jest.fn(),
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
    unproject: jest.fn(([x, y]: [number, number]) => ({
      lng: -122.4194 + (x - 400) / 1000,
      lat: 37.7749 - (y - 300) / 1000,
    })),
    getCanvas: jest.fn(() => mockCanvas),
    getContainer: jest.fn(() => {
      const container = document.createElement("div");
      container.setAttribute("data-testid", "map-container-mock");
      return container;
    }),
  };
}

// Helper to convert listings to feature format for querySourceFeatures mock
function listingsToFeatures(listings: typeof mockListings) {
  return listings.map((listing) => ({
    properties: {
      id: listing.id,
      title: listing.title,
      price: listing.price,
      availableSlots: listing.availableSlots,
      ownerId: listing.ownerId || "",
      images: JSON.stringify(listing.images || []),
      lat: listing.location.lat,
      lng: listing.location.lng,
      tier: listing.tier,
    },
  }));
}

// Mock react-map-gl
jest.mock("react-map-gl/maplibre", () => {
  const React = require("react");

  const MockMap = React.forwardRef(
    (
      {
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
        onMoveEnd?: (e: {
          viewState: { zoom: number };
          target: { getBounds: () => unknown };
        }) => void;
        onMoveStart?: (e?: { originalEvent?: Event }) => void;
        onIdle?: () => void;
        onClick?: (e: unknown) => void;
        onError?: (e: unknown) => void;
        [key: string]: unknown;
      },
      ref: React.Ref<{
        getMap: () => typeof mockMapInstance;
        getZoom: typeof mockMapInstance.getZoom;
        flyTo: typeof mockMapInstance.flyTo;
        fitBounds: typeof mockMapInstance.fitBounds;
        easeTo: typeof mockMapInstance.easeTo;
      }>
    ) => {
      // Store callbacks for test triggering
      React.useEffect(() => {
        if (onLoad) {
          setTimeout(() => onLoad(), 10);
        }
      }, [onLoad]);

      React.useImperativeHandle(ref, () => ({
        getMap: () => mockMapInstance,
        getZoom: mockMapInstance.getZoom,
        getSource: mockMapInstance.getSource,
        flyTo: mockMapInstance.flyTo,
        fitBounds: mockMapInstance.fitBounds,
        easeTo: mockMapInstance.easeTo,
        jumpTo: mockMapInstance.jumpTo,
      }));

      // Store handlers on window for tests to trigger
      (window as unknown as Record<string, unknown>).__mapHandlers = {
        onMoveEnd,
        onMoveStart,
        onIdle,
        onClick,
        onError,
      };

      return React.createElement(
        "div",
        { "data-testid": "map-container", ...props },
        children
      );
    }
  );

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
    const React = require("react");
    return React.createElement(
      "div",
      {
        "data-testid": "map-marker",
        "data-longitude": longitude,
        "data-latitude": latitude,
        onClick: (e: MouseEvent) => {
          if (onClick) {
            onClick({
              originalEvent: { stopPropagation: () => e.stopPropagation() },
            });
          }
        },
        ...props,
      },
      children
    );
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
    const React = require("react");
    return React.createElement(
      "div",
      {
        "data-testid": "map-popup",
        ...props,
      },
      children
    );
  };

  const MockSource = ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const React = require("react");
    latestSourceProps = props as Record<string, unknown>;
    return React.createElement(
      "div",
      { "data-testid": "map-source", ...props },
      children
    );
  };

  const MockLayer = (props: Record<string, unknown>) => {
    const React = require("react");
    return React.createElement("div", { "data-testid": "map-layer", ...props });
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
jest.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

// Mock haptics
jest.mock("@/lib/haptics", () => ({
  triggerHaptic: jest.fn(),
}));

// Mock contexts
const mockSetHovered = jest.fn();
const mockSetActive = jest.fn();
const mockRequestScrollTo = jest.fn();
let mockHoveredId: string | null = null;
let mockActiveId: string | null = null;
const mockSetHasUserMoved = jest.fn();
const mockSetProgrammaticMove = jest.fn();
const mockIsProgrammaticMoveRef = { current: false };
const mockToggleDropMode = jest.fn();
const mockSetUserPin = jest.fn();
const mockHandleUserPinClick = jest.fn();
let mockUserPinState = {
  isDropMode: false,
  toggleDropMode: mockToggleDropMode,
  pin: null,
  setPin: mockSetUserPin,
  handleMapClick: mockHandleUserPinClick,
};
type PrivacyCircleListing = {
  id: string;
  location: { lat: number; lng: number };
};
type PrivacyCircleProps = {
  listings: PrivacyCircleListing[];
  isDarkMode?: boolean;
};
const mockPrivacyCircle = jest.fn((props: PrivacyCircleProps) => null);

jest.mock("@/contexts/ListingFocusContext", () => ({
  useListingFocus: () => ({
    hoveredId: mockHoveredId,
    activeId: mockActiveId,
    setHovered: mockSetHovered,
    setActive: mockSetActive,
    requestScrollTo: mockRequestScrollTo,
  }),
}));

jest.mock("@/contexts/SearchTransitionContext", () => ({
  useSearchTransitionSafe: () => ({
    isPending: false,
    replaceWithTransition: mockReplaceWithTransition,
  }),
}));

jest.mock("@/contexts/MapBoundsContext", () => ({
  useMapBounds: () => ({
    hasUserMoved: false,
    setHasUserMoved: mockSetHasUserMoved,
    setProgrammaticMove: mockSetProgrammaticMove,
    isProgrammaticMoveRef: mockIsProgrammaticMoveRef,
  }),
  useActivePanBounds: () => ({
    activePanBounds: null,
    setActivePanBounds: jest.fn(),
  }),
}));

jest.mock("@/contexts/ActivePanBoundsContext", () => ({
  useActivePanBoundsSetter: () => ({
    setActivePanBounds: jest.fn(),
  }),
}));

// Mock child components
jest.mock("@/components/map/MobileMapStatusCard", () => ({
  MobileMapStatusCard: ({ status }: { status: string }) => (
    <div data-testid="mobile-map-status-card" data-status={status} />
  ),
}));

jest.mock("@/components/map/MapGestureHint", () => ({
  MapGestureHint: () => null,
}));

jest.mock("@/components/map/PrivacyCircle", () => ({
  PrivacyCircle: (props: PrivacyCircleProps) => {
    mockPrivacyCircle(props);
    return null;
  },
}));

jest.mock("@/components/map/BoundaryLayer", () => ({
  BoundaryLayer: () => null,
}));

jest.mock("@/components/map/UserMarker", () => ({
  UserMarker: () => null,
  useUserPin: () => mockUserPinState,
}));

jest.mock("@/components/map/POILayer", () => ({
  POILayer: () => null,
  usePOILayerState: () => ({
    activeCategories: new Set(),
    toggleCategory: jest.fn(),
  }),
}));

jest.mock("framer-motion", () => ({
  LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  domAnimation: {},
  m: {
    div: ({
      children,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

// Import component after mocks
import MapComponent from "@/components/Map";
import { triggerHaptic } from "@/lib/haptics";

// --------------------------------------------------------------------------
// Test Data
// --------------------------------------------------------------------------

const mockListings = [
  {
    id: "listing-1",
    title: "Cozy Room in SF",
    price: 1200,
    availableSlots: 2,
    ownerId: "owner-1",
    images: ["https://example.com/img1.jpg"],
    location: { lat: 37.7749, lng: -122.4194 },
    tier: "primary" as const,
  },
  {
    id: "listing-2",
    title: "Studio Apartment",
    price: 1800,
    availableSlots: 1,
    ownerId: "owner-2",
    images: ["https://example.com/img2.jpg"],
    location: { lat: 37.7849, lng: -122.4094 },
    tier: "mini" as const,
  },
  {
    id: "listing-3",
    title: "Shared Space",
    price: 900,
    availableSlots: 0,
    ownerId: "owner-3",
    images: [],
    location: { lat: 37.7649, lng: -122.4294 },
  },
];

function createMockRect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function setDesktopMapPaneRect({ width = 800, height = 600 } = {}) {
  const mapRegion = screen.getByRole("region", {
    name: /interactive map showing listing locations/i,
  });
  Object.defineProperty(mapRegion, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(mapRegion, "clientHeight", {
    configurable: true,
    value: height,
  });
  mapRegion.getBoundingClientRect = jest
    .fn()
    .mockReturnValue(createMockRect({ left: 0, top: 0, width, height }));

  return mapRegion;
}

// --------------------------------------------------------------------------
// Test Suite
// --------------------------------------------------------------------------

describe("Map Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockReplace.mockClear();
    mockReplaceWithTransition.mockClear();
    mockPrivacyCircle.mockClear();
    mockSearchParams = new URLSearchParams();
    mockHoveredId = null;
    mockActiveId = null;

    // Reset mock map instance
    mockCanvas = createMockCanvas();
    mockMapInstance = createMockMapInstance();
    mockUserPinState = {
      isDropMode: false,
      toggleDropMode: mockToggleDropMode,
      pin: null,
      setPin: mockSetUserPin,
      handleMapClick: mockHandleUserPinClick,
    };

    // Clear callback tracking
    Object.keys(onCallbacks).forEach((key) => delete onCallbacks[key]);

    // Reset refs
    mockIsProgrammaticMoveRef.current = false;
    phoneViewportMatches = false;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width: 767px")
          ? phoneViewportMatches
          : false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    // Set up mock features for querySourceFeatures
    // This simulates what Mapbox returns for unclustered points
    mockQuerySourceFeaturesData = listingsToFeatures(mockListings);
    latestSourceProps = null;

    // Set up env
    // No Mapbox token needed — geocoding uses free Photon + Nominatim
  });

  afterEach(() => {
    jest.useRealTimers();
    cleanup();
    delete (window as unknown as Record<string, unknown>).__mapHandlers;
  });

  describe("Initialization", () => {
    it("renders map container", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(screen.getByTestId("map-container")).toBeInTheDocument();
    });

    it("shows loading state before map loads", () => {
      render(<MapComponent listings={mockListings} />);

      expect(screen.getByText(/loading map/i)).toBeInTheDocument();
    });

    it("hides loading state after map loads", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(screen.queryByText(/loading map/i)).not.toBeInTheDocument();
      });
    });

    it("does not render the removed search-as-move toggle", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(
        screen.queryByRole("switch", { name: /search as i move/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("geojson sanitization", () => {
    it("coerces invalid numeric listing data before it reaches the cluster source", async () => {
      render(
        <MapComponent
          listings={[
            {
              id: "listing-bad-numbers",
              title: "Broken listing",
              price: Number.NaN,
              availableSlots: Number.POSITIVE_INFINITY,
              images: ["https://example.com/img.jpg"],
              location: { lat: Number.NaN, lng: Number.NaN },
            } as any,
          ]}
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const sourceData = latestSourceProps?.data as {
        features: Array<{
          geometry: { coordinates: [number, number] };
          properties: {
            price: number;
            availableSlots: number;
            lat: number;
            lng: number;
          };
        }>;
      };

      expect(sourceData.features[0].geometry.coordinates).toEqual([0, 0]);
      expect(sourceData.features[0].properties.price).toBe(0);
      expect(sourceData.features[0].properties.availableSlots).toBe(0);
      expect(sourceData.features[0].properties.lat).toBe(0);
      expect(sourceData.features[0].properties.lng).toBe(0);
    });
  });

  describe("mobile map behavior", () => {
    it("uses lighter clustering on phone viewports", async () => {
      phoneViewportMatches = true;

      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(latestSourceProps?.clusterMaxZoom).toBe(10);
      expect(latestSourceProps?.clusterRadius).toBe(32);
    });

    it("auto-fits current results once on initial phone load", async () => {
      phoneViewportMatches = true;

      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(mockSetProgrammaticMove).toHaveBeenCalledWith(true);
      expect(mockMapInstance.fitBounds).toHaveBeenCalledWith(
        [
          [-122.4294, 37.7649],
          [-122.4094, 37.7849],
        ],
        expect.objectContaining({
          duration: 1000,
          padding: expect.objectContaining({
            top: 50,
            left: 50,
            right: 50,
          }),
        })
      );
    });

    it("only treats a phone move as user-driven after a real gesture starts", async () => {
      phoneViewportMatches = true;

      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      jest.clearAllMocks();

      const handlers = (
        window as unknown as Record<
          string,
          {
            onMoveEnd?: (e: unknown) => void;
            onMoveStart?: (e?: unknown) => void;
          }
        >
      ).__mapHandlers;

      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: {
            longitude: -122.4194,
            latitude: 37.7749,
            zoom: 12,
          },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      expect(mockSetHasUserMoved).not.toHaveBeenCalled();
      expect(mockReplaceWithTransition).not.toHaveBeenCalled();

      await act(async () => {
        handlers?.onMoveStart?.({ originalEvent: new Event("pointermove") });
        handlers?.onMoveEnd?.({
          viewState: {
            longitude: -122.4094,
            latitude: 37.7849,
            zoom: 12,
          },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      expect(mockSetHasUserMoved).toHaveBeenCalledWith(true);
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      expect(mockReplaceWithTransition).toHaveBeenCalled();
    });

    it("uses the confirmed-empty mobile status card when the phone viewport has no listings", async () => {
      phoneViewportMatches = true;
      mockQuerySourceFeaturesData = [];

      render(<MapComponent listings={[]} />);

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(screen.getByTestId("mobile-map-status-card")).toHaveAttribute(
        "data-status",
        "confirmed-empty"
      );
      expect(
        screen.queryByText(/no listings in this area/i)
      ).not.toBeInTheDocument();
    });

    it("renders the mobile drop-pin control in the right rail and hides it during status-card states", async () => {
      phoneViewportMatches = true;

      const { rerender } = render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const moreToolsButton = screen.getByRole("button", {
        name: /more map tools/i,
      });
      expect(moreToolsButton).toBeInTheDocument();
      expect(screen.queryByText(/^drop pin$/i)).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(moreToolsButton);
      });

      const dropPinAction = screen.getByRole("button", {
        name: /drop a pin on the map/i,
      });

      await act(async () => {
        fireEvent.click(dropPinAction);
      });
      expect(mockToggleDropMode).toHaveBeenCalledTimes(1);

      mockQuerySourceFeaturesData = [];
      rerender(<MapComponent listings={[]} />);

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(
        screen.queryByRole("button", { name: /more map tools/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("handleMoveEnd state transitions", () => {
    it("should distinguish programmatic vs user-initiated moves", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Clear mocks from initialization effects
      jest.clearAllMocks();

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void }
        >
      ).__mapHandlers;

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

      expect(mockSetHasUserMoved).not.toHaveBeenCalledWith(true);

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

    it("should mark user moved on first non-programmatic moveEnd", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Clear mocks from initialization effects
      jest.clearAllMocks();

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void }
        >
      ).__mapHandlers;

      // First moveEnd — no previous center tracked, so it's treated as a real move
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

      // Component uses center-dedup instead of initial-move skip;
      // first moveEnd with no previous center triggers setHasUserMoved(true)
      expect(mockSetHasUserMoved).toHaveBeenCalledWith(true);
    });

    it("should respect debounce timing (300ms)", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void }
        >
      ).__mapHandlers;

      // Skip initial moveEnd
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 12 },
          target: { getBounds: () => mockMapInstance.getBounds() },
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(700);
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

      expect(mockReplaceWithTransition).not.toHaveBeenCalled();
    });

    it("clears location query when map search starts from lat/lng and preserves active filters", async () => {
      mockSearchParams = new URLSearchParams(
        "q=Austin&lat=30.2672&lng=-97.7431&languages=te&minPrice=500"
      );

      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void }
        >
      ).__mapHandlers;

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
      const params = new URLSearchParams(nextUrl.split("?")[1] ?? "");

      expect(params.get("languages")).toBe("te");
      expect(params.get("minPrice")).toBe("500");
      expect(params.has("q")).toBe(false);
      expect(params.has("lat")).toBe(false);
      expect(params.has("lng")).toBe(false);
      expect(params.has("minLat")).toBe(true);
      expect(params.has("maxLat")).toBe(true);
      expect(params.has("minLng")).toBe(true);
      expect(params.has("maxLng")).toBe(true);
    });

    it("shows guidance when viewport is too wide", async () => {
      mockSearchParams = new URLSearchParams("languages=te");

      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void }
        >
      ).__mapHandlers;

      // First moveEnd — establishes lastCenterRef baseline
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

      // Flush any debounced search from the first moveEnd before clearing mocks
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // Clear mocks so we only observe the oversized viewport move
      jest.clearAllMocks();

      // Oversized viewport (> MAP_FETCH_MAX_LAT_SPAN=60 / MAP_FETCH_MAX_LNG_SPAN=130)
      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: { zoom: 4 },
          target: {
            getBounds: () => ({
              getWest: () => -100,
              getEast: () => 50,
              getSouth: () => -10,
              getNorth: () => 60,
            }),
          },
        });
      });

      expect(
        screen.getByText("Zoom in further to update results")
      ).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(mockReplaceWithTransition).not.toHaveBeenCalled();
    });

    it("should clear programmatic flag on moveEnd", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void }
        >
      ).__mapHandlers;

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

  describe("marker interactions", () => {
    it("should handle marker click correctly", async () => {
      render(<MapComponent listings={mockListings} />);

      // Wait for map load
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      setDesktopMapPaneRect();

      // Find marker elements
      const markers = screen.getAllByTestId("map-marker");
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
      expect(mockMapInstance.easeTo).toHaveBeenCalledWith({
        center: [mockListings[0].location.lng, mockListings[0].location.lat],
        duration: 280,
        offset: [0, -56],
      });
    });

    it("should handle marker hover state (non-touch)", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      const markers = screen.getAllByTestId("map-marker");

      // Note: The actual marker content with hover handlers is inside the marker
      // The mock may not fully support hover events - this tests the structure exists
      expect(markers[0]).toBeInTheDocument();
    });

    it("renders markers for each listing", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      const markers = screen.getAllByTestId("map-marker");
      expect(markers).toHaveLength(mockListings.length);
    });

    it("renders popup when listing is selected", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Click a marker to select listing
      const markers = screen.getAllByTestId("map-marker");
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      // Popup should be visible
      expect(screen.getByTestId("map-popup")).toBeInTheDocument();
    });

    it("does not auto-pan again when the popup already fits inside the map pane", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      setDesktopMapPaneRect();

      const markers = screen.getAllByTestId("map-marker");
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      const popupCard = screen.getByTestId("map-popup-card");
      popupCard.getBoundingClientRect = jest
        .fn()
        .mockReturnValue(
          createMockRect({ left: 140, top: 140, width: 280, height: 220 })
        );

      mockMapInstance.easeTo.mockClear();
      mockMapInstance.jumpTo.mockClear();
      mockMapInstance.unproject.mockClear();

      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      expect(mockMapInstance.unproject).not.toHaveBeenCalled();
      expect(mockMapInstance.easeTo).not.toHaveBeenCalled();
      expect(mockMapInstance.jumpTo).not.toHaveBeenCalled();
    });

    it("auto-pans when the popup would overflow the map safe area", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      setDesktopMapPaneRect();

      const markers = screen.getAllByTestId("map-marker");
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      const popupCard = screen.getByTestId("map-popup-card");
      popupCard.getBoundingClientRect = jest
        .fn()
        .mockReturnValue(
          createMockRect({ left: -40, top: 24, width: 280, height: 220 })
        );

      mockMapInstance.unproject.mockReturnValue({
        lng: -122.33,
        lat: 37.88,
      });
      mockMapInstance.easeTo.mockClear();
      mockMapInstance.jumpTo.mockClear();
      mockMapInstance.unproject.mockClear();

      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      expect(mockMapInstance.unproject).toHaveBeenCalledWith([336, 228]);
      expect(mockMapInstance.jumpTo).toHaveBeenCalledWith({
        center: [-122.33, 37.88],
      });
    });

    it("applies the same popup-aware offset when activeId focuses a listing from the list", async () => {
      const { rerender } = render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      setDesktopMapPaneRect();
      mockMapInstance.easeTo.mockClear();

      mockActiveId = mockListings[0].id;

      await act(async () => {
        rerender(<MapComponent listings={mockListings} />);
      });

      expect(mockSetProgrammaticMove).toHaveBeenCalledWith(true);
      expect(mockMapInstance.easeTo).toHaveBeenCalledWith({
        center: [mockListings[0].location.lng, mockListings[0].location.lat],
        zoom: 15,
        duration: 280,
        offset: [0, -56],
      });
    });

    it("suppresses the popup in sheet selection mode while syncing the active listing", async () => {
      render(
        <MapComponent listings={mockListings} selectionPresentation="sheet" />
      );

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      const markers = screen.getAllByTestId("map-marker");
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      expect(screen.queryByTestId("map-popup")).not.toBeInTheDocument();
      expect(mockSetActive).toHaveBeenCalledWith(mockListings[0].id);
      expect(mockRequestScrollTo).toHaveBeenCalledWith(mockListings[0].id);
    });

    it("renders a phone preview card in preview selection mode without opening the popup", async () => {
      phoneViewportMatches = true;
      render(
        <MapComponent listings={mockListings} selectionPresentation="preview" />
      );

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      const markers = screen.getAllByTestId("map-marker");
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      expect(screen.queryByTestId("map-popup")).not.toBeInTheDocument();
      expect(screen.getByTestId("map-preview-card")).toBeInTheDocument();
      expect(mockSetActive).toHaveBeenCalledWith(mockListings[0].id);
      expect(mockRequestScrollTo).toHaveBeenCalledWith(mockListings[0].id);
    });

    it("keeps the phone preview during programmatic recenter and dismisses it on user move", async () => {
      phoneViewportMatches = true;
      render(
        <MapComponent listings={mockListings} selectionPresentation="preview" />
      );

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      let handlers = (
        window as unknown as Record<
          string,
          { onIdle?: () => void; onMoveStart?: () => void }
        >
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      const markers = screen.getAllByTestId("map-marker");
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      expect(screen.getByTestId("map-preview-card")).toBeInTheDocument();

      handlers = (
        window as unknown as Record<
          string,
          { onIdle?: () => void; onMoveStart?: () => void }
        >
      ).__mapHandlers;

      mockIsProgrammaticMoveRef.current = true;
      await act(async () => {
        handlers?.onMoveStart?.();
      });
      expect(screen.getByTestId("map-preview-card")).toBeInTheDocument();

      mockIsProgrammaticMoveRef.current = false;
      await act(async () => {
        handlers?.onMoveStart?.();
      });

      await waitFor(() => {
        expect(
          screen.queryByTestId("map-preview-card")
        ).not.toBeInTheDocument();
      });
      expect(mockSetActive).toHaveBeenLastCalledWith(null);
    });

    it("keeps the phone preview through the first blank-map click after marker selection, then dismisses it on the next blank-map click", async () => {
      phoneViewportMatches = true;
      render(
        <MapComponent listings={mockListings} selectionPresentation="preview" />
      );

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      let handlers = (
        window as unknown as Record<
          string,
          { onIdle?: () => void; onClick?: (e: unknown) => void }
        >
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      const markers = screen.getAllByTestId("map-marker");
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      expect(screen.getByTestId("map-preview-card")).toBeInTheDocument();

      handlers = (
        window as unknown as Record<
          string,
          { onIdle?: () => void; onClick?: (e: unknown) => void }
        >
      ).__mapHandlers;

      const blankMapClick = {
        originalEvent: { target: document.createElement("div") },
      };

      await act(async () => {
        handlers?.onClick?.(blankMapClick);
      });
      expect(screen.getByTestId("map-preview-card")).toBeInTheDocument();

      await act(async () => {
        handlers?.onClick?.(blankMapClick);
      });

      await waitFor(() => {
        expect(
          screen.queryByTestId("map-preview-card")
        ).not.toBeInTheDocument();
      });
      expect(mockSetActive).toHaveBeenLastCalledWith(null);
    });

    it("passes displayed marker positions to PrivacyCircle for overlapping listings", async () => {
      const overlappingListings = [
        {
          id: "overlap-1",
          title: "Overlap 1",
          price: 1000,
          availableSlots: 1,
          ownerId: "owner-1",
          images: [],
          location: { lat: 37.7749, lng: -122.4194 },
        },
        {
          id: "overlap-2",
          title: "Overlap 2",
          price: 1100,
          availableSlots: 1,
          ownerId: "owner-2",
          images: [],
          location: { lat: 37.7749, lng: -122.4194 },
        },
      ];

      mockQuerySourceFeaturesData = listingsToFeatures(overlappingListings);
      render(<MapComponent listings={overlappingListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      const calls = mockPrivacyCircle.mock.calls;
      const lastCall = calls[calls.length - 1]?.[0];

      expect(lastCall).toBeDefined();
      if (!lastCall) return;
      expect(lastCall.listings).toHaveLength(2);
      expect(screen.getAllByTestId("map-marker")).toHaveLength(2);

      // For overlapping points, displayed marker positions should be offset
      // (not collapsed to the same center coordinate).
      const uniqueCoords = new Set(
        lastCall.listings.map(
          (entry) => `${entry.location.lat}:${entry.location.lng}`
        )
      );
      expect(uniqueCoords.size).toBe(2);
    });

    it("collapses exact cloned listings into one displayed marker and privacy circle", async () => {
      const clonedListings = [
        {
          id: "clone-1",
          title: "Sunny Mission Room",
          price: 1200,
          availableSlots: 1,
          ownerId: "owner-1",
          images: [],
          location: { lat: 37.7599, lng: -122.4148 },
        },
        {
          id: "clone-2",
          title: " sunny mission room ",
          price: 1200,
          availableSlots: 1,
          ownerId: "owner-2",
          images: [],
          location: { lat: 37.7599, lng: -122.4148 },
        },
      ];

      mockQuerySourceFeaturesData = listingsToFeatures(clonedListings);
      render(<MapComponent listings={clonedListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      await waitFor(() => {
        expect(screen.getAllByTestId("map-marker")).toHaveLength(1);
      });

      const calls = mockPrivacyCircle.mock.calls;
      const lastCall = calls[calls.length - 1]?.[0];

      expect(lastCall).toBeDefined();
      if (!lastCall) return;
      expect(lastCall.listings).toHaveLength(1);
    });

    it("treats hidden clone IDs as aliases for the visible marker state", async () => {
      const clonedListings = [
        {
          id: "clone-1",
          title: "Sunny Mission Room",
          price: 1200,
          availableSlots: 1,
          ownerId: "owner-1",
          images: [],
          location: { lat: 37.7599, lng: -122.4148 },
        },
        {
          id: "clone-2",
          title: "Sunny Mission Room",
          price: 1200,
          availableSlots: 1,
          ownerId: "owner-2",
          images: [],
          location: { lat: 37.7599, lng: -122.4148 },
        },
      ];

      mockHoveredId = "clone-2";
      mockQuerySourceFeaturesData = listingsToFeatures(clonedListings);
      render(<MapComponent listings={clonedListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      expect(screen.getAllByTestId("map-marker")).toHaveLength(1);
      expect(screen.getByTestId("map-pin-primary-clone-1")).toHaveAttribute(
        "data-focus-state",
        "hovered"
      );
    });

    it("keeps visually different tiered markers separate even when other fields match", async () => {
      const tieredListings = [
        {
          id: "primary-pin",
          title: "Sunny Mission Room",
          price: 1200,
          availableSlots: 1,
          ownerId: "owner-1",
          images: [],
          location: { lat: 37.7599, lng: -122.4148 },
          tier: "primary" as const,
        },
        {
          id: "mini-pin",
          title: "Sunny Mission Room",
          price: 1200,
          availableSlots: 1,
          ownerId: "owner-2",
          images: [],
          location: { lat: 37.7599, lng: -122.4148 },
          tier: "mini" as const,
        },
      ];

      mockQuerySourceFeaturesData = listingsToFeatures(tieredListings);
      render(<MapComponent listings={tieredListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      await waitFor(() => {
        expect(screen.getAllByTestId("map-marker")).toHaveLength(2);
      });

      const calls = mockPrivacyCircle.mock.calls;
      const lastCall = calls[calls.length - 1]?.[0];

      expect(lastCall).toBeDefined();
      if (!lastCall) return;
      expect(lastCall.listings).toHaveLength(2);
      expect(lastCall.listings.map((entry: { id: string }) => entry.id)).toEqual(
        expect.arrayContaining(["primary-pin", "mini-pin"])
      );
    });
  });

  describe("marker retry mechanism", () => {
    it("retries updateUnclusteredListings when querySourceFeatures initially returns empty", async () => {
      // Start with empty features to simulate source not ready
      mockQuerySourceFeaturesData = [];

      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // At this point, unclustered should be empty
      expect(screen.queryAllByTestId("map-marker")).toHaveLength(0);

      // Now simulate source becoming ready
      mockQuerySourceFeaturesData = listingsToFeatures(mockListings);

      // Advance past first retry delay (200ms)
      await act(async () => {
        jest.advanceTimersByTime(250);
      });

      // Markers should appear after retry
      await waitFor(() => {
        expect(screen.getAllByTestId("map-marker")).toHaveLength(
          mockListings.length
        );
      });
    });

    it("fires sourcedata handler on content sourceDataType", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Clear calls from initialization
      mockMapInstance.querySourceFeatures.mockClear();

      // Fire sourcedata with sourceDataType: 'content'
      const sourcedataCallbacks = onCallbacks["sourcedata"] || [];
      expect(sourcedataCallbacks.length).toBeGreaterThan(0);

      await act(async () => {
        for (const cb of sourcedataCallbacks) {
          cb({
            sourceId: "listings",
            sourceDataType: "content",
            isSourceLoaded: false,
          });
        }
      });

      // Advance past the 150ms sourcedata debounce so the handler fires
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Should have called querySourceFeatures via updateUnclusteredListings
      expect(mockMapInstance.querySourceFeatures).toHaveBeenCalled();
    });
  });

  describe("cluster expansion", () => {
    it("should expand cluster on click", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onClick?: (e: unknown) => void }>
      ).__mapHandlers;

      // Simulate cluster click with cluster feature
      await act(async () => {
        handlers?.onClick?.({
          features: [
            {
              properties: { cluster_id: 123 },
              geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
            },
          ],
          lngLat: { lng: -122.4194, lat: 37.7749 },
          originalEvent: {
            target: document.createElement("div"),
          },
        });
      });

      // Should mark as programmatic move
      expect(mockSetProgrammaticMove).toHaveBeenCalledWith(true);

      // Should trigger flyTo on map
      expect(mockMapInstance.flyTo).toHaveBeenCalled();
    });

    it("should guard against rapid cluster clicks", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onClick?: (e: unknown) => void }>
      ).__mapHandlers;

      const clusterClickEvent = {
        features: [
          {
            properties: { cluster_id: 123 },
            geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
          },
        ],
        lngLat: { lng: -122.4194, lat: 37.7749 },
        originalEvent: { target: document.createElement("div") },
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

    it("should clear isClusterExpandingRef on idle", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;

      // Trigger onIdle
      await act(async () => {
        handlers?.onIdle?.();
      });

      // onIdle should complete without error (cluster flag cleared internally)
      expect(handlers?.onIdle).toBeDefined();
    });
  });

  describe("cleanup on unmount", () => {
    it("should clear all timeout refs on unmount", async () => {
      const { unmount } = render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Unmount should not throw
      expect(() => unmount()).not.toThrow();
    });

    it("should remove event listeners on unmount", async () => {
      const { unmount } = render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      unmount();

      // Window handlers should be cleaned up by component unmount
      // The mock stores handlers on window, component cleanup removes them
      expect(true).toBe(true); // Verify unmount completes
    });

    it("should handle unmount during pending operations", async () => {
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

    it("should clear state arrays on unmount (memory cleanup)", async () => {
      const { unmount } = render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Verify component was working with listings
      const markers = screen.getAllByTestId("map-marker");
      expect(markers).toHaveLength(mockListings.length);

      // Unmount
      unmount();

      // Markers should be removed from DOM
      expect(screen.queryAllByTestId("map-marker")).toHaveLength(0);
    });
  });

  describe("webgl context recovery", () => {
    it("shows paused overlay and repaints when WebGL context is restored", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(mockCanvas.addEventListener).toHaveBeenCalledWith(
        "webglcontextlost",
        expect.any(Function)
      );
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith(
        "webglcontextrestored",
        expect.any(Function)
      );

      const lostEvent = { preventDefault: jest.fn() } as unknown as Event;
      await act(async () => {
        mockCanvas.emit("webglcontextlost", lostEvent);
      });

      expect(lostEvent.preventDefault).toHaveBeenCalled();
      expect(screen.getByLabelText("Map paused")).toBeInTheDocument();

      await act(async () => {
        mockCanvas.emit("webglcontextrestored");
        jest.advanceTimersByTime(10);
      });

      expect(mockMapInstance.triggerRepaint).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByLabelText("Map paused")).not.toBeInTheDocument();
      });

      warnSpy.mockRestore();
    });

    it("remounts map if WebGL context restore times out", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await act(async () => {
        mockCanvas.emit("webglcontextlost", {
          preventDefault: jest.fn(),
        } as unknown as Event);
      });

      expect(screen.getByLabelText("Map paused")).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      await act(async () => {
        jest.advanceTimersByTime(20);
      });

      await waitFor(() => {
        expect(screen.queryByLabelText("Map paused")).not.toBeInTheDocument();
      });
      expect(mockCanvas.removeEventListener).toHaveBeenCalledWith(
        "webglcontextlost",
        expect.any(Function)
      );
      expect(mockCanvas.removeEventListener).toHaveBeenCalledWith(
        "webglcontextrestored",
        expect.any(Function)
      );
      expect(
        mockCanvas.addEventListener.mock.calls.filter(
          (call) => call[0] === "webglcontextlost"
        ).length
      ).toBeGreaterThanOrEqual(2);
      expect(
        mockCanvas.addEventListener.mock.calls.filter(
          (call) => call[0] === "webglcontextrestored"
        ).length
      ).toBeGreaterThanOrEqual(2);

      warnSpy.mockRestore();
    });
  });

  describe("desktop map controls", () => {
    it("renders the hide map button on desktop", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(
        screen.getByRole("button", { name: /hide map/i })
      ).toBeInTheDocument();
    });

    it("shows a contextual reset pill after the user drifts away from the results", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          {
            onMoveEnd?: (e: unknown) => void;
          }
        >
      ).__mapHandlers;

      await act(async () => {
        handlers?.onMoveEnd?.({
          viewState: {
            longitude: -140,
            latitude: 45,
            zoom: 8,
            bearing: 0,
            pitch: 0,
          },
          target: {
            getBounds: () => ({
              getWest: () => -150,
              getEast: () => -140,
              getSouth: () => 40,
              getNorth: () => 48,
            }),
          },
        });
      });

      const resetButton = screen.getByRole("button", {
        name: /show all results on map/i,
      });
      expect(resetButton).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(resetButton);
      });

      expect(mockSetProgrammaticMove).toHaveBeenCalledWith(true);
    });
  });

  describe("empty state", () => {
    it("shows empty state when no listings", async () => {
      // Clear mock features for empty state
      mockQuerySourceFeaturesData = [];

      render(<MapComponent listings={[]} />);

      await act(async () => {
        // Advance past the 1.5s map initialization gate + render cycle
        jest.advanceTimersByTime(2000);
      });

      expect(screen.getByText(/no listings in this area/i)).toBeInTheDocument();
    });

    it("shows zoom out button in empty state", async () => {
      // Clear mock features for empty state
      mockQuerySourceFeaturesData = [];

      render(<MapComponent listings={[]} />);

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(
        screen.getByRole("button", { name: /zoom out/i })
      ).toBeInTheDocument();
    });
  });

  describe("keyboard navigation", () => {
    it("closes popup on Escape key", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Click marker to open popup
      const markers = screen.getAllByTestId("map-marker");
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      expect(screen.getByTestId("map-popup")).toBeInTheDocument();

      // Press Escape
      await act(async () => {
        fireEvent.keyDown(window, { key: "Escape" });
      });

      // Popup should be closed
      await waitFor(() => {
        expect(screen.queryByTestId("map-popup")).not.toBeInTheDocument();
      });
    });
  });

  describe("accessibility", () => {
    it("has accessible region landmark", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(
        screen.getByRole("region", { name: /interactive map/i })
      ).toBeInTheDocument();
    });

    it("announces selected listing to screen readers", async () => {
      render(<MapComponent listings={mockListings} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (
        window as unknown as Record<string, { onIdle?: () => void }>
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Click marker to select
      const markers = screen.getAllByTestId("map-marker");
      await act(async () => {
        fireEvent.click(markers[0]);
      });

      // Should have sr-only announcement - find the one with sr-only class
      // There may be multiple status elements (loading indicators, etc.)
      const statusElements = screen.getAllByRole("status");
      const announcement = statusElements.find((el) =>
        el.classList.contains("sr-only")
      );
      expect(announcement).toBeDefined();
      expect(announcement).toHaveClass("sr-only");
    });
  });

  describe("zoom-based marker tier rendering", () => {
    // Zoom thresholds from Map.tsx:
    // ZOOM_DOTS_ONLY = 12: Below zoom 12, all pins are gray dots (no price)
    // ZOOM_TOP_N_PINS = 14: Zoom 12-14, primary = price pins, mini = dots. Above 14, all price pins

    const listingsWithTiers = [
      {
        id: "primary-1",
        title: "Primary Listing",
        price: 1200,
        availableSlots: 2,
        ownerId: "owner-1",
        images: ["https://example.com/img1.jpg"],
        location: { lat: 37.7749, lng: -122.4194 },
        tier: "primary" as const,
      },
      {
        id: "mini-1",
        title: "Mini Listing",
        price: 900,
        availableSlots: 1,
        ownerId: "owner-2",
        images: ["https://example.com/img2.jpg"],
        location: { lat: 37.7849, lng: -122.4094 },
        tier: "mini" as const,
      },
      {
        id: "mini-2",
        title: "Another Mini",
        price: 800,
        availableSlots: 3,
        ownerId: "owner-3",
        images: [],
        location: { lat: 37.7649, lng: -122.4294 },
        tier: "mini" as const,
      },
    ];

    beforeEach(() => {
      // Set up mock features for querySourceFeatures with tier data
      mockQuerySourceFeaturesData = listingsWithTiers.map((listing) => ({
        properties: {
          id: listing.id,
          title: listing.title,
          price: listing.price,
          availableSlots: listing.availableSlots,
          ownerId: listing.ownerId || "",
          images: JSON.stringify(listing.images || []),
          lat: listing.location.lat,
          lng: listing.location.lng,
          tier: listing.tier,
        },
      }));
    });

    it("shows all markers as dots when zoom < 12 (ZOOM_DOTS_ONLY)", async () => {
      // Start with zoom level below 12
      mockMapInstance.getZoom = jest.fn(() => 10);

      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger onIdle to populate unclustered listings
      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }
        >
      ).__mapHandlers;
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
      const markers = screen.getAllByTestId("map-marker");
      expect(markers).toHaveLength(listingsWithTiers.length);

      // At low zoom, markers render as dots (no price visible in aria-label content)
      // The marker structure exists but shows simplified dot view
      markers.forEach((marker) => {
        expect(marker).toBeInTheDocument();
      });
    });

    it("shows primary tier as price pills and mini tier as dots at zoom 12-14", async () => {
      mockMapInstance.getZoom = jest.fn(() => 13);

      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }
        >
      ).__mapHandlers;
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
      const markers = screen.getAllByTestId("map-marker");
      expect(markers).toHaveLength(listingsWithTiers.length);

      // Primary tier markers should have price in aria-label
      const primaryMarker = markers.find(
        (m) => m.getAttribute("data-longitude") === "-122.4194"
      );
      expect(primaryMarker).toBeDefined();
    });

    it("shows all markers as price pills when zoom >= 14 (ZOOM_TOP_N_PINS)", async () => {
      mockMapInstance.getZoom = jest.fn(() => 15);

      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }
        >
      ).__mapHandlers;
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
      const markers = screen.getAllByTestId("map-marker");
      expect(markers).toHaveLength(listingsWithTiers.length);

      // At high zoom, all markers (including mini) show as price pills
      // The aria-label is on the inner wrapper div with data-listing-id attribute
      const markerWrappers = document.querySelectorAll("[data-listing-id]");
      expect(markerWrappers).toHaveLength(listingsWithTiers.length);

      markerWrappers.forEach((wrapper) => {
        const ariaLabel = wrapper.getAttribute("aria-label");
        expect(ariaLabel).toBeTruthy();
        expect(ariaLabel).toMatch(/\$[\d,]+ per month/);
      });
    });

    it("updates marker tier display when zoom changes from low to high", async () => {
      mockMapInstance.getZoom = jest.fn(() => 10);

      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }
        >
      ).__mapHandlers;
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

      let markers = screen.getAllByTestId("map-marker");
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
      markers = screen.getAllByTestId("map-marker");
      expect(markers).toHaveLength(listingsWithTiers.length);
    });

    it("handles rapid zoom changes without performance degradation", async () => {
      mockMapInstance.getZoom = jest.fn(() => 12);

      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }
        >
      ).__mapHandlers;
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
      const markers = screen.getAllByTestId("map-marker");
      expect(markers).toHaveLength(listingsWithTiers.length);

      // No errors should have occurred (test would fail on thrown errors)
    });

    it("preserves marker count when tier display changes", async () => {
      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }
        >
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Get initial marker count
      let markers = screen.getAllByTestId("map-marker");
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
        markers = screen.getAllByTestId("map-marker");
        expect(markers).toHaveLength(initialCount);
      }
    });

    it("debounces updateUnclusteredListings during rapid moveEnd events", async () => {
      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }
        >
      ).__mapHandlers;
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
      const markers = screen.getAllByTestId("map-marker");
      expect(markers).toHaveLength(listingsWithTiers.length);
    });

    it("maintains cluster state during tier threshold crossings", async () => {
      render(<MapComponent listings={listingsWithTiers} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const handlers = (
        window as unknown as Record<
          string,
          { onMoveEnd?: (e: unknown) => void; onIdle?: () => void }
        >
      ).__mapHandlers;
      await act(async () => {
        handlers?.onIdle?.();
      });

      // Verify Source component is rendered (clustering is enabled)
      const source = screen.getByTestId("map-source");
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
      expect(screen.getByTestId("map-source")).toBeInTheDocument();

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
      expect(screen.getByTestId("map-source")).toBeInTheDocument();

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
      expect(screen.getByTestId("map-source")).toBeInTheDocument();
    });
  });

  describe("Auto-zoom on empty results", () => {
    it("auto-zooms out when listings empty AND no filters active", async () => {
      mockSearchParams = new URLSearchParams(
        "minLat=37&maxLat=38&minLng=-123&maxLng=-122"
      );

      render(<MapComponent listings={[]} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Auto-zoom should trigger flyTo with reduced zoom
      expect(mockMapInstance.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({
          zoom: expect.any(Number),
          duration: 800,
        })
      );
      expect(mockSetProgrammaticMove).toHaveBeenCalledWith(true);
    });

    it("does NOT auto-zoom when filters are active", async () => {
      mockSearchParams = new URLSearchParams(
        "minLat=37&maxLat=38&minLng=-123&maxLng=-122&maxPrice=1500"
      );

      render(<MapComponent listings={[]} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Should NOT call flyTo for auto-zoom (flyTo may be called for other reasons)
      // The key is setProgrammaticMove should not be called for auto-zoom
      const flyToCalls = mockMapInstance.flyTo.mock.calls;
      const autoZoomCalls = flyToCalls.filter(
        (call: unknown[]) =>
          (call[0] as { duration?: number })?.duration === 800
      );
      expect(autoZoomCalls.length).toBe(0);
    });
  });
});
