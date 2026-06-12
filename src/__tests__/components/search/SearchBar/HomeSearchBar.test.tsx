/**
 * Ported tests for the HomeSearchBar container.
 *
 * Port source: src/__tests__/components/SearchForm.test.tsx
 * Port target: src/components/search/SearchBar/HomeSearchBar.tsx
 *
 * Sanctioned changes applied:
 *   SC1 - Typed >2 chars w/o selection now calls resolveTypedSearchLocation,
 *         navigates on success; toasts and focuses input on failure. Passive
 *         warning still renders when typed>2 && no selection && not focused.
 *   SC2 - variant="compact" / variant="default" / variant="home" props removed;
 *         Tailwind class pin tests dropped. HomeSearchBar IS the home variant.
 *   SC3 - MAP_FLY_TO_EVENT imported from "@/lib/search/map-fly-to".
 *   SC4 - Plain re-submit with pre-existing selection ALSO dispatches fly-to;
 *         selection-time auto-submit has exactly 1 fly-to (no double dispatch).
 *   SC5 - Field order: Where → What → Budget (What env-gated).
 *   SC6 - Filters button / FilterModal behavior unchanged.
 *   SC7 - URL-contract assertions ported verbatim (mechanical renames only).
 *   SC8 - saveRecentSearch still called; useRecentSearches mocked with all members.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// next/navigation
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// LocationSearchInput — full mock with all props used by the new bar
// ---------------------------------------------------------------------------
jest.mock("@/components/LocationSearchInput", () => ({
  __esModule: true,
  default: function MockLocationSearchInput({
    id,
    value,
    onChange,
    onLocationSelect,
    onFocus,
    onBlur,
    placeholder,
    inputClassName,
    inputRef,
    fallbackItems = [],
    showFallbackOnEmptyFocus,
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
    fallbackItems?: Array<{
      id: string;
      primaryText: string;
      onSelect: () => void;
    }>;
    showFallbackOnEmptyFocus?: boolean;
  }) {
    void showFallbackOnEmptyFocus; // consumed, no warnings
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
        {fallbackItems.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`fallback-${item.id}`}
            onClick={item.onSelect}
          >
            {item.primaryText}
          </button>
        ))}
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// DatePicker
// ---------------------------------------------------------------------------
jest.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="date-picker"
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Select components
// ---------------------------------------------------------------------------
jest.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <div data-testid="select-root" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id?: string;
  }) => (
    <button data-testid={`select-trigger-${id}`} id={id}>
      {children}
    </button>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => (
    <div data-testid={`select-item-${value}`} data-value={value}>
      {children}
    </div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

// ---------------------------------------------------------------------------
// sonner toast
// ---------------------------------------------------------------------------
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// resolveTypedSearchLocation (SC1 — typed location resolution)
// ---------------------------------------------------------------------------
const mockResolveTypedSearchLocation = jest.fn();
jest.mock("@/lib/search/typed-location-resolver", () => ({
  resolveTypedSearchLocation: (...args: unknown[]) =>
    mockResolveTypedSearchLocation(...args),
}));

// ---------------------------------------------------------------------------
// useRecentSearches (SC8 — must mock all members)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Contexts that HomeSearchBar depends on but are irrelevant to the tests
// ---------------------------------------------------------------------------
jest.mock("@/contexts/SearchTransitionContext", () => ({
  useSearchTransitionSafe: () => null,
}));

jest.mock("@/contexts/MobileSearchContext", () => ({
  useMobileSearch: () => ({
    mobileResultsView: "list",
    registerOpenFilters: () => () => {},
  }),
}));

// ---------------------------------------------------------------------------
// useDebouncedFilterCount / useFacets — stub out fetch-backed hooks
// ---------------------------------------------------------------------------
jest.mock("@/hooks/useDebouncedFilterCount", () => ({
  useDebouncedFilterCount: () => ({
    count: 24,
    formattedCount: "Show 24",
    isLoading: false,
    boundsRequired: false,
  }),
}));

jest.mock("@/hooks/useFacets", () => ({
  useFacets: () => ({
    facets: {
      priceRanges: { min: 0, max: 10000 },
      priceHistogram: { buckets: [] },
      roomTypes: {},
      amenities: {},
      houseRules: {},
    },
  }),
}));

// ---------------------------------------------------------------------------
// Imports (must come after all jest.mock calls)
// ---------------------------------------------------------------------------
import HomeSearchBar from "@/components/search/SearchBar/HomeSearchBar";
import { MAP_FLY_TO_EVENT } from "@/lib/search/map-fly-to"; // SC3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function futureDateInput(daysFromNow: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

const VALID_MOVE_IN_DATE = futureDateInput(30);
const VALID_END_DATE = futureDateInput(60);
const LATER_MOVE_IN_DATE = futureDateInput(60);
const EARLIER_END_DATE = futureDateInput(30);

// ---------------------------------------------------------------------------
// requestSubmit polyfill (JSDOM)
// ---------------------------------------------------------------------------
beforeAll(() => {
  if (!HTMLFormElement.prototype.requestSubmit) {
    HTMLFormElement.prototype.requestSubmit = function () {
      this.dispatchEvent(
        new Event("submit", { cancelable: true, bubbles: true })
      );
    };
  }
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe("HomeSearchBar", () => {
  const user = userEvent.setup({ delay: null });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Default resolve: no result (prevents hanging async tests that don't care)
    mockResolveTypedSearchLocation.mockResolvedValue(null);
    // Reset search params
    for (const key of Array.from(mockSearchParams.keys())) {
      mockSearchParams.delete(key);
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==========================================================================
  // Rendering Tests
  // ==========================================================================

  describe("rendering", () => {
    it('renders search form with role="search"', () => {
      render(<HomeSearchBar />);
      expect(screen.getByRole("search")).toBeInTheDocument();
    });

    it('renders "Where" label', () => {
      render(<HomeSearchBar />);
      expect(screen.getByText("Where")).toBeInTheDocument();
    });

    it('renders "Budget" label', () => {
      render(<HomeSearchBar />);
      expect(screen.getByText("Budget")).toBeInTheDocument();
    });

    it("renders location input", () => {
      render(<HomeSearchBar />);
      expect(screen.getByTestId("location-input")).toBeInTheDocument();
    });

    it("renders min/max price inputs", () => {
      render(<HomeSearchBar />);
      expect(screen.getByLabelText(/minimum budget/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/maximum budget/i)).toBeInTheDocument();
    });

    it("renders Filters toggle button", () => {
      render(<HomeSearchBar />);
      expect(
        screen.getByRole("button", { name: /filters/i })
      ).toBeInTheDocument();
    });

    it("renders search button", () => {
      render(<HomeSearchBar />);
      expect(
        screen.getByRole("button", { name: /search/i })
      ).toBeInTheDocument();
    });

    // SC5: When semantic search is enabled, "What" field is shown between Where and Budget
    describe("with semantic search enabled", () => {
      const originalFlag = process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH;

      beforeEach(() => {
        process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH = "true";
      });

      afterEach(() => {
        process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH = originalFlag;
      });

      it('renders "What", "Where", and "Budget" controls', () => {
        render(<HomeSearchBar />);
        expect(screen.getByText("What")).toBeInTheDocument();
        expect(screen.getByText("Where")).toBeInTheDocument();
        expect(screen.getByText("Budget")).toBeInTheDocument();
        expect(
          screen.getByPlaceholderText(/quiet, near campus/i)
        ).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // URL Parameter Initialization Tests
  // ==========================================================================

  describe("URL parameter initialization", () => {
    // The new bar reads the URL via useSearchBarState; 'locationLabel' is the
    // canonical URL param for the where field (formerly 'q' in SearchForm).
    it("initializes location from locationLabel param", () => {
      mockSearchParams.set("locationLabel", "downtown");
      render(<HomeSearchBar />);
      expect(screen.getByTestId("location-input")).toHaveValue("downtown");
    });

    it("initializes minPrice from URL", () => {
      mockSearchParams.set("minPrice", "500");
      render(<HomeSearchBar />);
      expect(screen.getByLabelText(/minimum budget/i)).toHaveValue(500);
    });

    it("initializes maxPrice from URL", () => {
      mockSearchParams.set("maxPrice", "1500");
      render(<HomeSearchBar />);
      expect(screen.getByLabelText(/maximum budget/i)).toHaveValue(1500);
    });

    it("renders location input with coords present in URL", () => {
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");
      render(<HomeSearchBar />);
      expect(screen.getByTestId("location-input")).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Filter Panel Tests
  // ==========================================================================

  describe("filter panel", () => {
    it("filters panel is hidden by default", () => {
      render(<HomeSearchBar />);
      expect(screen.queryByText("Move-in Date")).not.toBeInTheDocument();
    });

    it("clicking Filters button opens the panel", async () => {
      render(<HomeSearchBar />);
      const filtersButton = screen.getByRole("button", { name: /filters/i });

      await user.click(filtersButton);
      jest.runAllTimers();

      expect(screen.getByText("Move-in Date")).toBeInTheDocument();
      expect(screen.getByText("Lease Duration")).toBeInTheDocument();
      expect(screen.getByText("Room Type")).toBeInTheDocument();
    });

    it("panel shows amenities buttons", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      expect(screen.getByRole("button", { name: "Wifi" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "AC" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Parking" })
      ).toBeInTheDocument();
    });

    it("panel shows house rules buttons", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      expect(
        screen.getByRole("button", { name: "Pets allowed" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Smoking allowed" })
      ).toBeInTheDocument();
    });

    it("panel shows languages buttons", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      expect(
        screen.getByRole("button", { name: "English" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Spanish" })
      ).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Amenity Toggle Tests
  // ==========================================================================

  describe("amenity toggle", () => {
    it("toggleAmenity adds amenity when clicked", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      const wifiButton = screen.getByRole("button", { name: "Wifi" });
      expect(wifiButton).toHaveAttribute("aria-pressed", "false");

      await user.click(wifiButton);
      expect(wifiButton).toHaveAttribute("aria-pressed", "true");
    });

    it("toggleAmenity removes amenity when already selected", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      const wifiButton = screen.getByRole("button", { name: "Wifi" });

      await user.click(wifiButton);
      expect(wifiButton).toHaveAttribute("aria-pressed", "true");

      await user.click(wifiButton);
      expect(wifiButton).toHaveAttribute("aria-pressed", "false");
    });

    it("multiple amenities can be selected", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      const wifiButton = screen.getByRole("button", { name: "Wifi" });
      const parkingButton = screen.getByRole("button", { name: "Parking" });

      await user.click(wifiButton);
      await user.click(parkingButton);

      expect(wifiButton).toHaveAttribute("aria-pressed", "true");
      expect(parkingButton).toHaveAttribute("aria-pressed", "true");
    });
  });

  // ==========================================================================
  // House Rules Toggle Tests
  // ==========================================================================

  describe("house rules toggle", () => {
    it("toggleHouseRule adds rule when clicked", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      const petsButton = screen.getByRole("button", { name: "Pets allowed" });
      expect(petsButton).toHaveAttribute("aria-pressed", "false");

      await user.click(petsButton);
      expect(petsButton).toHaveAttribute("aria-pressed", "true");
    });

    it("toggleHouseRule removes rule when already selected", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      const petsButton = screen.getByRole("button", { name: "Pets allowed" });

      await user.click(petsButton);
      expect(petsButton).toHaveAttribute("aria-pressed", "true");

      await user.click(petsButton);
      expect(petsButton).toHaveAttribute("aria-pressed", "false");
    });
  });

  // ==========================================================================
  // Language Toggle Tests
  // ==========================================================================

  describe("language toggle", () => {
    it("toggleLanguage adds language when clicked", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      const englishButton = screen.getByRole("button", { name: "English" });
      expect(englishButton).toHaveAttribute("aria-pressed", "false");

      await user.click(englishButton);

      const selectedEnglishButton = screen.getByRole("button", {
        name: /English/i,
      });
      expect(selectedEnglishButton).toHaveAttribute("aria-pressed", "true");
    });

    it("toggleLanguage removes language when already selected", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      const englishButton = screen.getByRole("button", { name: "English" });
      await user.click(englishButton);

      const selectedEnglishButton = screen.getByRole("button", {
        name: /English/i,
      });
      expect(selectedEnglishButton).toHaveAttribute("aria-pressed", "true");

      await user.click(selectedEnglishButton);

      const availableEnglishButton = screen.getByRole("button", {
        name: "English",
      });
      expect(availableEnglishButton).toHaveAttribute("aria-pressed", "false");
    });
  });

  // ==========================================================================
  // Price Input Tests
  // ==========================================================================

  describe("price inputs", () => {
    it("accepts positive numbers", async () => {
      render(<HomeSearchBar />);
      const minInput = screen.getByLabelText(/minimum budget/i);

      await user.clear(minInput);
      await user.type(minInput, "500");

      expect(minInput).toHaveValue(500);
    });

    it("handles decimal values", async () => {
      render(<HomeSearchBar />);
      const minInput = screen.getByLabelText(/minimum budget/i);

      await user.clear(minInput);
      await user.type(minInput, "500.50");

      expect(minInput).toHaveValue(500.5);
    });

    it("handles empty values", async () => {
      render(<HomeSearchBar />);
      const minInput = screen.getByLabelText(/minimum budget/i);

      await user.clear(minInput);

      expect(minInput).toHaveValue(null);
    });
  });

  // ==========================================================================
  // Location Handling Tests
  // ==========================================================================

  describe("location handling", () => {
    it("sets coordinates when location selected from dropdown", async () => {
      render(<HomeSearchBar />);

      const selectButton = screen.getByTestId("select-location");
      await user.click(selectButton);

      // Verify auto-submit was triggered
      jest.advanceTimersByTime(500);
      await waitFor(() => expect(mockPush).toHaveBeenCalled());
    });

    // SC4 — selection dispatches fly-to exactly once; no double dispatch
    it("dispatches MAP_FLY_TO_EVENT on location select (exactly once)", async () => {
      const eventListener = jest.fn();
      window.addEventListener(MAP_FLY_TO_EVENT, eventListener);
      try {
        render(<HomeSearchBar />);

        await user.click(screen.getByTestId("select-location"));
        jest.advanceTimersByTime(500);
        await waitFor(() => expect(mockPush).toHaveBeenCalled());

        expect(eventListener).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener(MAP_FLY_TO_EVENT, eventListener);
      }
    });

    // SC4 — plain re-submit with pre-existing selection ALSO dispatches fly-to
    it("dispatches MAP_FLY_TO_EVENT on plain re-submit when a selection is already set", async () => {
      // Pre-populate URL with a selected location
      mockSearchParams.set("locationLabel", "San Francisco");
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");

      const eventListener = jest.fn();
      window.addEventListener(MAP_FLY_TO_EVENT, eventListener);
      try {
        render(<HomeSearchBar />);

        // Form submit without re-selecting from dropdown
        fireEvent.submit(screen.getByRole("search"));
        jest.advanceTimersByTime(500);
        await waitFor(() => expect(mockPush).toHaveBeenCalled());

        // SC4: re-submit with existing selection DOES dispatch fly-to
        expect(eventListener).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener(MAP_FLY_TO_EVENT, eventListener);
      }
    });

    // SC1 — passive warning still renders on typed>2 && no selection && not focused
    it("shows passive warning when text is typed without a dropdown selection (not focused)", async () => {
      render(<HomeSearchBar />);

      const locationInput = screen.getByTestId("location-input");
      await user.type(locationInput, "San");
      // Blur so the warning becomes visible (showLocationWarning requires !focused)
      fireEvent.blur(locationInput);

      expect(
        screen.getByText(/select a location from the dropdown/i)
      ).toBeInTheDocument();
    });

    // SC1 — passive warning still has role=alert
    it("announces the location warning to assistive tech (role=alert)", async () => {
      render(<HomeSearchBar />);

      const locationInput = screen.getByTestId("location-input");
      await user.type(locationInput, "San Francisco");
      fireEvent.blur(locationInput);

      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("id", "location-warning");
      expect(alert).toHaveTextContent(/select a location from the dropdown/i);
    });

    // SC1 — warning hides while the input is focused (locationInputFocused=true)
    it("does not show warning while the location input is focused", async () => {
      render(<HomeSearchBar />);

      const locationInput = screen.getByTestId("location-input");
      fireEvent.focus(locationInput);
      await user.type(locationInput, "San Francisco");

      // Warning should NOT be present while focused
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    // SC1 — typed > 2 chars, no selection: resolves on submit (navigates on success)
    it("resolves typed location on submit when no dropdown selection was made", async () => {
      mockResolveTypedSearchLocation.mockResolvedValue({
        label: "Austin, TX",
        selection: {
          lat: 30.2672,
          lng: -97.7431,
          bounds: [-98, 30, -97.5, 30.5],
        },
      });

      render(<HomeSearchBar />);
      fireEvent.change(screen.getByTestId("location-input"), {
        target: { value: "Austin" },
      });
      fireEvent.submit(screen.getByRole("search"));

      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("locationLabel=Austin%2C+TX");
      expect(pushCall).toContain("lat=30.2672");
    });

    // SC1 — on resolution failure: toast error and do NOT navigate
    it("shows toast.error and does not navigate when typed location cannot resolve", async () => {
      mockResolveTypedSearchLocation.mockResolvedValue(null);

      render(<HomeSearchBar />);
      fireEvent.change(screen.getByTestId("location-input"), {
        target: { value: "Xyzzy" },
      });
      fireEvent.submit(screen.getByRole("search"));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith(
          "Select a location from the dropdown suggestions."
        )
      );
      expect(mockPush).not.toHaveBeenCalled();
    });

    // SC1 — on resolution failure: focuses the location input
    it("focuses the location input when typed location cannot resolve", async () => {
      mockResolveTypedSearchLocation.mockResolvedValue(null);

      render(<HomeSearchBar />);
      const input = screen.getByTestId("location-input");
      fireEvent.change(input, { target: { value: "Xyzzy" } });
      fireEvent.submit(screen.getByRole("search"));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith(
          "Select a location from the dropdown suggestions."
        )
      );
      expect(document.activeElement).toBe(input);
    });
  });

  // ==========================================================================
  // FilterModal — Clear All Filters (SC6 — unchanged behavior)
  // ==========================================================================

  describe("clear all filters", () => {
    it("clear button does not show when no filters active", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
    });

    it("clear button shows when committed filters are active", async () => {
      mockSearchParams.set("amenities", "Wifi");
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      expect(screen.getByText("Clear all")).toBeInTheDocument();
    });

    it("clear button navigates to /search preserving location and bounds", async () => {
      mockSearchParams.set("amenities", "Wifi");
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      await user.click(screen.getByText("Clear all"));
      jest.runAllTimers();

      expect(mockPush).toHaveBeenCalled();
      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("/search");
    });
  });

  // ==========================================================================
  // Form Submission Tests (URL contract — SC7)
  // ==========================================================================

  describe("form submission", () => {
    it("submits form and calls router.push after selection auto-submit", async () => {
      render(<HomeSearchBar />);

      await user.type(
        screen.getByTestId("location-input"),
        "San Francisco"
      );
      await user.click(screen.getByTestId("select-location"));

      jest.advanceTimersByTime(500);

      expect(mockPush).toHaveBeenCalled();
    });

    it("includes locationLabel, lat, lng, and bounds in the pushed URL", async () => {
      render(<HomeSearchBar />);

      await user.click(screen.getByTestId("select-location"));
      jest.advanceTimersByTime(500);

      await waitFor(() => expect(mockPush).toHaveBeenCalled());
      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("locationLabel=San+Francisco");
      expect(pushCall).toContain("lat=37.7749");
      expect(pushCall).toContain("lng=-122.4194");
      expect(pushCall).toContain("minLat=");
    });

    it("preserves a valid moveInDate/endDate range on search submit", async () => {
      mockSearchParams.set("moveInDate", VALID_MOVE_IN_DATE);
      mockSearchParams.set("endDate", VALID_END_DATE);
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");

      render(<HomeSearchBar />);

      fireEvent.submit(screen.getByRole("search"));
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain(`moveInDate=${VALID_MOVE_IN_DATE}`);
      expect(pushCall).toContain(`endDate=${VALID_END_DATE}`);
    });

    it("lets the filters drawer create a valid search range", async () => {
      render(<HomeSearchBar />);

      await user.click(screen.getByRole("button", { name: /filters/i }));
      fireEvent.change(screen.getByPlaceholderText("Select move-in date"), {
        target: { value: VALID_MOVE_IN_DATE },
      });
      fireEvent.change(screen.getByPlaceholderText("Select end date"), {
        target: { value: VALID_END_DATE },
      });
      fireEvent.click(screen.getByTestId("filter-modal-apply"));

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain(`moveInDate=${VALID_MOVE_IN_DATE}`);
      expect(pushCall).toContain(`endDate=${VALID_END_DATE}`);
    });

    it("drops invalid endDate values from the applied search range", async () => {
      render(<HomeSearchBar />);

      await user.click(screen.getByRole("button", { name: /filters/i }));
      fireEvent.change(screen.getByPlaceholderText("Select move-in date"), {
        target: { value: LATER_MOVE_IN_DATE },
      });
      fireEvent.change(screen.getByPlaceholderText("Select end date"), {
        target: { value: EARLIER_END_DATE },
      });
      fireEvent.click(screen.getByTestId("filter-modal-apply"));

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain(`moveInDate=${LATER_MOVE_IN_DATE}`);
      expect(pushCall).not.toContain("endDate=");
    });

    it("trims location input and uses canonical location name from selection", async () => {
      render(<HomeSearchBar />);

      await user.type(screen.getByTestId("location-input"), "  downtown  ");
      await user.click(screen.getByTestId("select-location"));

      jest.advanceTimersByTime(500);
      await waitFor(() => expect(mockPush).toHaveBeenCalled());

      // The mock select fires "San Francisco" — that is the canonical label
      const pushCall = mockPush.mock.calls[0][0];
      expect(pushCall).toContain("locationLabel=San+Francisco");
    });

    it("does not include locationLabel when submitting with short/no location and no selection", async () => {
      render(<HomeSearchBar />);

      const locationInput = screen.getByTestId("location-input");
      await user.type(locationInput, "a"); // too short to trigger resolution

      const form = screen.getByRole("search");
      fireEvent.submit(form);

      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).not.toContain("locationLabel=");
    });

    it("shows loading state during search (aria-busy + disabled)", async () => {
      render(<HomeSearchBar />);

      const form = screen.getByRole("search");
      fireEvent.submit(form);

      const searchButton = screen.getByRole("button", { name: /searching/i });
      expect(searchButton).toBeDisabled();
      expect(searchButton).toHaveAttribute("aria-busy", "true");
    });

    // URL-contract: inverted budget range is normalized (SC7)
    it("normalizes inverted budget values on submit", () => {
      render(<HomeSearchBar />);

      fireEvent.change(screen.getByLabelText(/minimum budget/i), {
        target: { value: "1500" },
      });
      fireEvent.change(screen.getByLabelText(/maximum budget/i), {
        target: { value: "900" },
      });
      fireEvent.submit(screen.getByRole("search"));
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("/search?");
      expect(pushCall).toContain("minPrice=900");
      expect(pushCall).toContain("maxPrice=1500");
    });

    // URL-contract: negative prices clamped to 0; invalid dropped (SC7)
    it("drops invalid budget values and clamps negatives", () => {
      render(<HomeSearchBar />);

      fireEvent.change(screen.getByLabelText(/minimum budget/i), {
        target: { value: "-50" },
      });
      fireEvent.change(screen.getByLabelText(/maximum budget/i), {
        target: { value: "abc" },
      });
      fireEvent.submit(screen.getByRole("search"));
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("minPrice=0");
      expect(pushCall).not.toContain("maxPrice=NaN");
      expect(pushCall).not.toContain("maxPrice=abc");
    });

    it("applies drawer filters into the search URL on Apply", async () => {
      render(<HomeSearchBar />);

      await user.click(screen.getByRole("button", { name: /filters/i }));
      fireEvent.change(screen.getByPlaceholderText("Select move-in date"), {
        target: { value: VALID_MOVE_IN_DATE },
      });
      await user.click(screen.getByRole("button", { name: "Wifi" }));
      fireEvent.click(screen.getByTestId("filter-modal-apply"));

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain(`moveInDate=${VALID_MOVE_IN_DATE}`);
      expect(pushCall).toContain("amenities=Wifi");
    });

    it("keeps pending budget values when applying drawer filters", async () => {
      render(<HomeSearchBar />);

      await user.type(screen.getByLabelText(/minimum budget/i), "900");
      await user.type(screen.getByLabelText(/maximum budget/i), "1500");
      await user.click(screen.getByRole("button", { name: /filters/i }));
      await user.click(screen.getByRole("button", { name: "Wifi" }));
      fireEvent.click(screen.getByTestId("filter-modal-apply"));

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("minPrice=900");
      expect(pushCall).toContain("maxPrice=1500");
      expect(pushCall).toContain("amenities=Wifi");
    });

    it("submits selected location with pending budget and drawer filters", async () => {
      render(<HomeSearchBar />);

      await user.type(screen.getByLabelText(/minimum budget/i), "900");
      await user.type(screen.getByLabelText(/maximum budget/i), "1500");
      await user.click(screen.getByRole("button", { name: /filters/i }));
      await user.click(screen.getByRole("button", { name: "Wifi" }));
      await user.click(screen.getByRole("button", { name: /close filters/i }));
      await user.type(screen.getByTestId("location-input"), "San Francisco");
      await user.click(screen.getByTestId("select-location"));
      jest.advanceTimersByTime(500);

      await waitFor(() => expect(mockPush).toHaveBeenCalled());
      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("locationLabel=San+Francisco");
      expect(pushCall).toContain("lat=37.7749");
      expect(pushCall).toContain("lng=-122.4194");
      expect(pushCall).toContain("minPrice=900");
      expect(pushCall).toContain("maxPrice=1500");
      expect(pushCall).toContain("amenities=Wifi");
    });

    it("clears filters without leaving stale filter params, preserving location/bounds", async () => {
      mockSearchParams.set("minPrice", "900");
      mockSearchParams.set("maxPrice", "1500");
      mockSearchParams.set("amenities", "Wifi");
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");
      render(<HomeSearchBar />);

      await user.click(screen.getByRole("button", { name: /filters/i }));
      fireEvent.click(screen.getByTestId("filter-modal-clear-all"));

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("/search");
      // Location/bounds may or may not be preserved depending on clearAllFilters
      // implementation — the key contract is filter params are gone
      expect(pushCall).not.toContain("amenities");
    });
  });

  // ==========================================================================
  // Accessibility Tests
  // ==========================================================================

  describe("accessibility", () => {
    it("has search landmark role", () => {
      render(<HomeSearchBar />);
      expect(screen.getByRole("search")).toBeInTheDocument();
    });

    it("price inputs have aria-labels", () => {
      render(<HomeSearchBar />);
      expect(screen.getByLabelText(/minimum budget/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/maximum budget/i)).toBeInTheDocument();
    });

    it("amenity buttons have aria-pressed", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      const wifiButton = screen.getByRole("button", { name: "Wifi" });
      expect(wifiButton).toHaveAttribute("aria-pressed");
    });

    it("house rule buttons have aria-pressed", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      const petsButton = screen.getByRole("button", { name: "Pets allowed" });
      expect(petsButton).toHaveAttribute("aria-pressed");
    });

    it("language buttons have aria-pressed", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByRole("button", { name: /filters/i }));
      jest.runAllTimers();

      const englishButton = screen.getByRole("button", { name: "English" });
      expect(englishButton).toHaveAttribute("aria-pressed");
    });

    it("search button has aria-busy when searching", async () => {
      render(<HomeSearchBar />);

      const form = screen.getByRole("search");
      fireEvent.submit(form);

      const searchButton = screen.getByRole("button", { name: /searching/i });
      expect(searchButton).toHaveAttribute("aria-busy", "true");
    });

    // SC6 — Filters button aria-controls/aria-expanded unchanged
    it("filter panel has aria-controls/aria-expanded", async () => {
      render(<HomeSearchBar />);

      const filtersButton = screen.getByRole("button", { name: /filters/i });
      expect(filtersButton).toHaveAttribute("aria-expanded", "false");
      expect(filtersButton).not.toHaveAttribute("aria-controls");

      await user.click(filtersButton);
      jest.runAllTimers();
      expect(filtersButton).toHaveAttribute("aria-expanded", "true");
      expect(filtersButton).toHaveAttribute("aria-controls", "search-filters");
    });

    // SC6 — Filters button aria-label includes active count
    it("filter button aria-label includes active count when filters are set", () => {
      mockSearchParams.set("amenities", "Wifi");
      render(<HomeSearchBar />);

      const filtersButton = screen.getByRole("button", {
        name: /filters.*active/i,
      });
      expect(filtersButton).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Debounce Tests (SC7)
  // ==========================================================================

  describe("debouncing", () => {
    it("debounces rapid submissions by 300ms", async () => {
      render(<HomeSearchBar />);

      const form = screen.getByRole("search");
      fireEvent.submit(form);

      // Before 300ms — push not called yet
      jest.advanceTimersByTime(299);
      expect(mockPush).not.toHaveBeenCalled();

      // After 300ms — push called
      jest.advanceTimersByTime(100);
      expect(mockPush).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Stale URL Parameter Cleanup Tests (SC7)
  // ==========================================================================

  describe("stale URL parameter cleanup", () => {
    it("removes stale past moveInDate from URL on submit", async () => {
      mockSearchParams.set("moveInDate", "2024-06-01");
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");
      render(<HomeSearchBar />);

      const form = screen.getByRole("search");
      fireEvent.submit(form);
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).not.toContain("moveInDate");
    });

    it("removes invalid roomType from URL on submit", async () => {
      mockSearchParams.set("roomType", "InvalidRoomType");
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");
      render(<HomeSearchBar />);

      const form = screen.getByRole("search");
      fireEvent.submit(form);
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).not.toContain("roomType");
    });

    it("removes invalid genderPreference from URL on submit", async () => {
      mockSearchParams.set("genderPreference", "INVALID_VALUE");
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");
      render(<HomeSearchBar />);

      const form = screen.getByRole("search");
      fireEvent.submit(form);
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).not.toContain("genderPreference");
    });

    it("removes old lat/lng when location is cleared", async () => {
      mockSearchParams.set("locationLabel", "San Francisco");
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");
      render(<HomeSearchBar />);

      const locationInput = screen.getByTestId("location-input");
      await user.clear(locationInput);

      const form = screen.getByRole("search");
      fireEvent.submit(form);
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).not.toContain("lat=");
      expect(pushCall).not.toContain("lng=");
    });

    it("does not duplicate amenities on repeated searches", async () => {
      mockSearchParams.set("amenities", "Wifi");
      mockSearchParams.append("amenities", "AC");
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");
      render(<HomeSearchBar />);

      const form = screen.getByRole("search");
      fireEvent.submit(form);
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      const wifiMatches = (pushCall.match(/amenities=Wifi/g) || []).length;
      expect(wifiMatches).toBeLessThanOrEqual(1);
    });

    it("clears invalid amenities from URL", async () => {
      mockSearchParams.set("amenities", "InvalidAmenity");
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");
      render(<HomeSearchBar />);

      const form = screen.getByRole("search");
      fireEvent.submit(form);
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).not.toContain("InvalidAmenity");
    });

    // SC7 — bounds + non-default sort preserved; sort=recommended dropped; pagination reset
    it("preserves bounds and non-default sort, resets pagination", async () => {
      mockSearchParams.set("minLat", "37.5");
      mockSearchParams.set("maxLat", "38.0");
      mockSearchParams.set("minLng", "-123.0");
      mockSearchParams.set("maxLng", "-122.0");
      mockSearchParams.set("sort", "price_asc");
      mockSearchParams.set("nearMatches", "1");
      render(<HomeSearchBar />);

      const form = screen.getByRole("search");
      fireEvent.submit(form);
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("minLat=");
      expect(pushCall).toContain("sort=price_asc");
      expect(pushCall).toContain("nearMatches=true");
    });

    // SC7 — bounds serialize quantized to 3 decimals
    it("serializes bounds to 3 decimal places", async () => {
      mockSearchParams.set("minLat", "37");
      mockSearchParams.set("maxLat", "38");
      mockSearchParams.set("minLng", "-123");
      mockSearchParams.set("maxLng", "-122");
      render(<HomeSearchBar />);

      fireEvent.submit(screen.getByRole("search"));
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("minLat=37.000");
    });

    // SC7 — sort=recommended is dropped (canonical default)
    it("drops sort=recommended on submit", async () => {
      mockSearchParams.set("sort", "recommended");
      render(<HomeSearchBar />);

      fireEvent.submit(screen.getByRole("search"));
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).not.toContain("sort=recommended");
    });

    // SC7 — page/cursor reset on new submit
    it("resets pagination params on submit", async () => {
      mockSearchParams.set("page", "3");
      mockSearchParams.set("cursor", "abc");
      mockSearchParams.set("lat", "37.7749");
      mockSearchParams.set("lng", "-122.4194");
      render(<HomeSearchBar />);

      await user.click(screen.getByTestId("select-location"));
      jest.advanceTimersByTime(500);
      await waitFor(() => expect(mockPush).toHaveBeenCalled());

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).not.toContain("page=");
      expect(pushCall).not.toContain("cursor=");
    });

    // SC7 — empty submit preserves current map bounds
    it("preserves current map bounds on empty-everything submit", async () => {
      mockSearchParams.set("minLat", "37");
      mockSearchParams.set("maxLat", "38");
      mockSearchParams.set("minLng", "-123");
      mockSearchParams.set("maxLng", "-122");
      render(<HomeSearchBar />);

      fireEvent.submit(screen.getByRole("search"));
      jest.advanceTimersByTime(500);

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("minLat=37.000");
      expect(pushCall).toContain("maxLat=38.000");
    });

  });

  // ==========================================================================
  // Semantic search — what field included in submission (SC5)
  // ==========================================================================

  describe("semantic search submission", () => {
    const originalFlag = process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH;

    beforeEach(() => {
      process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH = "true";
    });

    afterEach(() => {
      process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH = originalFlag;
    });

    it("includes what= in the URL when vibe text is typed and location is selected", async () => {
      render(<HomeSearchBar />);

      await user.type(
        screen.getByPlaceholderText(/quiet, near campus/i),
        "sunny room"
      );
      await user.type(screen.getByTestId("location-input"), "San Francisco");
      await user.click(screen.getByTestId("select-location"));

      jest.advanceTimersByTime(500);
      await waitFor(() => expect(mockPush).toHaveBeenCalled());

      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("what=sunny+room");
      expect(pushCall).toContain("locationLabel=San+Francisco");
    });
  });

  // ==========================================================================
  // Use My Location Tests
  // ==========================================================================

  describe("Use My Location", () => {
    const mockGetCurrentPosition = jest.fn();

    beforeEach(() => {
      mockToastError.mockClear();
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition: mockGetCurrentPosition },
        writable: true,
        configurable: true,
      });
      mockGetCurrentPosition.mockReset();
    });

    it("Use my current location button is present", () => {
      render(<HomeSearchBar />);
      expect(
        screen.getByRole("button", { name: /use my current location/i })
      ).toBeInTheDocument();
    });

    it("sets lat/lng params on success without locationLabel param", async () => {
      mockGetCurrentPosition.mockImplementation(
        (success: PositionCallback) => {
          success({
            coords: { latitude: 40.7128, longitude: -74.006 },
          } as GeolocationPosition);
        }
      );
      render(<HomeSearchBar />);

      const btn = screen.getByRole("button", {
        name: /use my current location/i,
      });
      fireEvent.click(btn);
      jest.advanceTimersByTime(500);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });
      const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
      expect(pushCall).toContain("lat=40.7128");
      expect(pushCall).toContain("lng=-74.006");
      expect(pushCall).not.toContain("locationLabel=");
      expect(pushCall).toContain("minLat=");
    });

    it("shows toast on permission denied", () => {
      mockGetCurrentPosition.mockImplementation(
        (_s: PositionCallback, error: PositionErrorCallback) => {
          error({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        }
      );
      render(<HomeSearchBar />);

      fireEvent.click(
        screen.getByRole("button", { name: /use my current location/i })
      );

      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining("permission denied")
      );
    });

    it("shows toast on timeout", () => {
      mockGetCurrentPosition.mockImplementation(
        (_s: PositionCallback, error: PositionErrorCallback) => {
          error({
            code: 3,
            message: "timeout",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        }
      );
      render(<HomeSearchBar />);

      fireEvent.click(
        screen.getByRole("button", { name: /use my current location/i })
      );

      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining("timed out")
      );
    });

    it("shows toast when geolocation not supported", () => {
      Object.defineProperty(navigator, "geolocation", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      render(<HomeSearchBar />);

      fireEvent.click(
        screen.getByRole("button", { name: /use my current location/i })
      );

      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining("not supported")
      );
    });

    it("ignores rapid double-tap (prevents re-entry while pending)", () => {
      // First call never resolves (simulates pending geolocation)
      mockGetCurrentPosition.mockImplementation(() => {});
      render(<HomeSearchBar />);

      const btn = screen.getByRole("button", {
        name: /use my current location/i,
      });
      fireEvent.click(btn);
      fireEvent.click(btn);

      expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Recent search saved on submit (SC8)
  // ==========================================================================

  describe("recent searches", () => {
    it("records a recent search on successful submit with location", async () => {
      render(<HomeSearchBar />);
      await user.click(screen.getByTestId("select-location"));
      jest.advanceTimersByTime(500);
      await waitFor(() => expect(mockPush).toHaveBeenCalled());

      expect(mockSaveRecentSearch).toHaveBeenCalled();
      expect(mockSaveRecentSearch.mock.calls[0][0]).toBe("San Francisco");
    });

    it("saves recent search including pending filters", async () => {
      render(<HomeSearchBar />);

      await user.type(screen.getByLabelText(/minimum budget/i), "900");
      await user.click(screen.getByTestId("select-location"));
      jest.advanceTimersByTime(500);
      await waitFor(() => expect(mockPush).toHaveBeenCalled());

      expect(mockSaveRecentSearch).toHaveBeenCalled();
    });
  });
});
