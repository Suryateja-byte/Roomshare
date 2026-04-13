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
  default: ({ label }: { label?: string }) => (
    <button type="button" data-testid="toolbar-save-search">
      {label ?? "Save Search"}
    </button>
  ),
}));

describe("SearchResultsToolbar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShouldShowMap = false;
  });

  it("renders the desktop map toggle with sort and save actions when results exist", () => {
    render(
      <SearchResultsToolbar currentSort="recommended" hasResults={true} />
    );

    expect(screen.getByTestId("desktop-search-toolbar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show map" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("toolbar-sort-select")).toHaveTextContent(
      "recommended"
    );
    expect(screen.getByTestId("toolbar-save-search")).toBeInTheDocument();
  });

  it("renders sort, save search, and map toggle in that order", () => {
    render(
      <SearchResultsToolbar currentSort="recommended" hasResults={true} />
    );

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

  it("keeps the map toggle in place and updates its label across states", () => {
    const { rerender } = render(
      <SearchResultsToolbar currentSort="recommended" hasResults={true} />
    );

    const toolbar = screen.getByTestId("desktop-search-toolbar");
    const initialToggle = screen.getByTestId("desktop-toolbar-map-toggle");
    expect(toolbar).toContainElement(initialToggle);
    expect(initialToggle).toHaveTextContent("Show map");

    fireEvent.click(initialToggle);
    expect(mockToggleMap).toHaveBeenCalledTimes(1);

    mockShouldShowMap = true;
    rerender(
      <SearchResultsToolbar currentSort="recommended" hasResults={true} />
    );

    const nextToggle = screen.getByTestId("desktop-toolbar-map-toggle");
    expect(toolbar).toContainElement(nextToggle);
    expect(nextToggle).toHaveTextContent("Hide map");
    expect(nextToggle).toHaveAttribute("aria-pressed", "true");
  });

  it("hides sort and save actions when there are no results", () => {
    render(
      <SearchResultsToolbar currentSort="recommended" hasResults={false} />
    );

    expect(
      screen.getByRole("button", { name: "Show map" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("toolbar-sort-select")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toolbar-save-search")).not.toBeInTheDocument();
    expect(screen.getByTestId("desktop-search-toolbar").children).toHaveLength(
      1
    );
  });
});
