import { render, waitFor } from "@testing-library/react";
import { POILayer, type POICategory } from "@/components/map/POILayer";

function createMapStub() {
  const setLayoutProperty = jest.fn();
  const getStyle = jest.fn(() => ({
    layers: [
      { id: "poi_transit" },
      { id: "road_transit_rail" },
      { id: "poi_r7" },
      { id: "park_outline" },
    ],
  }));

  const map = {
    getStyle,
    setLayoutProperty,
  };

  return {
    mapRef: {
      current: {
        getMap: () => map,
      },
    },
    setLayoutProperty,
  };
}

describe("POILayer", () => {
  it("synchronizes visible categories without rendering inline controls", async () => {
    const { mapRef, setLayoutProperty } = createMapStub();
    const { container } = render(
      <POILayer
        mapRef={mapRef}
        isMapLoaded={true}
        activeCategories={new Set<POICategory>(["transit", "parks"])}
      />
    );

    expect(container).toBeEmptyDOMElement();

    await waitFor(() => {
      expect(setLayoutProperty).toHaveBeenCalledTimes(4);
    });

    expect(setLayoutProperty).toHaveBeenCalledWith(
      "poi_transit",
      "visibility",
      "visible"
    );
    expect(setLayoutProperty).toHaveBeenCalledWith(
      "road_transit_rail",
      "visibility",
      "visible"
    );
    expect(setLayoutProperty).toHaveBeenCalledWith(
      "poi_r7",
      "visibility",
      "none"
    );
    expect(setLayoutProperty).toHaveBeenCalledWith(
      "park_outline",
      "visibility",
      "visible"
    );
    expect(setLayoutProperty).not.toHaveBeenCalledWith(
      "road_transit_rail_hatching",
      "visibility",
      expect.any(String)
    );
  });

  it("reapplies visibility when the active category set changes", async () => {
    const { mapRef, setLayoutProperty } = createMapStub();
    const { rerender } = render(
      <POILayer
        mapRef={mapRef}
        isMapLoaded={true}
        activeCategories={new Set<POICategory>()}
      />
    );

    await waitFor(() => {
      expect(setLayoutProperty).toHaveBeenCalledWith(
        "poi_transit",
        "visibility",
        "none"
      );
    });

    setLayoutProperty.mockClear();

    rerender(
      <POILayer
        mapRef={mapRef}
        isMapLoaded={true}
        activeCategories={new Set<POICategory>(["landmarks"])}
      />
    );

    await waitFor(() => {
      expect(setLayoutProperty).toHaveBeenCalledWith(
        "poi_r7",
        "visibility",
        "visible"
      );
    });

    expect(setLayoutProperty).toHaveBeenCalledWith(
      "poi_transit",
      "visibility",
      "none"
    );
    expect(setLayoutProperty).toHaveBeenCalledWith(
      "road_transit_rail",
      "visibility",
      "none"
    );
    expect(setLayoutProperty).toHaveBeenCalledWith(
      "park_outline",
      "visibility",
      "none"
    );
  });
});
