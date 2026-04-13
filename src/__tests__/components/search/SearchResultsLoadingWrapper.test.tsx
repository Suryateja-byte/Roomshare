import { render, screen } from "@testing-library/react";
import { SearchResultsLoadingWrapper } from "@/components/search/SearchResultsLoadingWrapper";
import type { SearchTransitionReason } from "@/contexts/SearchTransitionContext";

type MockSearchTransitionState = {
  isPending: boolean;
  isSlowTransition: boolean;
  pendingReason: SearchTransitionReason | null;
};

const createTransitionState = (
  overrides: Partial<MockSearchTransitionState> = {}
): MockSearchTransitionState => ({
  isPending: false,
  isSlowTransition: false,
  pendingReason: null,
  ...overrides,
});

const mockUseSearchParams = jest.fn(() => new URLSearchParams("q=Chicago"));
const mockUseSearchTransitionSafe = jest.fn<
  MockSearchTransitionState | null,
  []
>(() => createTransitionState());

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
    mockUseSearchTransitionSafe.mockReturnValue(createTransitionState());
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
    expect(screen.getByText("Loaded results")).toBeInTheDocument();
  });

  it("marks the region busy without rendering visual overlay chrome", () => {
    mockUseSearchTransitionSafe.mockReturnValue(
      createTransitionState({
        isPending: true,
        pendingReason: "filter",
      })
    );

    render(
      <SearchResultsLoadingWrapper>
        <button type="button">Stale result card</button>
      </SearchResultsLoadingWrapper>
    );

    expect(screen.getByTestId("search-results-pending-region")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(
      screen.queryByTestId("search-results-pending-overlay")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("search-results-pending-status")
    ).not.toBeInTheDocument();
  });

  it("announces the refreshed heading text when pending state clears", () => {
    mockUseSearchTransitionSafe.mockReturnValue(
      createTransitionState({
        isPending: true,
        pendingReason: "filter",
      })
    );

    const { rerender } = render(
      <>
        <h1 id="search-results-heading">12 places in Chicago</h1>
        <SearchResultsLoadingWrapper>
          <div>Loaded results</div>
        </SearchResultsLoadingWrapper>
      </>
    );

    mockUseSearchTransitionSafe.mockReturnValue(createTransitionState());

    rerender(
      <>
        <h1 id="search-results-heading">8 places in Chicago</h1>
        <SearchResultsLoadingWrapper>
          <div>Loaded results</div>
        </SearchResultsLoadingWrapper>
      </>
    );

    expect(screen.getByRole("status")).toHaveTextContent("8 places in Chicago");
  });
});
