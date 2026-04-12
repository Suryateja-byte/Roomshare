import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockUseMediaQuery = jest.fn();

jest.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: (...args: unknown[]) => mockUseMediaQuery(...args),
}));

jest.mock("@/components/nearby/NearbyPlacesPanel", () => ({
  __esModule: true,
  default: ({ isPaneInteractive }: { isPaneInteractive?: boolean }) => (
    <div
      data-testid="nearby-panel"
      data-pane-interactive={String(Boolean(isPaneInteractive))}
    >
      Panel
    </div>
  ),
}));

jest.mock("@/components/nearby/NearbyPlacesMap", () => ({
  __esModule: true,
  default: ({ isPaneInteractive }: { isPaneInteractive?: boolean }) => (
    <div
      data-testid="nearby-map"
      data-pane-interactive={String(Boolean(isPaneInteractive))}
    >
      Map
    </div>
  ),
}));

import NearbyPlacesSection from "@/components/nearby/NearbyPlacesSection";

describe("NearbyPlacesSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not gate either pane before the media query resolves", () => {
    mockUseMediaQuery.mockReturnValue(undefined);

    render(<NearbyPlacesSection listingLat={37.7749} listingLng={-122.4194} />);

    const listPane = screen.getByTestId("nearby-panel").parentElement;
    const mapPane = screen.getByTestId("nearby-map").parentElement;

    expect(listPane).not.toHaveAttribute("aria-hidden");
    expect(listPane).not.toHaveAttribute("inert");
    expect(mapPane).not.toHaveAttribute("aria-hidden");
    expect(mapPane).not.toHaveAttribute("inert");
  });

  it("keeps exactly one pane interactive on mobile and swaps it when toggled", () => {
    mockUseMediaQuery.mockReturnValue(false);

    render(<NearbyPlacesSection listingLat={37.7749} listingLng={-122.4194} />);

    const toggle = screen.getByRole("button", { name: /^Map$/ });
    const panel = screen.getByTestId("nearby-panel");
    const map = screen.getByTestId("nearby-map");
    const listPane = panel.parentElement;
    const mapPane = map.parentElement;

    expect(panel).toHaveAttribute("data-pane-interactive", "true");
    expect(map).toHaveAttribute("data-pane-interactive", "false");
    expect(listPane).not.toHaveAttribute("aria-hidden");
    expect(mapPane).toHaveAttribute("aria-hidden", "true");
    expect(mapPane).toHaveAttribute("inert");

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: /^List$/ })).toBeInTheDocument();
    expect(panel).toHaveAttribute("data-pane-interactive", "false");
    expect(map).toHaveAttribute("data-pane-interactive", "true");
    expect(listPane).toHaveAttribute("aria-hidden", "true");
    expect(listPane).toHaveAttribute("inert");
    expect(mapPane).not.toHaveAttribute("aria-hidden");
  });

  it("measures mobile card height from available viewport space and clamps it", async () => {
    mockUseMediaQuery.mockReturnValue(false);
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 500,
    });

    const getBoundingClientRectSpy = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(
        () =>
          ({
            top: 100,
            left: 0,
            right: 400,
            bottom: 700,
            width: 400,
            height: 600,
            x: 0,
            y: 100,
            toJSON: () => ({}),
          }) as DOMRect
      );

    render(<NearbyPlacesSection listingLat={37.7749} listingLng={-122.4194} />);

    const card = screen.getByTestId("nearby-panel").parentElement
      ?.parentElement as HTMLDivElement;

    await waitFor(() => {
      expect(card.style.height).toBe("376px");
    });

    getBoundingClientRectSpy.mockRestore();
  });
});
