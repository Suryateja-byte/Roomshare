import { render, screen, fireEvent } from "@testing-library/react";
import { MapErrorBoundary } from "@/components/map/MapErrorBoundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("WebGL context lost");
  return <div>Map loaded</div>;
}

describe("MapErrorBoundary", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders children when no error", () => {
    render(
      <MapErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </MapErrorBoundary>
    );
    expect(screen.getByText("Map loaded")).toBeInTheDocument();
  });

  it("shows fallback on render error", () => {
    render(
      <MapErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </MapErrorBoundary>
    );
    expect(screen.getByText(/Map unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("recovers on retry click", () => {
    render(
      <MapErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </MapErrorBoundary>
    );
    expect(screen.getByText(/Map unavailable/)).toBeInTheDocument();

    // Click retry — boundary resets, but child still throws
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    // After retry, it will throw again showing fallback
    expect(screen.getByText(/Map unavailable/)).toBeInTheDocument();
  });
});
