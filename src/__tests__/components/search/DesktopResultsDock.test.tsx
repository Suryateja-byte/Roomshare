import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DesktopResultsDock from "@/components/search/DesktopResultsDock";

const mockToggleMap = jest.fn();
const mockHideMap = jest.fn();
let mockShouldShowMap = false;

jest.mock("@/contexts/SearchMapUIContext", () => ({
  useSearchMapUI: () => ({
    shouldShowMap: mockShouldShowMap,
    toggleMap: mockToggleMap,
    hideMap: mockHideMap,
  }),
}));

jest.mock("@/components/SortSelect", () => ({
  __esModule: true,
  default: ({
    currentSort,
    desktopVariant,
  }: {
    currentSort: string;
    desktopVariant?: string;
  }) => (
    <div
      data-testid="dock-sort"
      data-current-sort={currentSort}
      data-variant={desktopVariant}
    >
      Sort
    </div>
  ),
}));

jest.mock("@/components/SaveSearchButton", () => ({
  __esModule: true,
  default: ({ variant }: { variant?: string }) => (
    <button data-testid="dock-save-search" data-variant={variant}>
      Save Search
    </button>
  ),
}));

describe("DesktopResultsDock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShouldShowMap = false;
  });

  it("renders the summary, utility controls, filters, and applied filters", () => {
    render(
      <DesktopResultsDock
        summary={{
          total: 86,
          visibleCount: 12,
          locationLabel: "San Francisco",
          browseMode: true,
        }}
        currentSort="recommended"
        hasResults={true}
        filters={<div data-testid="dock-filters">Filters</div>}
        appliedFilters={<div data-testid="dock-applied-filters">Applied</div>}
      />
    );

    expect(screen.getByTestId("desktop-results-dock")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "86 places" })
    ).toBeInTheDocument();
    expect(screen.getByText("San Francisco")).toBeInTheDocument();
    expect(screen.getByText("1–12")).toBeInTheDocument();
    expect(screen.getByText("Showing top listings")).toBeInTheDocument();
    expect(screen.getByTestId("dock-sort")).toHaveAttribute(
      "data-variant",
      "toolbar"
    );
    expect(screen.getByTestId("dock-save-search")).toHaveAttribute(
      "data-variant",
      "toolbar"
    );
    expect(screen.getByTestId("dock-filters")).toBeInTheDocument();
    expect(screen.getByTestId("dock-applied-filters")).toBeInTheDocument();
  });

  it("toggles between list and map modes with the segmented control", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <DesktopResultsDock
        summary={{ total: 40, visibleCount: 12, locationLabel: "Chicago" }}
        currentSort="recommended"
        hasResults={true}
        filters={<div />}
      />
    );

    const mapButton = screen.getByTestId("desktop-view-map");
    const listButton = screen.getByTestId("desktop-view-list");

    expect(mapButton).toHaveAttribute("aria-pressed", "false");
    expect(listButton).toHaveAttribute("aria-pressed", "true");

    await user.click(mapButton);
    expect(mockToggleMap).toHaveBeenCalledTimes(1);

    mockShouldShowMap = true;
    rerender(
      <DesktopResultsDock
        summary={{ total: 40, visibleCount: 12, locationLabel: "Chicago" }}
        currentSort="recommended"
        hasResults={true}
        filters={<div />}
      />
    );

    await user.click(screen.getByTestId("desktop-view-list"));
    expect(mockHideMap).toHaveBeenCalledTimes(1);
  });

  it("hides sort and save search when there are no results", () => {
    render(
      <DesktopResultsDock
        summary={{ total: 0, visibleCount: 0, locationLabel: "Chicago" }}
        currentSort="recommended"
        hasResults={false}
        filters={<div />}
      />
    );

    expect(screen.queryByTestId("dock-sort")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dock-save-search")).not.toBeInTheDocument();
    expect(screen.getByTestId("desktop-view-toggle")).toBeInTheDocument();
  });
});
