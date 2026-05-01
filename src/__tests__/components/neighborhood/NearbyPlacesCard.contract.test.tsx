import { fireEvent, render, waitFor } from "@testing-library/react";
import type React from "react";
import { NearbyPlacesCard } from "@/components/chat/NearbyPlacesCard";
import { loadPlacesUiKit } from "@/lib/googleMapsUiKitLoader";

jest.mock("@/lib/googleMapsUiKitLoader", () => ({
  loadPlacesUiKit: jest.fn(),
}));

const mockLoadPlacesUiKit = loadPlacesUiKit as jest.MockedFunction<
  typeof loadPlacesUiKit
>;

describe("NearbyPlacesCard callback contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadPlacesUiKit.mockResolvedValue();
    window.google = {
      maps: {
        importLibrary: jest.fn(),
        places: {},
        Circle: jest.fn(function Circle(options: unknown) {
          return options;
        }) as unknown as typeof google.maps.Circle,
      },
    };
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "google");
  });

  function renderCard(
    props: Partial<React.ComponentProps<typeof NearbyPlacesCard>> = {}
  ) {
    return render(
      <NearbyPlacesCard
        latitude={37.7749}
        longitude={-122.4194}
        queryText="coffee"
        normalizedIntent={{ mode: "type", includedTypes: ["cafe"] }}
        {...props}
      />
    );
  }

  async function getSearchElement(container: HTMLElement) {
    await waitFor(() => {
      expect(container.querySelector("gmp-place-search")).toBeInTheDocument();
    });

    return container.querySelector("gmp-place-search") as HTMLElement & {
      places?: unknown[];
    };
  }

  it("emits real normalized results for NeighborhoodModule", async () => {
    const onSearchResultsReady = jest.fn();
    const onSearchComplete = jest.fn();
    const onSearchSuccess = jest.fn();
    const onLoadingChange = jest.fn();

    const { container } = renderCard({
      onSearchResultsReady,
      onSearchComplete,
      onSearchSuccess,
      onLoadingChange,
    });

    const searchElement = await getSearchElement(container);
    searchElement.places = [
      {
        id: "place-1",
        displayName: "Blue Bottle",
        formattedAddress: "1 Market St",
        location: { lat: () => 37.775, lng: () => -122.418 },
        rating: 4.5,
        userRatingCount: 123,
        primaryType: "cafe",
        regularOpeningHours: { isOpen: () => true },
        googleMapsURI: "https://maps.google.com/?cid=place-1",
      },
    ];

    fireEvent(searchElement, new Event("gmp-load"));

    await waitFor(() => {
      expect(onSearchResultsReady).toHaveBeenCalledTimes(1);
    });

    expect(onSearchSuccess).toHaveBeenCalledTimes(1);
    expect(onSearchComplete).toHaveBeenCalledWith(1);
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    expect(onSearchResultsReady).toHaveBeenCalledWith(
      expect.objectContaining({
        pois: [
          expect.objectContaining({
            placeId: "place-1",
            name: "Blue Bottle",
            lat: 37.775,
            lng: -122.418,
            rating: 4.5,
            userRatingsTotal: 123,
            openNow: true,
            primaryType: "cafe",
          }),
        ],
        meta: expect.objectContaining({
          radiusMeters: 1600,
          radiusUsed: 1600,
          resultCount: 1,
          searchMode: "type",
          queryText: "coffee",
        }),
      })
    );
  });

  it("reports loader failures through onError and clears loading", async () => {
    mockLoadPlacesUiKit.mockRejectedValueOnce(new Error("loader failed"));
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const onError = jest.fn();
    const onLoadingChange = jest.fn();

    try {
      renderCard({ onError, onLoadingChange });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith("loader failed");
      });
      expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("emits an empty final result after radius expansion finds no places", async () => {
    const onSearchResultsReady = jest.fn();
    const onSearchComplete = jest.fn();
    const { container } = renderCard({
      onSearchResultsReady,
      onSearchComplete,
      radiusMeters: 1600,
    });

    const firstSearchElement = await getSearchElement(container);
    firstSearchElement.places = [];
    fireEvent(firstSearchElement, new Event("gmp-load"));

    await waitFor(() => {
      expect(container.textContent).toContain("Expanded search radius");
    });

    const expandedSearchElement = await getSearchElement(container);
    expandedSearchElement.places = [];
    fireEvent(expandedSearchElement, new Event("gmp-load"));

    await waitFor(() => {
      expect(onSearchResultsReady).toHaveBeenCalledTimes(1);
    });

    expect(onSearchComplete).toHaveBeenCalledWith(0);
    expect(onSearchResultsReady).toHaveBeenCalledWith(
      expect.objectContaining({
        pois: [],
        meta: expect.objectContaining({
          radiusMeters: 1600,
          radiusUsed: 5000,
          resultCount: 0,
        }),
      })
    );
  });
});
