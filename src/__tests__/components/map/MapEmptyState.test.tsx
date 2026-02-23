import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => <button {...props}>{children}</button>,
}));

import { MapEmptyState } from "@/components/map/MapEmptyState";

describe("MapEmptyState", () => {
  const defaultProps = {
    onZoomOut: jest.fn(),
    searchParams: new URLSearchParams(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('renders heading "No listings in this area"', () => {
    render(<MapEmptyState {...defaultProps} />);
    expect(screen.getByText("No listings in this area")).toBeInTheDocument();
  });

  it('renders "Zoom out" button', () => {
    render(<MapEmptyState {...defaultProps} />);
    expect(screen.getByText("Zoom out")).toBeInTheDocument();
  });

  it("calls onZoomOut when zoom button clicked", () => {
    const onZoomOut = jest.fn();
    render(<MapEmptyState {...defaultProps} onZoomOut={onZoomOut} />);
    fireEvent.click(screen.getByText("Zoom out"));
    expect(onZoomOut).toHaveBeenCalledTimes(1);
  });

  // --- Task 1.2: Filter chips and clear-filters ---

  it("shows active filter chips when URL has filters", () => {
    const params = new URLSearchParams("maxPrice=1500&roomType=Private+Room");
    render(<MapEmptyState {...defaultProps} searchParams={params} />);
    expect(screen.getByText("Max $1,500")).toBeInTheDocument();
    expect(screen.getByText("Private Room")).toBeInTheDocument();
  });

  it("shows no filter section when no filters active", () => {
    render(<MapEmptyState {...defaultProps} searchParams={new URLSearchParams()} />);
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });

  it('renders "Clear filters" button when filters are active', () => {
    const params = new URLSearchParams("maxPrice=1500");
    render(<MapEmptyState {...defaultProps} searchParams={params} />);
    expect(screen.getByText("Clear filters")).toBeInTheDocument();
  });

  it('does NOT render "Clear filters" when no filters', () => {
    render(<MapEmptyState {...defaultProps} searchParams={new URLSearchParams()} />);
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });

  it('clicking "Clear filters" navigates to cleared URL', () => {
    const params = new URLSearchParams("maxPrice=1500&q=Austin&lat=30&lng=-97");
    render(<MapEmptyState {...defaultProps} searchParams={params} />);
    fireEvent.click(screen.getByText("Clear filters"));
    // Should preserve q, lat, lng but remove maxPrice
    expect(mockPush).toHaveBeenCalledTimes(1);
    const pushedUrl = mockPush.mock.calls[0][0];
    expect(pushedUrl).toContain("q=Austin");
    expect(pushedUrl).toContain("lat=30");
    expect(pushedUrl).not.toContain("maxPrice");
  });

  it("shows max 3 chips with overflow indicator", () => {
    const params = new URLSearchParams(
      "maxPrice=1500&roomType=Private+Room&leaseDuration=6+months&amenities=Wifi&amenities=AC"
    );
    render(<MapEmptyState {...defaultProps} searchParams={params} />);
    // Should show 3 chips + overflow
    const chipContainer = screen.getByTestId("filter-chips");
    const chips = chipContainer.querySelectorAll("[data-testid='filter-chip']");
    expect(chips.length).toBeLessThanOrEqual(3);
    expect(screen.getByText(/\+\d+ more/)).toBeInTheDocument();
  });
});
