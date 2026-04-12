import { fireEvent, render, screen } from "@testing-library/react";
import SearchHeaderWrapper from "@/components/SearchHeaderWrapper";

const mockOpenFilters = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/hooks/useScrollHeader", () => ({
  useScrollHeader: () => ({ isCollapsed: false }),
}));

jest.mock("@/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: jest.fn(),
}));

jest.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

jest.mock("@/contexts/MobileSearchContext", () => ({
  useMobileSearch: () => ({
    openFilters: mockOpenFilters,
  }),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null }),
  signOut: jest.fn(),
}));

jest.mock("@/components/search/DesktopHeaderSearch", () => ({
  __esModule: true,
  default: function MockDesktopHeaderSearch() {
    return <div data-testid="desktop-header-search">Desktop search</div>;
  },
}));

jest.mock("@/components/CollapsedMobileSearch", () => ({
  __esModule: true,
  default: function MockCollapsedMobileSearch() {
    return <div data-testid="collapsed-mobile-search" />;
  },
}));

jest.mock("@/components/search/MobileSearchOverlay", () => ({
  __esModule: true,
  default: function MockMobileSearchOverlay() {
    return null;
  },
}));

describe("SearchHeaderWrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("renders a desktop header filters button that opens the shared filter drawer", () => {
    render(<SearchHeaderWrapper />);

    fireEvent.click(screen.getByTestId("desktop-header-filters-button"));

    expect(mockOpenFilters).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("desktop-header-search")).toBeInTheDocument();
  });

  it("shows the active filter count on the desktop header filters button", () => {
    mockSearchParams = new URLSearchParams("minPrice=1200");

    render(<SearchHeaderWrapper />);

    expect(
      screen.getByRole("button", { name: "Filters (1 active)" })
    ).toHaveTextContent("Filters");
    expect(screen.queryByLabelText(/messages/i)).not.toBeInTheDocument();
  });
});
