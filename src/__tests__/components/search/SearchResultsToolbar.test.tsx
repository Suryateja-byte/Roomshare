import { fireEvent, render, screen } from "@testing-library/react";
import SearchResultsToolbar from "@/components/search/SearchResultsToolbar";

const mockToggleMap = jest.fn();
let mockShouldShowMap = false;

jest.mock("@/contexts/SearchMapUIContext", () => ({
  useSearchMapUI: () => ({
    shouldShowMap: mockShouldShowMap,
    toggleMap: mockToggleMap,
  }),
}));

jest.mock("@/components/SortSelect", () => ({
  __esModule: true,
  default: ({ currentSort }: { currentSort: string }) => (
    <div data-testid="toolbar-sort-select">{currentSort}</div>
  ),
}));

jest.mock("@/components/SaveSearchButton", () => ({
  __esModule: true,
  default: () => (
    <button type="button" data-testid="toolbar-save-search">
      Save Search
    </button>
  ),
}));

describe("SearchResultsToolbar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShouldShowMap = false;
  });

  it("renders the desktop map toggle with sort and save actions when results exist", async () => {
    render(
      <SearchResultsToolbar currentSort="recommended" hasResults={true} />
    );

    expect(screen.getByTestId("desktop-search-toolbar")).toBeInTheDocument();
    const mapToggle = await screen.findByTestId("desktop-toolbar-map-toggle");
    expect(mapToggle).toHaveAttribute("aria-label", "Show results map");
    expect(mapToggle).toHaveTextContent("Show map");
    expect(screen.getByTestId("toolbar-sort-select")).toHaveTextContent(
      "recommended"
    );
    expect(screen.getByTestId("toolbar-save-search")).toBeInTheDocument();
  });

  it("renders sort, save search, and map toggle in that order", async () => {
    render(
      <SearchResultsToolbar currentSort="recommended" hasResults={true} />
    );

    await screen.findByTestId("desktop-toolbar-map-toggle");
    const toolbar = screen.getByTestId("desktop-search-toolbar");
    const children = Array.from(toolbar.children).map((element) =>
      element.getAttribute("data-testid")
    );

    expect(children).toEqual([
      "desktop-toolbar-sort",
      "desktop-toolbar-save-search",
      "desktop-toolbar-map-toggle",
    ]);
  });

  it("keeps the map toggle in place and updates its label across states", async () => {
    const { rerender } = render(
      <SearchResultsToolbar currentSort="recommended" hasResults={true} />
    );

    const toolbar = screen.getByTestId("desktop-search-toolbar");
    const initialToggle = await screen.findByTestId("desktop-toolbar-map-toggle");
    expect(toolbar).toContainElement(initialToggle);
    expect(initialToggle).toHaveTextContent("Show map");

    fireEvent.click(initialToggle);
    expect(mockToggleMap).toHaveBeenCalledTimes(1);

    mockShouldShowMap = true;
    rerender(
      <SearchResultsToolbar currentSort="recommended" hasResults={true} />
    );

    const nextToggle = await screen.findByTestId("desktop-toolbar-map-toggle");
    expect(toolbar).toContainElement(nextToggle);
    expect(nextToggle).toHaveTextContent("Hide map");
    expect(nextToggle).toHaveAttribute("aria-pressed", "true");
  });

  it("hides sort and save actions when there are no results", async () => {
    render(
      <SearchResultsToolbar currentSort="recommended" hasResults={false} />
    );

    expect(
      await screen.findByTestId("desktop-toolbar-map-toggle")
    ).toHaveAttribute("aria-label", "Show results map");
    expect(screen.queryByTestId("toolbar-sort-select")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toolbar-save-search")).not.toBeInTheDocument();
    expect(screen.getByTestId("desktop-search-toolbar").children).toHaveLength(
      1
    );
  });
});
