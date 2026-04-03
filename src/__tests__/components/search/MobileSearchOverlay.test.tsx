/**
 * Unit tests for MobileSearchOverlay
 *
 * Focused on the mobile location field shell wiring so alignment regressions
 * are caught without depending on the full autocomplete implementation.
 */

const mockPush = jest.fn();
const mockLocationSearchInput = jest.fn(
  ({
    className,
    inputClassName,
  }: {
    className?: string;
    inputClassName?: string;
  }) => (
    <div
      data-testid="location-search-input"
      data-class-name={className}
      data-input-class-name={inputClassName}
    />
  )
);

jest.mock("react-dom", () => {
  const actual = jest.requireActual("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams("q=Chicago&amenities=Wifi"),
}));

jest.mock("framer-motion", () => ({
  LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  domAnimation: {},
  m: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

jest.mock("lucide-react", () => ({
  ArrowLeft: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="arrow-left-icon" {...props} />
  ),
  Search: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="search-icon" {...props} />
  ),
  Clock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="clock-icon" {...props} />
  ),
  X: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="x-icon" {...props} />
  ),
  SlidersHorizontal: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="sliders-icon" {...props} />
  ),
  LocateFixed: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="locate-fixed-icon" {...props} />
  ),
}));

jest.mock("@/hooks/useRecentSearches", () => ({
  useRecentSearches: () => ({
    recentSearches: [],
    removeRecentSearch: jest.fn(),
    formatSearch: (search: { location: string }) => search.location,
  }),
}));

jest.mock("@/components/ui/FocusTrap", () => ({
  FocusTrap: ({
    children,
  }: {
    children: React.ReactNode;
    active?: boolean;
  }) => <>{children}</>,
}));

jest.mock("@/hooks/useBodyScrollLock", () => ({
  useBodyScrollLock: jest.fn(),
}));

jest.mock("@/components/LocationSearchInput", () => ({
  __esModule: true,
  default: (props: {
    className?: string;
    inputClassName?: string;
  }) => mockLocationSearchInput(props),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import MobileSearchOverlay from "@/components/search/MobileSearchOverlay";

describe("MobileSearchOverlay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes shell classes to the mobile location field and keeps text styles on the input", () => {
    render(
      <MobileSearchOverlay
        isOpen
        onClose={jest.fn()}
        onOpenFilters={jest.fn()}
      />
    );

    expect(mockLocationSearchInput).toHaveBeenCalled();

    const props = mockLocationSearchInput.mock.calls.at(-1)?.[0] as {
      className?: string;
      inputClassName?: string;
    };

    expect(props.className).toContain("w-full");
    expect(props.className).toContain("h-12");
    expect(props.className).toContain("px-4");
    expect(props.className).toContain("pr-11");
    expect(props.className).toContain("focus-within:ring-2");
    expect(props.className).toContain("focus-within:border-primary/30");
    expect(props.className).not.toContain("placeholder:text-on-surface-variant");

    expect(props.inputClassName).toContain("text-base");
    expect(props.inputClassName).toContain("text-on-surface");
    expect(props.inputClassName).toContain(
      "placeholder:text-on-surface-variant"
    );
  });

  it("renders the locate icon inside the location field shell", () => {
    render(
      <MobileSearchOverlay
        isOpen
        onClose={jest.fn()}
        onOpenFilters={jest.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByTestId("locate-fixed-icon")).toHaveClass("right-4");
  });
});
