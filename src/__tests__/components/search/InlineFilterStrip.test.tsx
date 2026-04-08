import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { InlineFilterStrip } from "@/components/search/InlineFilterStrip";
import { emptyFilterValues } from "@/hooks/useBatchedFilters";

const mockRouterPush = jest.fn();
const mockRegisterOpenFilters = jest.fn();
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
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/contexts/SearchTransitionContext", () => ({
  useSearchTransitionSafe: () => null,
}));

jest.mock("@/contexts/MobileSearchContext", () => ({
  useMobileSearch: () => ({
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

  it("commits room type immediately from the desktop quick filter", () => {
    render(<InlineFilterStrip />);

    fireEvent.click(screen.getByTestId("quick-filter-room-type"));
    fireEvent.click(screen.getByRole("button", { name: "Private Room" }));

    expect(mockCommit).toHaveBeenCalledWith({ roomType: "Private Room" });
    expect(screen.queryByTestId("quick-filter-room-type-popover")).not.toBeInTheDocument();
    expect(screen.queryByTestId("filter-modal")).not.toBeInTheDocument();
  });

  it("keeps the mobile strip on the full drawer flow", () => {
    mockUseMediaQuery.mockReturnValue(false);

    render(<InlineFilterStrip />);

    fireEvent.click(screen.getByTestId("mobile-filter-price"));

    expect(screen.getByTestId("filter-modal")).toBeInTheDocument();
  });
});
