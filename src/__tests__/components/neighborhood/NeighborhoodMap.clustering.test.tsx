import React from "react";
import { act, render, screen } from "@testing-library/react";
import { NeighborhoodMap } from "@/components/neighborhood/NeighborhoodMap";
import type { POI } from "@/lib/places/types";

let lastMapProps: Record<string, unknown> = {};
const mockFlyTo = jest.fn();
const mockGetCanvas = jest.fn(() => ({ style: { cursor: "" } }));
const mockGetSource = jest.fn(() => ({
  getClusterExpansionZoom: jest.fn().mockResolvedValue(15),
}));

jest.mock("react-map-gl/maplibre", () => {
  const React = jest.requireActual("react") as typeof import("react");

  const ReactMapGL = React.forwardRef<unknown, Record<string, unknown>>(
    (props, ref) => {
      lastMapProps = props;
      React.useImperativeHandle(ref, () => ({
        flyTo: mockFlyTo,
        getCanvas: mockGetCanvas,
        getSource: mockGetSource,
      }));
      React.useEffect(() => {
        (props.onLoad as (() => void) | undefined)?.();
      }, [props.onLoad]);

      return <div data-testid="react-map">{props.children as React.ReactNode}</div>;
    }
  );
  ReactMapGL.displayName = "MockReactMapGL";

  return {
    __esModule: true,
    default: ReactMapGL,
    Marker: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="marker">{children}</div>
    ),
    Popup: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="popup">{children}</div>
    ),
    Source: ({
      id,
      cluster,
      children,
    }: {
      id: string;
      cluster?: boolean;
      children: React.ReactNode;
    }) => (
      <div data-testid={`source-${id}`} data-cluster={String(!!cluster)}>
        {children}
      </div>
    ),
    Layer: ({ id }: { id: string }) => <div data-testid={`layer-${id}`} />,
  };
});

jest.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
jest.mock("@/components/map/fixMarkerA11y", () => ({
  fixMarkerWrapperRole: jest.fn(),
}));

function makePois(count: number): POI[] {
  return Array.from({ length: count }, (_, index) => ({
    placeId: `place-${index}`,
    name: `Place ${index}`,
    lat: 37.77 + index * 0.001,
    lng: -122.42 + index * 0.001,
    distanceMiles: index / 10,
    walkMins: index + 1,
  }));
}

describe("NeighborhoodMap clustering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastMapProps = {};
  });

  it("does not render duplicate DOM POI markers in cluster mode", () => {
    render(<NeighborhoodMap center={{ lat: 37.77, lng: -122.42 }} pois={makePois(15)} />);

    expect(screen.getByTestId("source-pois")).toHaveAttribute(
      "data-cluster",
      "true"
    );
    expect(screen.getByTestId("layer-poi-unclustered")).toBeInTheDocument();
    expect(screen.getAllByTestId("marker")).toHaveLength(1);
  });

  it("selects unclustered point features from the cluster source", () => {
    const onPoiClick = jest.fn();
    render(
      <NeighborhoodMap
        center={{ lat: 37.77, lng: -122.42 }}
        pois={makePois(15)}
        onPoiClick={onPoiClick}
      />
    );

    act(() => {
      (lastMapProps.onClick as (event: unknown) => void)?.({
        features: [
          {
            properties: { placeId: "place-3" },
            geometry: { type: "Point", coordinates: [-122.417, 37.773] },
          },
        ],
      });
    });

    expect(onPoiClick).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: "place-3" })
    );
  });
});
