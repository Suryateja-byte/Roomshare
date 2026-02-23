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
});
