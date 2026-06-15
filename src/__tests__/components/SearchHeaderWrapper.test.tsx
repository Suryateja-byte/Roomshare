import { fireEvent, render, screen } from "@testing-library/react";
import SearchHeaderWrapper from "@/components/SearchHeaderWrapper";

// Probe DesktopHeaderSearch so we can read the `collapsed` prop the wrapper
// passes in, without pulling in the real search-bar dependency tree.
jest.mock("@/components/search/DesktopHeaderSearch", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: React.forwardRef(function MockDesktopHeaderSearch(
      _props: Record<string, never>,
      ref: React.Ref<unknown>
    ) {
      React.useImperativeHandle(ref, () => ({ openAndFocus: jest.fn() }));
      return <div data-testid="desktop-header-search-probe" />;
    }),
  };
});

jest.mock("@/components/CollapsedMobileSearch", () => ({
  __esModule: true,
  default: function MockCollapsedMobileSearch() {
    return <div data-testid="collapsed-mobile-search" />;
  },
}));

jest.mock("@/components/search/MobileSearchOverlay", () => ({
  __esModule: true,
  default: function MockMobileSearchOverlay() {
    return <div data-testid="mobile-search-overlay" />;
  },
}));

jest.mock("@/contexts/MobileSearchContext", () => ({
  useMobileSearch: () => ({ openFilters: jest.fn() }),
}));

jest.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

jest.mock("@/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: () => {},
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null }),
  signOut: jest.fn(),
}));

describe("SearchHeaderWrapper", () => {
  it("renders the desktop search bar and keeps it mounted across results-panel scroll", () => {
    // Simulate the page already scrolled well past any former collapse threshold.
    Object.defineProperty(window, "scrollY", { value: 500, writable: true });

    render(<SearchHeaderWrapper />);

    expect(
      screen.getByTestId("desktop-header-search-probe")
    ).toBeInTheDocument();

    // The header is static: scrolling the results panel must not swap it out
    // for a collapsed summary (the scroll-collapse behaviour was removed).
    const region = document.createElement("div");
    region.setAttribute("data-search-results-scroll-region", "desktop");
    document.body.appendChild(region);
    Object.defineProperty(region, "scrollTop", {
      value: 500,
      configurable: true,
    });
    try {
      fireEvent.scroll(region);
      expect(
        screen.getByTestId("desktop-header-search-probe")
      ).toBeInTheDocument();
    } finally {
      region.remove();
    }
  });
});
