import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DesktopHeaderSearch from "@/components/search/DesktopHeaderSearch";
import { SearchResultsLoadingWrapper } from "@/components/search/SearchResultsLoadingWrapper";
import { MAP_FLY_TO_EVENT } from "@/lib/search/map-fly-to";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockToastError = jest.fn();
const mockFetch = jest.fn();
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
    replace: mockReplace,
  }),
  useSearchParams: () => new URLSearchParams(mockSearchParams),
}));

jest.mock("@/contexts/SearchTransitionContext", () => ({
  useSearchTransitionSafe: () => null,
}));

jest.mock("@/hooks/useRecentSearches", () => ({
  useRecentSearches: () => ({
    recentSearches: mockRecentSearches,
    saveRecentSearch: jest.fn(),
    clearRecentSearches: jest.fn(),
    removeRecentSearch: jest.fn(),
    formatSearch: jest.fn(() => ""),
  }),
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
    onFocus,
    onBlur,
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
    onFocus?: () => void;
    onBlur?: () => void;
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
        onFocus={onFocus}
        onBlur={onBlur}
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

const ORIGINAL_SEMANTIC_FLAG = process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH;

beforeAll(() => {
  if (!HTMLFormElement.prototype.requestSubmit) {
    HTMLFormElement.prototype.requestSubmit = function () {
      this.dispatchEvent(
        new Event("submit", { cancelable: true, bubbles: true })
      );
    };
  }
});

describe("DesktopHeaderSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
    mockSearchParams = "";
    process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH = "true";
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

  afterAll(() => {
    process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH = ORIGINAL_SEMANTIC_FLAG;
  });

  it("renders a collapsed summary and expands to the inline editor on click", () => {
    render(<DesktopHeaderSearch collapsed />);

    expect(
      screen.getByTestId("desktop-header-search-summary")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("desktop-header-search-summary"));

    expect(
      screen.getByTestId("desktop-header-search-form")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Try 'quiet, near campus'")
    ).toBeInTheDocument();
  });

  it("deep-links each summary segment into its field", async () => {
    render(<DesktopHeaderSearch collapsed />);

    fireEvent.click(screen.getByRole("button", { name: "Edit budget" }));

    expect(
      screen.getByTestId("desktop-header-search-form")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Minimum budget")).toHaveFocus()
    );
  });

  it("shows the scrim while editing from collapsed and reverts edits on Escape", async () => {
    mockSearchParams = "locationLabel=Irving%2C+TX&lat=32.814&lng=-96.9489";
    render(<DesktopHeaderSearch collapsed />);

    fireEvent.click(screen.getByTestId("desktop-header-search-summary"));
    expect(screen.getByTestId("search-bar-scrim")).toHaveAttribute(
      "data-visible",
      "true"
    );

    const locationInput = screen.getByTestId("desktop-location-input");
    fireEvent.change(locationInput, { target: { value: "Berl" } });
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.getByTestId("desktop-header-search-summary")
      ).toBeInTheDocument()
    );

    // Re-open: the unsaved edit must be gone, replaced by URL state.
    fireEvent.click(screen.getByTestId("desktop-header-search-summary"));
    expect(screen.getByTestId("desktop-location-input")).toHaveValue(
      "Irving, TX"
    );
  });

  it("lets an open autocomplete popup consume the first Escape", () => {
    render(<DesktopHeaderSearch collapsed />);
    fireEvent.click(screen.getByTestId("desktop-header-search-summary"));

    const popup = document.createElement("div");
    popup.setAttribute("data-location-search-popup", "true");
    document.body.appendChild(popup);
    try {
      fireEvent.keyDown(document, { key: "Escape" });
      // Popup open — editor must stay expanded.
      expect(
        screen.getByTestId("desktop-header-search-form")
      ).toBeInTheDocument();
    } finally {
      popup.remove();
    }

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.getByTestId("desktop-header-search-summary")
    ).toBeInTheDocument();
  });

  it("resolves a typed destination on submit when autocomplete was not selected", async () => {
    const events: CustomEvent[] = [];
    const handler = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(MAP_FLY_TO_EVENT, handler);

    render(<DesktopHeaderSearch collapsed={false} />);

    expect(screen.queryByText("⌘")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("desktop-location-input"), {
      target: { value: "Seattle" },
    });
    fireEvent.submit(screen.getByTestId("desktop-header-search-form"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const pushedUrl = mockPush.mock.calls[0][0] as string;
    const url = new URL(pushedUrl, "http://localhost");

    expect(url.searchParams.get("locationLabel")).toBe("Seattle, WA");
    expect(url.searchParams.get("lat")).toBe("47.6062");
    expect(url.searchParams.get("lng")).toBe("-122.3321");
    expect(url.searchParams.get("minLng")).toBe("-122.512");
    expect(url.searchParams.get("maxLat")).toBe("47.786");
    expect(mockToastError).not.toHaveBeenCalled();
    expect(events[0]?.detail).toEqual({
      lat: 47.6062,
      lng: -122.3321,
      bbox: [-122.5121, 47.4262, -122.1521, 47.7862],
      zoom: 13,
    });

    window.removeEventListener(MAP_FLY_TO_EVENT, handler);
  });

  it("prompts for an autocomplete selection when typed destination cannot resolve", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    render(<DesktopHeaderSearch collapsed={false} />);

    fireEvent.change(screen.getByTestId("desktop-location-input"), {
      target: { value: "Atlantis" },
    });
    fireEvent.submit(screen.getByTestId("desktop-header-search-form"));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Select a location from the dropdown suggestions."
      )
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("auto-submits on selection, preserving vibe and existing filters", async () => {
    mockSearchParams = "sort=recommended&amenities=Wifi";
    const events: CustomEvent[] = [];
    const handler = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(MAP_FLY_TO_EVENT, handler);

    render(<DesktopHeaderSearch collapsed={false} />);

    fireEvent.change(
      screen.getByPlaceholderText("Try 'quiet, near campus'"),
      { target: { value: "quiet roommates" } }
    );
    // Dropdown selection auto-submits — one navigation, no Search press needed.
    fireEvent.click(screen.getByTestId("desktop-location-select"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const pushedUrl = mockPush.mock.calls[0][0] as string;
    const url = new URL(pushedUrl, "http://localhost");

    expect(url.searchParams.get("sort")).toBeNull();
    expect(url.searchParams.get("amenities")).toBe("Wifi");
    expect(url.searchParams.get("locationLabel")).toBe("San Francisco");
    expect(url.searchParams.get("what")).toBe("quiet roommates");
    expect(url.searchParams.get("lat")).toBe("37.7749");
    expect(url.searchParams.get("lng")).toBe("-122.4194");
    expect(url.searchParams.get("minLng")).toBe("-122.600");
    expect(url.searchParams.get("maxLat")).toBe("37.900");
    // Exactly one fly-to for the whole interaction.
    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toEqual({
      lat: 37.7749,
      lng: -122.4194,
      bbox: [-122.6, 37.6, -122.2, 37.9],
      zoom: 13,
    });

    window.removeEventListener(MAP_FLY_TO_EVENT, handler);
  });

  it("passes recent locations as fallback items that set a valid selected location", async () => {
    render(<DesktopHeaderSearch collapsed={false} />);

    fireEvent.click(screen.getByTestId("desktop-fallback-recent-1"));
    fireEvent.submit(screen.getByTestId("desktop-header-search-form"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const pushedUrl = mockPush.mock.calls[0][0] as string;
    const url = new URL(pushedUrl, "http://localhost");

    expect(url.searchParams.get("locationLabel")).toBe("Irving, TX");
    expect(url.searchParams.get("lat")).toBe("32.814");
    expect(url.searchParams.get("lng")).toBe("-96.9489");
    expect(url.searchParams.get("minLng")).toBeTruthy();
  });

  it("does not flush synchronously when filter focus management blurs a budget input", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const renderSearchHeaderWithResults = () => (
        <>
          <DesktopHeaderSearch collapsed={false} />
          <SearchResultsLoadingWrapper>
            <h2 id="search-results-heading" tabIndex={-1}>
              12 rooms
            </h2>
          </SearchResultsLoadingWrapper>
        </>
      );

      const { rerender } = render(renderSearchHeaderWithResults());
      const minBudgetInput = screen.getByLabelText("Minimum budget");

      minBudgetInput.focus();
      fireEvent.change(minBudgetInput, { target: { value: "900" } });
      expect(minBudgetInput).toHaveFocus();

      mockSearchParams = "minPrice=900";
      rerender(renderSearchHeaderWithResults());

      const consoleOutput = consoleErrorSpy.mock.calls
        .flat()
        .map(String)
        .join("\n");
      expect(screen.getByText("12 rooms")).toHaveFocus();
      expect(consoleOutput).not.toContain(
        "flushSync was called from inside a lifecycle method"
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
