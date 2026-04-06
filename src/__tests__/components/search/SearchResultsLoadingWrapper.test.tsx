import { render, screen } from "@testing-library/react";
import { SearchResultsLoadingWrapper } from "@/components/search/SearchResultsLoadingWrapper";

const mockUseSearchParams = jest.fn(() => new URLSearchParams("q=Chicago"));
const mockUseSearchTransitionSafe = jest.fn(() => ({
  isPending: false,
  isSlowTransition: false,
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

jest.mock("@/contexts/SearchTransitionContext", () => ({
  useSearchTransitionSafe: () => mockUseSearchTransitionSafe(),
}));

describe("SearchResultsLoadingWrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSearchParams.mockReturnValue(new URLSearchParams("q=Chicago"));
    mockUseSearchTransitionSafe.mockReturnValue({
      isPending: false,
      isSlowTransition: false,
    });
  });

  it("renders the results body without pending chrome when idle", () => {
    render(
      <SearchResultsLoadingWrapper>
        <div>Loaded results</div>
      </SearchResultsLoadingWrapper>
    );

    expect(screen.getByTestId("search-results-pending-region")).toHaveAttribute(
      "aria-busy",
      "false"
    );
    expect(
      screen.queryByTestId("search-results-pending-overlay")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("search-results-pending-status")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("search-results-content")).not.toHaveClass(
      "pointer-events-none"
    );
    expect(screen.getByText("Loaded results")).toBeInTheDocument();
  });

  it("shows a compact pending status and blocks stale-result interactions", () => {
    mockUseSearchTransitionSafe.mockReturnValue({
      isPending: true,
      isSlowTransition: false,
    });

    render(
      <SearchResultsLoadingWrapper>
        <button type="button">Stale result card</button>
      </SearchResultsLoadingWrapper>
    );

    expect(screen.getByTestId("search-results-pending-region")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByTestId("search-results-pending-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("search-results-pending-status")).toHaveTextContent(
      "Updating results..."
    );
    expect(screen.getByTestId("search-results-content")).toHaveClass(
      "pointer-events-none"
    );
    expect(
      screen.queryByTestId("listing-card-skeleton-grid")
    ).not.toBeInTheDocument();
  });

  it("switches to slow-transition copy when the navigation drags on", () => {
    mockUseSearchTransitionSafe.mockReturnValue({
      isPending: true,
      isSlowTransition: true,
    });

    render(
      <SearchResultsLoadingWrapper>
        <div>Loaded results</div>
      </SearchResultsLoadingWrapper>
    );

    expect(screen.getByTestId("search-results-pending-status")).toHaveTextContent(
      "Still loading..."
    );
  });
});
