/**
 * Parity oracle: the home hero and the search-page header render the SAME
 * SearchBar. These tests pin that both contexts produce an identical field
 * structure (order, ids, labels) under both semantic-search flag states, so
 * the two surfaces can never drift apart again.
 */
import { render } from "@testing-library/react";

const mockPush = jest.fn();
const mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/components/LocationSearchInput", () => {
  return function MockLocationSearchInput({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
  }) {
    return (
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    );
  };
});

jest.mock("@/hooks/useRecentSearches", () => ({
  useRecentSearches: () => ({
    recentSearches: [],
    saveRecentSearch: jest.fn(),
    clearRecentSearches: jest.fn(),
    removeRecentSearch: jest.fn(),
    formatSearch: jest.fn(() => ""),
  }),
}));

import {
  SearchBar,
  useSearchBarState,
  useSearchSubmit,
} from "@/components/search/SearchBar";

function HomeContextHarness() {
  const state = useSearchBarState();
  const { handleSubmit, isSearching } = useSearchSubmit({
    state,
    enableNlParsing: true,
    debounceMs: 300,
  });
  return (
    <SearchBar
      state={state}
      onSubmit={handleSubmit}
      isSearching={isSearching}
      trailingSlot={<button type="button">Filters</button>}
    />
  );
}

function HeaderContextHarness() {
  const state = useSearchBarState();
  const { handleSubmit, isSearching } = useSearchSubmit({ state });
  return (
    <SearchBar
      state={state}
      onSubmit={handleSubmit}
      isSearching={isSearching}
      formTestId="desktop-header-search-form"
    />
  );
}

/** Field structure fingerprint: ordered (data-field, input ids, label text). */
function fingerprint(container: HTMLElement) {
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  return Array.from(form!.querySelectorAll<HTMLElement>("[data-field]")).map(
    (cell) => ({
      field: cell.dataset.field,
      inputIds: Array.from(cell.querySelectorAll("input")).map((i) => i.id),
      label: cell.querySelector("label")?.textContent?.trim(),
    })
  );
}

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH;

afterEach(() => {
  process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH = ORIGINAL_FLAG;
});

describe.each([
  ["enabled", "true", ["where", "what", "budget"]],
  ["disabled", "false", ["where", "budget"]],
])("with semantic search %s", (_label, flagValue, expectedFields) => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH = flagValue;
  });

  it("renders identical field structure in home and header contexts", () => {
    const home = render(<HomeContextHarness />);
    const homePrint = fingerprint(home.container);
    home.unmount();

    const header = render(<HeaderContextHarness />);
    const headerPrint = fingerprint(header.container);
    header.unmount();

    expect(homePrint.map((c) => c.field)).toEqual(expectedFields);
    expect(headerPrint).toEqual(homePrint);
  });

  it("uses the stable input ids in both contexts", () => {
    const home = render(<HomeContextHarness />);
    const ids = fingerprint(home.container).flatMap((c) => c.inputIds);
    expect(ids).toContain("search-location");
    expect(ids).toContain("search-budget-min");
    expect(ids).toContain("search-budget-max");
    if (flagValue === "true") {
      expect(ids).toContain("search-what");
    } else {
      expect(ids).not.toContain("search-what");
    }
    home.unmount();
  });
});

it("prefixes ids in the stacked overlay context so co-mounted bars never collide", () => {
  process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH = "true";

  function OverlayHarness() {
    const state = useSearchBarState();
    const { handleSubmit, isSearching } = useSearchSubmit({ state });
    return (
      <SearchBar
        state={state}
        onSubmit={handleSubmit}
        isSearching={isSearching}
        layout="stacked"
        idPrefix="mobile-"
      />
    );
  }

  const { container } = render(<OverlayHarness />);
  const ids = fingerprint(container).flatMap((c) => c.inputIds);
  expect(ids).toEqual([
    "mobile-search-location",
    "mobile-search-what",
    "mobile-search-budget-min",
    "mobile-search-budget-max",
  ]);
});
