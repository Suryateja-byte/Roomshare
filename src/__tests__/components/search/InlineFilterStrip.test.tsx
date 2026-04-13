import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { InlineFilterStrip } from "@/components/search/InlineFilterStrip";
import { emptyFilterValues } from "@/hooks/useBatchedFilters";
import {
  QUICK_FILTER_ACTIVE_BADGE_CLASSNAME,
  QUICK_FILTER_ACTIVE_CLASSNAME,
} from "@/components/search/quickFilterStyles";

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
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="filter-modal">Filters modal</div> : null,
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
  const PopoverContext = React.createContext(
    null as PopoverContextValue | null
  );

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

    expect(
      screen.getByTestId("quick-filter-price-popover")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("filter-modal")).not.toBeInTheDocument();
  });

  it("opens the advanced filter drawer from the desktop Filters button", () => {
    render(<InlineFilterStrip />);

    fireEvent.click(screen.getByTestId("quick-filter-more-filters"));

    expect(screen.getByTestId("filter-modal")).toBeInTheDocument();
  });

  it("commits room type immediately from the desktop quick filter", () => {
    render(<InlineFilterStrip />);

    fireEvent.click(screen.getByTestId("quick-filter-room-type"));
    fireEvent.click(screen.getByRole("button", { name: "Private Room" }));

    expect(mockCommit).toHaveBeenCalledWith({ roomType: "Private Room" });
    expect(
      screen.queryByTestId("quick-filter-room-type-popover")
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("filter-modal")).not.toBeInTheDocument();
  });

  it("uses terracotta active styling for desktop quick filters and the filters button", () => {
    Object.assign(mockCommitted, {
      minPrice: "1200",
    });
    mockSearchParams = new URLSearchParams("minPrice=1200");

    render(<InlineFilterStrip />);

    const priceButton = screen.getByTestId("quick-filter-price");
    const filtersButton = screen.getByTestId("quick-filter-more-filters");
    const activeBadge = within(filtersButton).getByText("1");

    expect(priceButton).toHaveClass("font-medium");
    for (const className of QUICK_FILTER_ACTIVE_CLASSNAME.split(" ")) {
      expect(priceButton).toHaveClass(className);
      expect(filtersButton).toHaveClass(className);
    }
    expect(priceButton).not.toHaveClass("bg-on-surface");
    expect(filtersButton).not.toHaveClass("bg-on-surface");
    for (const className of QUICK_FILTER_ACTIVE_BADGE_CLASSNAME.split(" ")) {
      expect(activeBadge).toHaveClass(className);
    }
  });

  it("renders desktop applied filters on a separate row below the primary controls", () => {
    mockSearchParams = new URLSearchParams(
      "roomType=Private+Room&languages=te"
    );

    render(
      <InlineFilterStrip
        desktopSummary={{
          total: 24,
          visibleCount: 12,
          locationLabel: "San Francisco",
        }}
      />
    );

    const primaryRow = screen.getByTestId("desktop-primary-filters-row");
    const appliedRow = screen.getByTestId("desktop-applied-filters-row");

    expect(primaryRow).toContainElement(
      screen.getByTestId("quick-filter-price")
    );
    expect(within(appliedRow).getByText("Private Room")).toBeInTheDocument();
    expect(within(appliedRow).getByText("Telugu")).toBeInTheDocument();
    expect(
      within(appliedRow).getByRole("button", { name: /clear all filters/i })
    ).toBeInTheDocument();
  });

  it("renders the desktop summary row separately from the filter rail", () => {
    render(
      <InlineFilterStrip
        desktopSummary={{
          total: 86,
          visibleCount: 12,
          locationLabel: "San Francisco",
          browseMode: true,
        }}
        toolbarSlot={<div data-testid="mock-toolbar">Toolbar</div>}
      />
    );

    const summaryRow = screen.getByTestId("desktop-results-summary-row");
    const toolbarCluster = screen.getByTestId("desktop-toolbar-cluster");

    expect(
      within(summaryRow).getByText("86 places in San Francisco")
    ).toBeInTheDocument();
    expect(within(summaryRow).getByText("· 1–12")).toBeInTheDocument();
    expect(
      within(summaryRow).getByText("· Showing top listings")
    ).toBeInTheDocument();
    expect(
      within(toolbarCluster).getByTestId("mock-toolbar")
    ).toBeInTheDocument();
  });

  it("renders toolbarSlot content inside the desktop toolbar cluster instead of the filter rail", () => {
    render(
      <InlineFilterStrip
        desktopSummary={{
          total: 12,
          visibleCount: 12,
          locationLabel: "Chicago",
        }}
        toolbarSlot={<div data-testid="mock-toolbar">Toolbar</div>}
      />
    );

    const primaryRow = screen.getByTestId("desktop-primary-filters-row");
    const toolbarCluster = screen.getByTestId("desktop-toolbar-cluster");

    expect(
      within(toolbarCluster).getByTestId("mock-toolbar")
    ).toBeInTheDocument();
    expect(within(toolbarCluster).getByText("Toolbar")).toBeInTheDocument();
    expect(
      within(primaryRow).queryByTestId("mock-toolbar")
    ).not.toBeInTheDocument();
  });

  it("does not render a separator when toolbarSlot is provided", () => {
    render(
      <InlineFilterStrip
        desktopSummary={{
          total: 12,
          visibleCount: 12,
          locationLabel: "Chicago",
        }}
        toolbarSlot={<div data-testid="mock-toolbar">Toolbar</div>}
      />
    );

    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
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
    expect(
      screen.queryByTestId("mobile-filter-move-in")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mobile-filter-room-type")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mobile-filter-button")
    ).not.toBeInTheDocument();
  });

  it("uses terracotta active styling for mobile quick filters and the filters button", () => {
    mockUseMediaQuery.mockReturnValue(false);
    mockMobileResultsView = "list";
    Object.assign(mockCommitted, {
      minPrice: "1200",
      roomType: "Private Room",
    });
    mockSearchParams = new URLSearchParams(
      "minPrice=1200&roomType=Private+Room"
    );

    render(<InlineFilterStrip />);

    const priceButton = screen.getByTestId("mobile-filter-price");
    const roomTypeButton = screen.getByTestId("mobile-filter-room-type");
    const filtersButton = screen.getByTestId("mobile-filter-button");
    const activeBadge = within(filtersButton).getByText("2");

    for (const button of [priceButton, roomTypeButton, filtersButton]) {
      for (const className of QUICK_FILTER_ACTIVE_CLASSNAME.split(" ")) {
        expect(button).toHaveClass(className);
      }
      expect(button).not.toHaveClass("bg-on-surface");
    }

    for (const className of QUICK_FILTER_ACTIVE_BADGE_CLASSNAME.split(" ")) {
      expect(activeBadge).toHaveClass(className);
    }
  });

  it('hides the mobile quick filters in "peek" view', () => {
    mockUseMediaQuery.mockReturnValue(false);
    mockMobileResultsView = "peek";

    render(<InlineFilterStrip />);

    expect(screen.queryByTestId("mobile-filter-price")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mobile-filter-move-in")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mobile-filter-room-type")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mobile-filter-button")
    ).not.toBeInTheDocument();
  });

  it("shows selected values in mobile quick filters", () => {
    mockUseMediaQuery.mockReturnValue(false);
    mockMobileResultsView = "list";
    Object.assign(mockCommitted, {
      minPrice: "1200",
      maxPrice: "1800",
      moveInDate: "2026-05-01",
      roomType: "Private Room",
    });
    mockSearchParams = new URLSearchParams(
      "minPrice=1200&maxPrice=1800&moveInDate=2026-05-01&roomType=Private+Room"
    );

    render(<InlineFilterStrip />);

    expect(screen.getByTestId("mobile-filter-price")).toHaveTextContent(
      "$1,200-$1,800"
    );
    expect(screen.getByTestId("mobile-filter-move-in")).toHaveTextContent(
      "May 1"
    );
    expect(screen.getByTestId("mobile-filter-room-type")).toHaveTextContent(
      "Private Room"
    );
  });

  it("truncates applied chips on mobile after two chips", () => {
    mockUseMediaQuery.mockReturnValue(false);
    mockMobileResultsView = "list";
    mockSearchParams = new URLSearchParams(
      "minPrice=1200&maxPrice=1800&moveInDate=2026-05-01&roomType=Private+Room"
    );

    render(<InlineFilterStrip />);

    const appliedRegion = screen.getByRole("region", {
      name: "Applied filters",
    });
    expect(appliedRegion).toHaveTextContent("$1,200 - $1,800");
    expect(appliedRegion).toHaveTextContent("Move-in: May 1, 2026");
    expect(appliedRegion).toHaveTextContent("+1 more");
  });
});
