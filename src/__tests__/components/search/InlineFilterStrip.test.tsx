import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { InlineFilterStrip } from "@/components/search/InlineFilterStrip";
import { emptyFilterValues } from "@/hooks/useBatchedFilters";

const mockRouterPush = jest.fn();
const mockRegisterOpenFilters = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockMobileResultsView: "map" | "peek" | "list" = "list";
const mockSetPending = jest.fn();
const mockReset = jest.fn();
const mockCommit = jest.fn();
const mockUseMediaQuery = jest.fn();

const mockPending = { ...emptyFilterValues };
const mockCommitted = { ...emptyFilterValues };

function futureDateInput(daysFromNow: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(dateInput: string, includeYear = false): string {
  return new Date(`${dateInput}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
  });
}

const FILTER_MOVE_IN_DATE = futureDateInput(30);

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/contexts/SearchTransitionContext", () => ({
  useSearchTransitionSafe: () => null,
}));

jest.mock("@/contexts/MobileSearchContext", () => ({
  useMobileSearch: () => ({
    mobileResultsView: mockMobileResultsView,
    registerOpenFilters: mockRegisterOpenFilters,
  }),
}));

jest.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

jest.mock("@/hooks/useBatchedFilters", () => {
  const actual = jest.requireActual("@/hooks/useBatchedFilters");
  return {
    ...actual,
    useBatchedFilters: () => ({
      pending: mockPending,
      committed: mockCommitted,
      isDirty: false,
      setPending: mockSetPending,
      reset: mockReset,
      commit: mockCommit,
    }),
  };
});

jest.mock("@/hooks/useFacets", () => ({
  useFacets: () => ({
    facets: {
      priceRanges: { min: 0, max: 5000 },
      priceHistogram: { buckets: [] },
      roomTypes: {},
      amenities: {},
      houseRules: {},
    },
  }),
}));

jest.mock("@/hooks/useDebouncedFilterCount", () => ({
  useDebouncedFilterCount: () => ({
    formattedCount: "Show 24",
    isLoading: false,
    boundsRequired: false,
    count: 24,
  }),
}));

jest.mock("@/components/search/FilterModal", () => ({
  __esModule: true,
  default: ({
    isOpen,
    endDate,
    onEndDateChange,
    minEndDate,
  }: {
    isOpen: boolean;
    endDate?: string;
    onEndDateChange?: (value: string) => void;
    minEndDate?: string;
  }) =>
    isOpen ? (
      <div data-testid="filter-modal">
        Filters modal
        {/* Mirror FilterModal's showEndDateField = Boolean(onEndDateChange) gate */}
        {onEndDateChange ? (
          <div data-testid="filter-modal-end-date" data-min-end-date={minEndDate}>
            <span data-testid="filter-modal-end-date-value">{endDate}</span>
            <button
              type="button"
              data-testid="filter-modal-end-date-clear"
              onClick={() => onEndDateChange("")}
            >
              Clear end date
            </button>
          </div>
        ) : null}
      </div>
    ) : null,
}));

jest.mock("@/components/search/PriceRangeFilter", () => ({
  PriceRangeFilter: () => (
    <div data-testid="price-range-filter">Price range filter</div>
  ),
}));

jest.mock("@radix-ui/react-popover", () => {
  const React = require("react");
  type PopoverContextValue = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
  const PopoverContext = React.createContext(null as PopoverContextValue | null);

  return {
    Root: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) => (
      <PopoverContext.Provider value={{ open, onOpenChange }}>
        {children}
      </PopoverContext.Provider>
    ),
    Trigger: ({
      children,
      asChild,
    }: {
      children: React.ReactElement;
      asChild?: boolean;
    }) => {
      const context = React.useContext(PopoverContext);

      if (asChild && React.isValidElement(children)) {
        const triggerChild = children as React.ReactElement<{
          onClick?: (event: React.MouseEvent<HTMLElement>) => void;
        }>;
        return React.cloneElement(children, {
          onClick: (event: React.MouseEvent<HTMLElement>) => {
            triggerChild.props.onClick?.(event);
            context?.onOpenChange(!context.open);
          },
        });
      }

      return (
        <button
          type="button"
          onClick={() => context?.onOpenChange(!context.open)}
        >
          {children}
        </button>
      );
    },
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Content: ({
      children,
      className,
      "data-testid": testId,
    }: {
      children: React.ReactNode;
      className?: string;
      "data-testid"?: string;
    }) => {
      const context = React.useContext(PopoverContext);
      if (!context?.open) return null;
      return (
        <div className={className} data-testid={testId}>
          {children}
        </div>
      );
    },
  };
});

describe("InlineFilterStrip", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockMobileResultsView = "list";
    Object.assign(mockPending, emptyFilterValues);
    Object.assign(mockCommitted, emptyFilterValues);
    mockUseMediaQuery.mockImplementation((query: string) =>
      query === "(min-width: 768px)" ? true : undefined
    );
  });

  it("opens the price quick filter on desktop without opening the full drawer", () => {
    render(<InlineFilterStrip />);

    fireEvent.click(screen.getByTestId("quick-filter-price"));

    expect(screen.getByTestId("quick-filter-price-popover")).toBeInTheDocument();
    expect(screen.queryByTestId("filter-modal")).not.toBeInTheDocument();
  });

  it("opens the advanced filter drawer from the desktop Filters button", () => {
    render(<InlineFilterStrip />);

    fireEvent.click(screen.getByTestId("quick-filter-more-filters"));

    expect(screen.getByTestId("filter-modal")).toBeInTheDocument();
  });

  it("renders an End Date control in the results drawer when a move-in date is set, and clears it", () => {
    // Regression for audit #1: InlineFilterStrip must pass endDate/onEndDateChange/
    // minEndDate to FilterModal so the End Date field renders, is visible, and is
    // individually clearable on the /search results page (not just via "Clear all").
    const endDate = futureDateInput(45);
    Object.assign(mockPending, {
      moveInDate: FILTER_MOVE_IN_DATE,
      endDate,
    });

    render(<InlineFilterStrip />);

    fireEvent.click(screen.getByTestId("quick-filter-more-filters"));

    // End Date field renders (gated on onEndDateChange being passed)
    const endDateField = screen.getByTestId("filter-modal-end-date");
    expect(endDateField).toBeInTheDocument();
    // The current endDate value flows through
    expect(screen.getByTestId("filter-modal-end-date-value")).toHaveTextContent(
      endDate
    );
    // minEndDate is the pending move-in date (mirrors HomeSearchBar wiring)
    expect(endDateField).toHaveAttribute("data-min-end-date", FILTER_MOVE_IN_DATE);

    // Clearing the End Date field updates pending without wiping other filters
    fireEvent.click(screen.getByTestId("filter-modal-end-date-clear"));
    expect(mockSetPending).toHaveBeenCalledWith({ endDate: "" });
  });

  it("commits room type immediately from the desktop quick filter", () => {
    render(<InlineFilterStrip />);

    fireEvent.click(screen.getByTestId("quick-filter-room-type"));
    fireEvent.click(screen.getByRole("button", { name: "Private Room" }));

    expect(mockCommit).toHaveBeenCalledWith({ roomType: "Private Room" });
    expect(screen.queryByTestId("quick-filter-room-type-popover")).not.toBeInTheDocument();
    expect(screen.queryByTestId("filter-modal")).not.toBeInTheDocument();
  });

  it("uses the themed date picker for the desktop move-in quick filter", () => {
    const today = new Date().toLocaleDateString("en-CA");

    render(<InlineFilterStrip />);

    fireEvent.click(screen.getByTestId("quick-filter-move-in"));

    const popover = screen.getByTestId("quick-filter-move-in-popover");
    expect(popover.querySelector('input[type="date"]')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /select move-in date/i })
    );
    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(mockCommit).toHaveBeenCalledWith({ moveInDate: today });
    expect(
      screen.queryByTestId("quick-filter-move-in-popover")
    ).not.toBeInTheDocument();
  });

  it("renders the desktop summary row and toolbar slot when provided", () => {
    render(
      <InlineFilterStrip
        desktopSummary={{
          total: 24,
          visibleCount: 12,
          locationLabel: "Dallas",
          browseMode: true,
        }}
        toolbarSlot={<div data-testid="toolbar-slot">Toolbar</div>}
      />
    );

    expect(
      screen.getByTestId("desktop-results-heading-section")
    ).toBeInTheDocument();
    const heading = screen.getByRole("heading", {
      name: "24 places in Dallas",
    });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveClass("focus:outline-none");
    expect(heading.className).not.toMatch(/focus-visible:ring/);
    expect(heading.className).not.toMatch(/focus-visible:rounded/);
    expect(heading.className).not.toMatch(/focus-visible:ring-offset/);
    expect(screen.getByText(/showing top listings/i)).toBeInTheDocument();
    expect(screen.getByText(/1–12/)).toBeInTheDocument();
    expect(screen.getByTestId("toolbar-slot")).toBeInTheDocument();
  });

  it("renders desktop applied filters in a separate wrapping row", () => {
    mockSearchParams = new URLSearchParams(
      `minPrice=1200&maxPrice=1800&roomType=Private+Room`
    );

    render(<InlineFilterStrip />);

    expect(
      screen.getByTestId("desktop-applied-filters-row")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("inline-applied-filters-row")
    ).not.toBeInTheDocument();
    expect(screen.getByText("$1,200 - $1,800")).toBeInTheDocument();
  });

  it("renders applied filters before media-query hydration resolves", () => {
    mockUseMediaQuery.mockReturnValue(undefined);
    mockSearchParams = new URLSearchParams("minPrice=500&maxPrice=2000");

    render(<InlineFilterStrip />);

    expect(screen.getByTestId("desktop-applied-filters-row")).toBeInTheDocument();
    expect(screen.getByText("$500 - $2,000")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove filter: $500 - $2,000" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("quick-filter-more-filters")).toBeInTheDocument();
  });

  it("keeps the mobile strip on the full drawer flow", () => {
    mockUseMediaQuery.mockReturnValue(false);
    mockMobileResultsView = "list";

    render(<InlineFilterStrip />);

    fireEvent.click(screen.getByTestId("mobile-filter-price"));

    expect(screen.getByTestId("filter-modal")).toBeInTheDocument();
  });

  it('hides the mobile quick filters in "map" view', () => {
    mockUseMediaQuery.mockReturnValue(false);
    mockMobileResultsView = "map";

    render(<InlineFilterStrip />);

    expect(screen.queryByTestId("mobile-filter-price")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-filter-move-in")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-filter-room-type")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-filter-button")).not.toBeInTheDocument();
  });

  it('hides the mobile quick filters in "peek" view', () => {
    mockUseMediaQuery.mockReturnValue(false);
    mockMobileResultsView = "peek";

    render(<InlineFilterStrip />);

    expect(screen.queryByTestId("mobile-filter-price")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-filter-move-in")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-filter-room-type")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-filter-button")).not.toBeInTheDocument();
  });

  it("shows selected values in mobile quick filters", () => {
    mockUseMediaQuery.mockReturnValue(false);
    mockMobileResultsView = "list";
    Object.assign(mockCommitted, {
      minPrice: "1200",
      maxPrice: "1800",
      moveInDate: FILTER_MOVE_IN_DATE,
      roomType: "Private Room",
    });
    mockSearchParams = new URLSearchParams(
      `minPrice=1200&maxPrice=1800&moveInDate=${FILTER_MOVE_IN_DATE}&roomType=Private+Room`
    );

    render(<InlineFilterStrip />);

    expect(screen.getByTestId("mobile-filter-price")).toHaveTextContent(
      "$1,200-$1,800"
    );
    expect(screen.getByTestId("mobile-filter-move-in")).toHaveTextContent(
      formatDateLabel(FILTER_MOVE_IN_DATE)
    );
    expect(screen.getByTestId("mobile-filter-room-type")).toHaveTextContent(
      "Private Room"
    );
  });

  it("truncates applied chips on mobile after two chips", () => {
    mockUseMediaQuery.mockReturnValue(false);
    mockMobileResultsView = "list";
    mockSearchParams = new URLSearchParams(
      `minPrice=1200&maxPrice=1800&moveInDate=${FILTER_MOVE_IN_DATE}&roomType=Private+Room`
    );

    render(<InlineFilterStrip />);

    const appliedRegion = screen.getByRole("region", {
      name: "Applied filters",
    });
    expect(appliedRegion).toHaveTextContent("$1,200 - $1,800");
    expect(appliedRegion).toHaveTextContent(
      `Move-in: ${formatDateLabel(FILTER_MOVE_IN_DATE, true)}`
    );
    expect(appliedRegion).toHaveTextContent("+1 more");
  });
});
