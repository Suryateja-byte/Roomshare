import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import DesktopHeaderSearch from "@/components/search/DesktopHeaderSearch";
import { MAP_FLY_TO_EVENT } from "@/components/SearchForm";

const mockPush = jest.fn();
const mockToastError = jest.fn();
let mockSearchParams = "";
const mockRecentSearches = [
  {
    id: "recent-1",
    location: "Irving, TX",
    coords: { lat: 32.814, lng: -96.9489 },
    timestamp: Date.now(),
    filters: {},
  },
];

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams(mockSearchParams),
}));

jest.mock("@/contexts/SearchTransitionContext", () => ({
  useSearchTransitionSafe: () => null,
}));

jest.mock("@/hooks/useRecentSearches", () => ({
  useRecentSearches: () => ({
    recentSearches: mockRecentSearches,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

jest.mock("@/components/SearchForm", () => ({
  __esModule: true,
  MAP_FLY_TO_EVENT: "mapFlyToLocation",
}));

jest.mock("@/components/LocationSearchInput", () => ({
  __esModule: true,
  default: ({
    id,
    value,
    onChange,
    onLocationSelect,
    placeholder,
    fallbackItems = [],
  }: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    onLocationSelect?: (location: {
      name: string;
      lat: number;
      lng: number;
      bbox?: [number, number, number, number];
    }) => void;
    placeholder?: string;
    fallbackItems?: Array<{
      id: string;
      primaryText: string;
      onSelect: () => void;
    }>;
  }) => (
    <div>
      <input
        id={id}
        data-testid="desktop-location-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        data-testid="desktop-location-select"
        onClick={() =>
          onLocationSelect?.({
            name: "San Francisco",
            lat: 37.7749,
            lng: -122.4194,
            bbox: [-122.6, 37.6, -122.2, 37.9],
          })
        }
      >
        Select location
      </button>
      {fallbackItems.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid={`desktop-fallback-${item.id}`}
          onClick={item.onSelect}
        >
          {item.primaryText}
        </button>
      ))}
    </div>
  ),
}));

describe("DesktopHeaderSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = "";
  });

  it("renders a collapsed summary and expands to the inline editor on click", () => {
    render(<DesktopHeaderSearch collapsed />);

    expect(
      screen.getByTestId("desktop-header-search-summary")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("desktop-header-search-summary"));

    expect(screen.getByTestId("desktop-header-search-form")).toBeInTheDocument();
    expect(screen.getByLabelText("Vibe")).toBeInTheDocument();
  });

  it("blocks typed locations that were not selected from autocomplete", () => {
    render(<DesktopHeaderSearch collapsed={false} />);

    fireEvent.change(screen.getByTestId("desktop-location-input"), {
      target: { value: "Chicago" },
    });
    fireEvent.submit(screen.getByTestId("desktop-header-search-form"));

    expect(mockToastError).toHaveBeenCalledWith(
      "Select a location from the dropdown suggestions."
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("submits selected location and vibe while preserving existing sort", () => {
    mockSearchParams = "sort=recommended&amenities=Wifi";
    const events: CustomEvent[] = [];
    const handler = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(MAP_FLY_TO_EVENT, handler);

    render(<DesktopHeaderSearch collapsed={false} />);

    fireEvent.click(screen.getByTestId("desktop-location-select"));
    fireEvent.change(screen.getByLabelText("Vibe"), {
      target: { value: "quiet roommates" },
    });
    fireEvent.submit(screen.getByTestId("desktop-header-search-form"));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const pushedUrl = mockPush.mock.calls[0][0] as string;
    const url = new URL(pushedUrl, "http://localhost");

    expect(url.searchParams.get("sort")).toBe("recommended");
    expect(url.searchParams.get("amenities")).toBe("Wifi");
    expect(url.searchParams.get("where")).toBe("San Francisco");
    expect(url.searchParams.get("what")).toBe("quiet roommates");
    expect(url.searchParams.get("lat")).toBe("37.7749");
    expect(url.searchParams.get("lng")).toBe("-122.4194");
    expect(url.searchParams.get("minLng")).toBe("-122.6");
    expect(url.searchParams.get("maxLat")).toBe("37.9");
    expect(events[0]?.detail).toEqual({
      lat: 37.7749,
      lng: -122.4194,
      bbox: [-122.6, 37.6, -122.2, 37.9],
      zoom: 13,
    });

    window.removeEventListener(MAP_FLY_TO_EVENT, handler);
  });

  it("passes recent locations as fallback items that set a valid selected location", () => {
    render(<DesktopHeaderSearch collapsed={false} />);

    fireEvent.click(screen.getByTestId("desktop-fallback-recent-1"));
    fireEvent.submit(screen.getByTestId("desktop-header-search-form"));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const pushedUrl = mockPush.mock.calls[0][0] as string;
    const url = new URL(pushedUrl, "http://localhost");

    expect(url.searchParams.get("where")).toBe("Irving, TX");
    expect(url.searchParams.get("lat")).toBe("32.814");
    expect(url.searchParams.get("lng")).toBe("-96.9489");
    expect(url.searchParams.get("minLng")).toBeTruthy();
  });
});
