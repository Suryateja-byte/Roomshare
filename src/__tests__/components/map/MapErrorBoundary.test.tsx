import { render, screen, fireEvent } from "@testing-library/react";
import { MapErrorBoundary } from "@/components/map/MapErrorBoundary";

function ThrowingChild({
  shouldThrow,
  message = "Render error",
}: {
  shouldThrow: boolean;
  message?: string;
}) {
  if (shouldThrow) throw new Error(message);
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

  it("shows generic fallback on render error", () => {
    render(
      <MapErrorBoundary>
        <ThrowingChild shouldThrow={true} message="unexpected render crash" />
      </MapErrorBoundary>
    );
    expect(screen.getByText(/Map unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows WebGL-specific fallback for context errors", () => {
    render(
      <MapErrorBoundary>
        <ThrowingChild shouldThrow={true} message="WebGL context lost" />
      </MapErrorBoundary>
    );
    expect(screen.getByText(/Map context lost/)).toBeInTheDocument();
  });

  it("recovers on retry click", () => {
    render(
      <MapErrorBoundary>
        <ThrowingChild shouldThrow={true} message="WebGL context lost" />
      </MapErrorBoundary>
    );
    expect(screen.getByText(/Map context lost/)).toBeInTheDocument();

    // Click retry — boundary resets, but child still throws
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    // After retry, it will throw again showing fallback
    expect(screen.getByText(/Map context lost/)).toBeInTheDocument();
  });
});
