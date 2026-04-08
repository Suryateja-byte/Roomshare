import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import SearchLayout from "@/app/search/layout";

jest.mock("@/components/SearchHeaderWrapper", () => ({
  __esModule: true,
  default: function MockSearchHeaderWrapper() {
    return <div data-testid="search-header-wrapper">Search header</div>;
  },
}));

jest.mock("@/components/AccountNoticeHost", () => ({
  __esModule: true,
  default: function MockAccountNoticeHost({
    placement,
  }: {
    placement: string;
  }) {
    return <div data-testid={`account-notice-host-${placement}`} />;
  },
}));

jest.mock("@/components/SearchLayoutView", () => ({
  __esModule: true,
  default: function MockSearchLayoutView({
    children,
  }: {
    children: ReactNode;
  }) {
    return <div data-testid="search-layout-view">{children}</div>;
  },
}));

jest.mock("@/components/ui/SkipLink", () => ({
  SkipLink: function MockSkipLink() {
    return <a href="#search-results">Skip</a>;
  },
}));

jest.mock("@/contexts/MapBoundsContext", () => ({
  MapBoundsProvider: function MockMapBoundsProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    return <>{children}</>;
  },
}));

jest.mock("@/contexts/ActivePanBoundsContext", () => ({
  ActivePanBoundsProvider: function MockActivePanBoundsProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    return <>{children}</>;
  },
}));

jest.mock("@/contexts/SearchTransitionContext", () => ({
  SearchTransitionProvider: function MockSearchTransitionProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    return <>{children}</>;
  },
}));

jest.mock("@/contexts/FilterStateContext", () => ({
  FilterStateProvider: function MockFilterStateProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    return <>{children}</>;
  },
}));

jest.mock("@/contexts/ListingFocusContext", () => ({
  ListingFocusProvider: function MockListingFocusProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    return <>{children}</>;
  },
}));

jest.mock("@/contexts/SearchV2DataContext", () => ({
  SearchV2DataProvider: function MockSearchV2DataProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    return <>{children}</>;
  },
}));

jest.mock("@/contexts/MobileSearchContext", () => ({
  MobileSearchProvider: function MockMobileSearchProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    return <>{children}</>;
  },
}));

describe("SearchLayout", () => {
  it("includes the search-scoped account notice inside the fixed header", () => {
    render(
      <SearchLayout>
        <div>Results</div>
      </SearchLayout>
    );

    const header = screen.getByRole("banner");
    expect(
      screen.getByTestId("account-notice-host-search")
    ).toBeInTheDocument();
    expect(screen.getByTestId("search-header-wrapper")).toBeInTheDocument();
    expect(header).toContainElement(
      screen.getByTestId("account-notice-host-search")
    );
  });
});
