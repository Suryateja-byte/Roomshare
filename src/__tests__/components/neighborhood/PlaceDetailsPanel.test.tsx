import { render, waitFor } from "@testing-library/react";
import { PlaceDetailsPanel } from "@/components/neighborhood/PlaceDetailsPanel";
import { loadPlacesUiKit } from "@/lib/googleMapsUiKitLoader";
import type { POI } from "@/lib/places/types";

jest.mock("@/lib/googleMapsUiKitLoader", () => ({
  loadPlacesUiKit: jest.fn(),
}));

const mockLoadPlacesUiKit = loadPlacesUiKit as jest.MockedFunction<
  typeof loadPlacesUiKit
>;

const poi: POI = {
  placeId: "places/abc 123",
  name: "Test Cafe",
  lat: 37.775,
  lng: -122.418,
  distanceMiles: 0.2,
  walkMins: 4,
};

describe("PlaceDetailsPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadPlacesUiKit.mockResolvedValue();
    window.open = jest.fn();
  });

  it("uses the nested Google UI Kit place request contract", async () => {
    render(<PlaceDetailsPanel poi={poi} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(
        document.querySelector("gmp-place-details-compact")
      ).toBeInTheDocument();
    });

    const detailsElement = document.querySelector(
      "gmp-place-details-compact"
    ) as HTMLElement;
    const requestElement = detailsElement.querySelector(
      "gmp-place-details-place-request"
    ) as HTMLElement & { place?: string };

    expect(detailsElement).not.toHaveAttribute("place");
    expect(requestElement).toBeInTheDocument();
    expect(requestElement).toHaveAttribute("place", poi.placeId);
    expect(requestElement.place).toBe(poi.placeId);
    expect(
      detailsElement.querySelector("gmp-place-all-content")
    ).toBeInTheDocument();
  });
});
