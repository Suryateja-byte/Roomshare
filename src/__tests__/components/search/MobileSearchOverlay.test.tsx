/**
 * Unit tests for MobileSearchOverlay
 *
 * The overlay now renders the shared SearchBar (stacked layout, mobile- id
 * prefix); these tests pin the overlay-specific wiring: dialog semantics,
 * prefixed ids, recents fallback items, typed-destination resolution, and the
 * close-before-navigate ordering.
 */

const mockPush = jest.fn();
const mockToastError = jest.fn();
const mockFetch = jest.fn();

jest.mock("react-dom", () => {
  const actual = jest.requireActual("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

let mockSearchParams = "q=Chicago&amenities=Wifi";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams(mockSearchParams),
}));

jest.mock("framer-motion", () => ({
  LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  domAnimation: {},
  useReducedMotion: () => false,
  m: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children: React.ReactNode;
    }) => <div {...props}>{children}</div>,
    span: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement> & {
      children: React.ReactNode;
    }) => <span {...props}>{children}</span>,
  },
}));

jest.mock("@/hooks/useRecentSearches", () => ({
  useRecentSearches: () => ({
    recentSearches: [
      {
        id: "recent-1",
        location: "Irving, TX",
        coords: { lat: 32.814, lng: -96.9489 },
      },
    ],
    saveRecentSearch: jest.fn(),
    clearRecentSearches: jest.fn(),
    removeRecentSearch: jest.fn(),
    formatSearch: (search: { location: string }) => search.location,
  }),
}));

jest.mock("@/components/ui/FocusTrap", () => ({
  FocusTrap: ({
    children,
  }: {
    children: React.ReactNode;
    active?: boolean;
  }) => <>{children}</>,
}));

jest.mock("@/hooks/useBodyScrollLock", () => ({
  useBodyScrollLock: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

jest.mock("@/components/LocationSearchInput", () => ({
  __esModule: true,
  default: ({
    id,
    value,
    onChange,
    onLocationSelect,
    fallbackItems = [],
    inputRef,
  }: {
    id?: string;
    value?: string;
    onChange?: (value: string) => void;
    onLocationSelect?: (location: {
      name: string;
      lat: number;
      lng: number;
      bbox?: [number, number, number, number];
    }) => void;
    fallbackItems?: Array<{
      id: string;
      primaryText: string;
      onSelect: () => void;
    }>;
    inputRef?: React.RefObject<HTMLInputElement | null>;
  }) => (
    <div data-testid="location-search-input">
      <input
        id={id}
        ref={(node) => {
          if (inputRef) {
            inputRef.current = node;
          }
        }}
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
      />
      <button
        type="button"
        data-testid="mobile-location-select"
        onClick={() =>
          onLocationSelect?.({
            name: "Los Angeles",
            lat: 34.0522,
            lng: -118.2437,
            bbox: [-118.6682, 33.7037, -118.1553, 34.3373],
          })
        }
      >
        Select location
      </button>
      {fallbackItems.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid={`mobile-fallback-${item.id}`}
          onClick={item.onSelect}
        >
          {item.primaryText}
        </button>
      ))}
    </div>
  ),
}));

jest.mock("@/components/filters/filter-chip-utils", () => ({
  urlToFilterChips: jest.fn(() => []),
}));

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MobileSearchOverlay from "@/components/search/MobileSearchOverlay";
import { MAP_FLY_TO_EVENT } from "@/lib/search/map-fly-to";

beforeAll(() => {
  if (!HTMLFormElement.prototype.requestSubmit) {
    HTMLFormElement.prototype.requestSubmit = function () {
      this.dispatchEvent(
        new Event("submit", { cancelable: true, bubbles: true })
      );
    };
  }
});

describe("MobileSearchOverlay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
    mockSearchParams = "q=Chicago&amenities=Wifi";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "local:place:seattle-wa",
            place_name: "Seattle, WA",
            center: [-122.3321, 47.6062],
            bbox: [-122.5121, 47.4262, -122.1521, 47.7862],
            place_type: ["place"],
            requires_resolution: false,
          },
        ],
      }),
    });
  });

  it("renders the dialog with the stacked shared bar and prefixed ids", () => {
    render(
      <MobileSearchOverlay
        isOpen
        onClose={jest.fn()}
        onOpenFilters={jest.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("search")).toBeInTheDocument();
    // Prefixed ids: the hidden desktop header form stays mounted on mobile,
    // so the overlay must not reuse #search-location / #search-budget-*.
    expect(screen.getByLabelText(/where/i)).toHaveAttribute(
      "id",
      "mobile-search-location"
    );
    expect(screen.getByLabelText("Minimum budget")).toHaveAttribute(
      "id",
      "mobile-search-budget-min"
    );
    expect(screen.getByLabelText("Maximum budget")).toHaveAttribute(
      "id",
      "mobile-search-budget-max"
    );
  });

  it("hydrates the location from the URL when opened", () => {
    render(
      <MobileSearchOverlay
        isOpen
        onClose={jest.fn()}
        onOpenFilters={jest.fn()}
      />
    );

    expect(screen.getByLabelText(/where/i)).toHaveValue("Chicago");
  });

  it("passes recent locations into the shared input as fallback items", () => {
    render(
      <MobileSearchOverlay
        isOpen
        onClose={jest.fn()}
        onOpenFilters={jest.fn()}
      />
    );

    expect(screen.getByTestId("mobile-fallback-recent-1")).toHaveTextContent(
      "Irving, TX"
    );
  });

  it("resolves a typed destination on mobile submit when autocomplete was not selected", async () => {
    const onClose = jest.fn();
    const events: CustomEvent[] = [];
    const handler = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(MAP_FLY_TO_EVENT, handler);

    render(
      <MobileSearchOverlay isOpen onClose={onClose} onOpenFilters={jest.fn()} />
    );

    fireEvent.change(screen.getByLabelText(/where/i), {
      target: { value: "Seattle" },
    });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const pushedUrl = mockPush.mock.calls[0][0] as string;
    const url = new URL(pushedUrl, "http://localhost");

    expect(url.searchParams.get("locationLabel")).toBe("Seattle, WA");
    expect(url.searchParams.get("lat")).toBe("47.6062");
    expect(url.searchParams.get("lng")).toBe("-122.3321");
    expect(url.searchParams.get("minLng")).toBe("-122.512");
    expect(url.searchParams.get("maxLat")).toBe("47.786");
    expect(url.searchParams.get("amenities")).toBe("Wifi");
    expect(mockToastError).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(events[0]?.detail).toEqual({
      lat: 47.6062,
      lng: -122.3321,
      bbox: [-122.5121, 47.4262, -122.1521, 47.7862],
      zoom: 13,
    });

    window.removeEventListener(MAP_FLY_TO_EVENT, handler);
  });

  it("prompts on mobile when typed destination cannot resolve", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    render(
      <MobileSearchOverlay
        isOpen
        onClose={jest.fn()}
        onOpenFilters={jest.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/where/i), {
      target: { value: "Atlantis" },
    });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Select a location from the dropdown suggestions."
      )
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("auto-submits with one fly-to when a dropdown location is selected", async () => {
    const onClose = jest.fn();
    const events: CustomEvent[] = [];
    const handler = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(MAP_FLY_TO_EVENT, handler);

    render(
      <MobileSearchOverlay isOpen onClose={onClose} onOpenFilters={jest.fn()} />
    );

    fireEvent.click(screen.getByTestId("mobile-location-select"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const pushedUrl = mockPush.mock.calls[0][0] as string;
    const url = new URL(pushedUrl, "http://localhost");

    expect(url.searchParams.get("locationLabel")).toBe("Los Angeles");
    expect(url.searchParams.get("lat")).toBe("34.0522");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toEqual({
      lat: 34.0522,
      lng: -118.2437,
      bbox: [-118.6682, 33.7037, -118.1553, 34.3373],
      zoom: 13,
    });

    window.removeEventListener(MAP_FLY_TO_EVENT, handler);
  });

  it("swaps an inverted min/max budget on submit", async () => {
    mockSearchParams = "";
    render(
      <MobileSearchOverlay
        isOpen
        onClose={jest.fn()}
        onOpenFilters={jest.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Minimum budget"), {
      target: { value: "2000" },
    });
    fireEvent.change(screen.getByLabelText("Maximum budget"), {
      target: { value: "1000" },
    });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const url = new URL(mockPush.mock.calls[0][0] as string, "http://localhost");
    expect(url.searchParams.get("minPrice")).toBe("1000");
    expect(url.searchParams.get("maxPrice")).toBe("2000");
  });
});
