import { render, screen } from "@testing-library/react";
import { MapGestureHint } from "@/components/map/MapGestureHint";

const STORAGE_KEY = "roomshare-map-hints-seen";

// jsdom has no Touch Events support; the hint only shows when `"ontouchstart" in window`.
const touchWindow = window as Window & { ontouchstart?: unknown };

describe("MapGestureHint", () => {
  beforeEach(() => {
    sessionStorage.clear();
    touchWindow.ontouchstart = null; // simulate a touch device
  });

  afterEach(() => {
    delete touchWindow.ontouchstart;
    sessionStorage.clear();
  });

  it("is hidden from assistive tech and is not a live region", () => {
    const { container } = render(<MapGestureHint />);

    // Still rendered visually for sighted touch users...
    expect(screen.getByText("Pinch to zoom")).toBeInTheDocument();

    // ...but the transient visual nudge must not announce via a live region.
    const hint = container.querySelector('[aria-hidden="true"]');
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveTextContent("Pinch to zoom");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("renders nothing when already dismissed this session", () => {
    sessionStorage.setItem(STORAGE_KEY, "1");
    const { container } = render(<MapGestureHint />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on non-touch devices", () => {
    delete touchWindow.ontouchstart;
    const { container } = render(<MapGestureHint />);
    expect(container).toBeEmptyDOMElement();
  });
});
