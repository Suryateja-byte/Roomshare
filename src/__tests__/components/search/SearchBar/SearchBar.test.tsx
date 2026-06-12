/**
 * Unit tests for the unified SearchBar module — the shared submit pipeline
 * (canonical URLs, fly-to dispatch, price normalization, typed-location
 * resolution, bounds preservation, recents) and the interaction chrome
 * (engaged state, active cell, dead-space click, location warning).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/components/LocationSearchInput", () => {
  return function MockLocationSearchInput({
    id,
    value,
    onChange,
    onLocationSelect,
    onFocus,
    onBlur,
    placeholder,
    inputClassName,
    inputRef,
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
    inputClassName?: string;
    inputRef?: React.RefObject<HTMLInputElement | null>;
  }) {
    return (
      <div>
        <input
          id={id}
          data-testid="location-input"
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          className={inputClassName}
        />
        <button
          type="button"
          data-testid="select-location"
          onClick={() =>
            onLocationSelect?.({
              name: "San Francisco",
              lat: 37.7749,
              lng: -122.4194,
              bbox: [-122.55, 37.7, -122.35, 37.85],
            })
          }
        >
          Select SF
        </button>
      </div>
    );
  };
});

const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

const mockResolveTypedSearchLocation = jest.fn();
jest.mock("@/lib/search/typed-location-resolver", () => ({
  resolveTypedSearchLocation: (...args: unknown[]) =>
    mockResolveTypedSearchLocation(...args),
}));

const mockSaveRecentSearch = jest.fn();
const mockClearRecentSearches = jest.fn();
jest.mock("@/hooks/useRecentSearches", () => ({
  useRecentSearches: () => ({
    recentSearches: [],
    saveRecentSearch: mockSaveRecentSearch,
    clearRecentSearches: mockClearRecentSearches,
    removeRecentSearch: jest.fn(),
    formatSearch: jest.fn(() => ""),
  }),
}));

import { MAP_FLY_TO_EVENT } from "@/lib/search/map-fly-to";
import {
  SearchBar,
  useSearchBarState,
  useSearchSubmit,
  type UseSearchSubmitOptions,
  type SearchBarProps,
} from "@/components/search/SearchBar";

function Harness({
  submitOptions,
  barProps,
}: {
  submitOptions?: Partial<UseSearchSubmitOptions>;
  barProps?: Partial<SearchBarProps>;
}) {
  const state = useSearchBarState();
  const { handleSubmit, isSearching, isResolvingTypedLocation } =
    useSearchSubmit({ state, ...submitOptions });
  return (
    <SearchBar
      state={state}
      onSubmit={handleSubmit}
      isSearching={isSearching}
      submitDisabled={isResolvingTypedLocation}
      {...barProps}
    />
  );
}

function setSearchParams(query: string) {
  for (const key of Array.from(mockSearchParams.keys())) {
    mockSearchParams.delete(key);
  }
  for (const [key, value] of new URLSearchParams(query).entries()) {
    mockSearchParams.append(key, value);
  }
}

function lastPushedParams(): URLSearchParams {
  const url: string = mockPush.mock.calls.at(-1)?.[0];
  expect(url).toMatch(/^\/search/);
  return new URLSearchParams(url.split("?")[1] ?? "");
}

beforeAll(() => {
  if (!HTMLFormElement.prototype.requestSubmit) {
    HTMLFormElement.prototype.requestSubmit = function () {
      this.dispatchEvent(
        new Event("submit", { cancelable: true, bubbles: true })
      );
    };
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  setSearchParams("");
});

describe("SearchBar submit pipeline", () => {
  it("auto-submits on dropdown selection with canonical URL and one fly-to", async () => {
    const flyToListener = jest.fn();
    window.addEventListener(MAP_FLY_TO_EVENT, flyToListener);
    try {
      render(<Harness />);
      fireEvent.click(screen.getByTestId("select-location"));

      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      const params = lastPushedParams();
      expect(params.get("locationLabel")).toBe("San Francisco");
      expect(params.get("lat")).toBe("37.7749");
      expect(params.get("lng")).toBe("-122.4194");
      expect(params.get("minLat")).not.toBeNull();
      expect(flyToListener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(MAP_FLY_TO_EVENT, flyToListener);
    }
  });

  it("swaps and clamps an inverted budget range from live inputs", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Minimum budget"), {
      target: { value: "2000" },
    });
    fireEvent.change(screen.getByLabelText("Maximum budget"), {
      target: { value: "1000" },
    });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const params = lastPushedParams();
    expect(params.get("minPrice")).toBe("1000");
    expect(params.get("maxPrice")).toBe("2000");
  });

  it("resolves a typed-but-unselected location and navigates with its coords", async () => {
    mockResolveTypedSearchLocation.mockResolvedValue({
      label: "Austin, TX",
      selection: { lat: 30.2672, lng: -97.7431, bounds: [-98, 30, -97.5, 30.5] },
    });
    const flyToListener = jest.fn();
    window.addEventListener(MAP_FLY_TO_EVENT, flyToListener);
    try {
      render(<Harness />);
      fireEvent.change(screen.getByTestId("location-input"), {
        target: { value: "Austin" },
      });
      fireEvent.submit(screen.getByRole("search"));

      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      expect(mockResolveTypedSearchLocation).toHaveBeenCalledWith("Austin");
      const params = lastPushedParams();
      expect(params.get("locationLabel")).toBe("Austin, TX");
      expect(params.get("lat")).toBe("30.2672");
      expect(flyToListener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(MAP_FLY_TO_EVENT, flyToListener);
    }
  });

  it("blocks navigation, toasts, and refocuses when resolution fails", async () => {
    mockResolveTypedSearchLocation.mockResolvedValue(null);
    render(<Harness />);
    const input = screen.getByTestId("location-input");
    fireEvent.change(input, { target: { value: "Xyzzy" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Select a location from the dropdown suggestions."
      )
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it("preserves current bounds on an empty-everything submit", async () => {
    setSearchParams("minLat=37&minLng=-123&maxLat=38&maxLng=-122");
    render(<Harness />);
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const params = lastPushedParams();
    expect(params.get("minLat")).toBe("37.000");
    expect(params.get("maxLat")).toBe("38.000");
  });

  it("preserves filters and non-default sort, resets pagination", async () => {
    setSearchParams("amenities=Wifi&sort=price_asc&page=3&cursor=abc");
    render(<Harness />);
    fireEvent.click(screen.getByTestId("select-location"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const params = lastPushedParams();
    expect(params.get("amenities")).toBe("Wifi");
    expect(params.get("sort")).toBe("price_asc");
    expect(params.get("page")).toBeNull();
    expect(params.get("cursor")).toBeNull();
  });

  it("drops sort=recommended on submit (canonical default)", async () => {
    setSearchParams("sort=recommended");
    render(<Harness />);
    fireEvent.click(screen.getByTestId("select-location"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(lastPushedParams().get("sort")).toBeNull();
  });

  it("records a recent search on successful submit", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("select-location"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockSaveRecentSearch).toHaveBeenCalledTimes(1);
    expect(mockSaveRecentSearch.mock.calls[0][0]).toBe("San Francisco");
    expect(mockSaveRecentSearch.mock.calls[0][1]).toMatchObject({
      lat: 37.7749,
      lng: -122.4194,
    });
  });

  it("calls onBeforeNavigate before navigating", async () => {
    const order: string[] = [];
    const onBeforeNavigate = jest.fn(() => order.push("before"));
    mockPush.mockImplementation(() => order.push("push"));
    render(<Harness submitOptions={{ onBeforeNavigate }} />);
    fireEvent.click(screen.getByTestId("select-location"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["before", "push"]);
    mockPush.mockReset();
  });
});

describe("SearchBar chrome", () => {
  it("marks the bar engaged and the focused cell active", () => {
    render(<Harness barProps={{ formTestId: "bar-under-test" }} />);
    const form = screen.getByTestId("bar-under-test");
    expect(form).not.toHaveAttribute("data-engaged");

    fireEvent.focus(screen.getByTestId("location-input"));
    expect(form).toHaveAttribute("data-engaged", "true");
    const whereCell = form.querySelector('[data-field="where"]');
    expect(whereCell).toHaveAttribute("data-active", "true");
  });

  it("focuses the min budget input when the budget cell dead space is clicked", () => {
    render(<Harness />);
    const budgetCell = document.querySelector('[data-field="budget"]');
    expect(budgetCell).not.toBeNull();
    fireEvent.click(budgetCell!);
    expect(document.activeElement).toBe(
      screen.getByLabelText("Minimum budget")
    );
  });

  it("shows the role=alert location warning on blur with typed unselected text", () => {
    render(<Harness />);
    const input = screen.getByTestId("location-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Austin" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.blur(input);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "location-warning");
  });

  it("keeps in-progress location typing when the URL changes underneath", () => {
    const { rerender } = render(<Harness />);
    const input = screen.getByTestId("location-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Aus" } });

    // Simulate a map-pan URL write while the user is mid-type.
    setSearchParams("minLat=37&minLng=-123&maxLat=38&maxLng=-122");
    rerender(<Harness />);

    expect(screen.getByTestId("location-input")).toHaveValue("Aus");
  });

  it("budget inputs never carry name attributes", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Minimum budget")).not.toHaveAttribute("name");
    expect(screen.getByLabelText("Maximum budget")).not.toHaveAttribute(
      "name"
    );
  });
});
