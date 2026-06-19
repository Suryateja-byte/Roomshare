import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchViewToggle from "@/components/SearchViewToggle";

let matchMediaMatches = true;
let mockSearchParams = new URLSearchParams();
const mockSetMobileResultsView = jest.fn();
let mockMobileSearchState = {
  mobileMapOverlayActive: false,
  searchResultsLabel: "486 homes",
  mobileSheetOverrideLabel: null as string | null,
  mobileResultsViewPreference: null as "map" | "peek" | "list" | null,
  setMobileResultsView: mockSetMobileResultsView,
};

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/contexts/MobileSearchContext", () => ({
  useMobileSearch: () => mockMobileSearchState,
}));

beforeEach(() => {
  matchMediaMatches = true;
  mockSearchParams = new URLSearchParams();
  mockSetMobileResultsView.mockReset();
  mockMobileSearchState = {
    mobileMapOverlayActive: false,
    searchResultsLabel: "486 homes",
    mobileSheetOverrideLabel: null,
    mobileResultsViewPreference: null,
    setMobileResultsView: mockSetMobileResultsView,
  };
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: matchMediaMatches,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

jest.mock("@/contexts/ListingFocusContext", () => ({
  useListingFocus: () => ({ activeId: null }),
}));

jest.mock("@/components/search/MobileBottomSheet", () => {
  return function MockSheet({
    children,
    headerText,
    snapIndex,
    onSnapChange,
  }: {
    children: React.ReactNode;
    headerText?: string;
    snapIndex: number;
    onSnapChange: (snapIndex: number) => void;
  }) {
    return (
      <div data-testid="mobile-bottom-sheet" data-snap-index={snapIndex}>
        <div data-testid="mobile-sheet-header">{headerText}</div>
        <button
          type="button"
          data-testid="expand-mobile-sheet"
          onClick={() => onSnapChange(2)}
        >
          Expand
        </button>
        <button
          type="button"
          data-testid="peek-mobile-sheet"
          onClick={() => onSnapChange(1)}
        >
          Peek
        </button>
        {children}
      </div>
    );
  };
});

jest.mock("@/components/search/FloatingMapButton", () => {
  return function MockBtn({
    isListMode,
    onToggle,
  }: {
    isListMode: boolean;
    onToggle: () => void;
  }) {
    return (
      <button
        type="button"
        data-testid="floating-btn"
        data-is-list-mode={isListMode ? "true" : "false"}
        onClick={onToggle}
      >
        Toggle
      </button>
    );
  };
});

const props = {
  mapComponent: <div data-testid="map">Map</div>,
  shouldShowMap: true,
  canShowMap: true,
  onToggle: jest.fn(),
  isLoading: false,
};

function TestChild() {
  return <div data-testid="child-instance">Child</div>;
}

describe("SearchViewToggle", () => {
  it("renders children exactly once on desktop", () => {
    matchMediaMatches = true;
    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );
    expect(screen.getAllByTestId("child-instance")).toHaveLength(1);
  });

  it("renders children exactly once on mobile", () => {
    matchMediaMatches = false;
    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );
    expect(screen.getAllByTestId("child-instance")).toHaveLength(1);
  });

  it("starts with the mobile sheet in peek mode", () => {
    matchMediaMatches = false;
    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    expect(screen.getByTestId("mobile-bottom-sheet")).toHaveAttribute(
      "data-snap-index",
      "1"
    );
  });

  it('publishes "peek" view when the mobile sheet starts in preview mode', async () => {
    matchMediaMatches = false;
    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    await waitFor(() => {
      expect(mockSetMobileResultsView).toHaveBeenLastCalledWith("peek");
    });
  });

  it('publishes "list" view when the mobile sheet expands', async () => {
    matchMediaMatches = false;
    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    fireEvent.click(screen.getByTestId("expand-mobile-sheet"));

    await waitFor(() => {
      expect(mockSetMobileResultsView).toHaveBeenLastCalledWith("list");
    });
  });

  it("prefers the mobile sheet override label when present", () => {
    matchMediaMatches = false;
    mockMobileSearchState.mobileSheetOverrideLabel = "No places in this area";

    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    expect(screen.getByTestId("mobile-sheet-header")).toHaveTextContent(
      "No places in this area"
    );
  });

  it("preserves the mobile sheet mode when filter params change", async () => {
    matchMediaMatches = false;
    mockSearchParams = new URLSearchParams("where=Dallas");

    const { rerender } = render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    fireEvent.click(screen.getByTestId("expand-mobile-sheet"));
    expect(screen.getByTestId("mobile-bottom-sheet")).toHaveAttribute(
      "data-snap-index",
      "2"
    );

    mockSearchParams = new URLSearchParams("where=Dallas&minPrice=1000");
    rerender(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    await waitFor(() => {
      expect(screen.getByTestId("mobile-bottom-sheet")).toHaveAttribute(
        "data-snap-index",
        "2"
      );
    });
  });

  it("collapses to map mode when the mobile preference requests it", async () => {
    matchMediaMatches = false;
    mockMobileSearchState.mobileResultsViewPreference = "map";

    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    await waitFor(() => {
      expect(screen.getByTestId("mobile-bottom-sheet")).toHaveAttribute(
        "data-snap-index",
        "0"
      );
    });
  });

  it("does not re-clamp the sheet collapsed while the map preference persists (one-shot)", async () => {
    // Audit #6: while the map viewport is empty, Map.tsx keeps
    // mobileResultsViewPreference="map" for the entire empty-viewport duration.
    // The initial collapse must still apply once, but subsequent user drags must
    // NOT be re-clamped back to collapsed.
    matchMediaMatches = false;
    mockMobileSearchState.mobileResultsViewPreference = "map";

    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    // One-shot: initial collapse to map mode (snap 0) still fires.
    await waitFor(() => {
      expect(screen.getByTestId("mobile-bottom-sheet")).toHaveAttribute(
        "data-snap-index",
        "0"
      );
    });

    // The preference is still "map" (empty viewport persists). The user drags the
    // sheet up to read results.
    fireEvent.click(screen.getByTestId("expand-mobile-sheet"));

    // The sheet must stay open (snap 2), not snap back to collapsed.
    await waitFor(() => {
      expect(screen.getByTestId("mobile-bottom-sheet")).toHaveAttribute(
        "data-snap-index",
        "2"
      );
    });
    expect(screen.getByTestId("mobile-bottom-sheet")).toHaveAttribute(
      "data-snap-index",
      "2"
    );

    // A second drag (to peek) is likewise honored, confirming no persistent clamp.
    fireEvent.click(screen.getByTestId("peek-mobile-sheet"));
    await waitFor(() => {
      expect(screen.getByTestId("mobile-bottom-sheet")).toHaveAttribute(
        "data-snap-index",
        "1"
      );
    });
  });

  it("hides the floating toggle while a mobile map overlay is active", () => {
    matchMediaMatches = false;
    mockMobileSearchState.mobileMapOverlayActive = true;

    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    expect(screen.queryByTestId("floating-btn")).not.toBeInTheDocument();
  });

  it("uses the floating toggle to switch between map and peek states", async () => {
    matchMediaMatches = false;

    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    fireEvent.click(screen.getByTestId("floating-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("mobile-bottom-sheet")).toHaveAttribute(
        "data-snap-index",
        "0"
      );
    });

    fireEvent.click(screen.getByTestId("floating-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("mobile-bottom-sheet")).toHaveAttribute(
        "data-snap-index",
        "1"
      );
    });
  });

  it("renders N children once each, not 2N", () => {
    matchMediaMatches = true;
    render(
      <SearchViewToggle {...props}>
        <div data-testid="card">A</div>
        <div data-testid="card">B</div>
        <div data-testid="card">C</div>
      </SearchViewToggle>
    );
    expect(screen.getAllByTestId("card")).toHaveLength(3);
  });

  it('publishes "list" view on desktop', async () => {
    matchMediaMatches = true;
    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    await waitFor(() => {
      expect(mockSetMobileResultsView).toHaveBeenLastCalledWith("list");
    });
  });

  it("uses an inner desktop scroll region instead of scrolling the split-view shell", () => {
    matchMediaMatches = true;
    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    const shell = screen.getByTestId("search-results-container");
    const scrollRegion = screen.getByTestId(
      "desktop-search-results-scroll-area"
    );

    expect(shell).toHaveClass("overflow-hidden");
    expect(shell).not.toHaveClass("overflow-y-auto");
    expect(scrollRegion).toHaveClass("desktop-search-results-scroll");
    expect(scrollRegion).toHaveAttribute(
      "data-search-results-scroll-region",
      "desktop"
    );
  });

  it("shows desktop overflow fades when the results pane can scroll", () => {
    matchMediaMatches = true;
    render(
      <SearchViewToggle {...props}>
        <TestChild />
      </SearchViewToggle>
    );

    const scrollRegion = screen.getByTestId(
      "desktop-search-results-scroll-area"
    );

    Object.defineProperty(scrollRegion, "clientHeight", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(scrollRegion, "scrollHeight", {
      configurable: true,
      value: 960,
    });
    Object.defineProperty(scrollRegion, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });

    fireEvent.scroll(scrollRegion);

    expect(
      screen.queryByTestId("desktop-results-top-fade")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("desktop-results-bottom-fade")).toBeInTheDocument();

    Object.defineProperty(scrollRegion, "scrollTop", {
      configurable: true,
      writable: true,
      value: 120,
    });

    fireEvent.scroll(scrollRegion);

    expect(screen.getByTestId("desktop-results-top-fade")).toBeInTheDocument();
  });

  it("reserves the desktop split layout via CSS before hydration so it does not reflow", () => {
    matchMediaMatches = true;
    // Pre-hydration props from useMapPreference: isLoading=true and the
    // visibility flags still false. The layout must already reserve the split.
    render(
      <SearchViewToggle
        {...props}
        isLoading={true}
        shouldShowMap={false}
        canShowMap={false}
      >
        <TestChild />
      </SearchViewToggle>
    );

    const shell = screen.getByTestId("search-results-container");
    // Split width is reserved via the xl: CSS breakpoint (no JS-driven width flip).
    expect(shell.className).toContain("xl:w-[55%]");
    // The map pane occupies its space from the first paint (content mounts later).
    expect(screen.getByTestId("desktop-search-map-panel")).toBeInTheDocument();
  });

  it("collapses the desktop list to full width only once the user has hidden the map", () => {
    matchMediaMatches = true;
    // Hydrated (isLoading=false), split-capable (canShowMap), but preference is
    // list-only (shouldShowMap=false) → the map is intentionally hidden.
    render(
      <SearchViewToggle
        {...props}
        isLoading={false}
        shouldShowMap={false}
        canShowMap={true}
      >
        <TestChild />
      </SearchViewToggle>
    );

    const shell = screen.getByTestId("search-results-container");
    expect(shell.className).toContain("w-full");
    expect(shell.className).not.toContain("xl:w-[55%]");
    expect(
      screen.queryByTestId("desktop-search-map-panel")
    ).not.toBeInTheDocument();
  });
});
