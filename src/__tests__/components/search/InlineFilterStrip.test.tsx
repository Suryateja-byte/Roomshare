import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { InlineFilterStrip } from "@/components/search/InlineFilterStrip";
import { emptyFilterValues } from "@/hooks/useBatchedFilters";
import {
  QUICK_FILTER_ACTIVE_BADGE_CLASSNAME,
  QUICK_FILTER_ACTIVE_CLASSNAME,
} from "@/components/search/quickFilterStyles";

const mockRouterPush = jest.fn();
const mockRegisterOpenFilters = jest.fn();
let registeredOpenFiltersHandler: (() => void) | null = null;
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
    registeredOpenFiltersHandler = null;
    mockSearchParams = new URLSearchParams();
    mockMobileResultsView = "list";
    Object.assign(mockPending, emptyFilterValues);
    Object.assign(mockCommitted, emptyFilterValues);
    mockRegisterOpenFilters.mockImplementation((handler: () => void) => {
      registeredOpenFiltersHandler = handler;
      return jest.fn();
    });
    mockUseMediaQuery.mockImplementation((query: string) =>
      query === "(min-width: 768px)" ? true : undefined
    );
  });

  it("renders only the desktop results heading on desktop", () => {
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

    expect(
      screen.getByRole("heading", { name: "24 places" })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("desktop-results-heading-section")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("quick-filter-price")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("desktop-primary-filters-row")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Applied filters" })
    ).not.toBeInTheDocument();
  });

  it("registers a high-priority desktop drawer opener for the header filters button", () => {
    render(<InlineFilterStrip />);

    expect(mockRegisterOpenFilters).toHaveBeenCalledWith(
      expect.any(Function),
      10
    );
    expect(registeredOpenFiltersHandler).not.toBeNull();

    act(() => {
      registeredOpenFiltersHandler?.();
    });

    expect(screen.getByTestId("filter-modal")).toBeInTheDocument();
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
