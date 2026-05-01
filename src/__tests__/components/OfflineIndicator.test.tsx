import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { OfflineIndicator } from "@/components/OfflineIndicator";

const setNavigatorOnLine = (value: boolean) => {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    writable: true,
    configurable: true,
  });
};

describe("OfflineIndicator", () => {
  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  it("does not render while online", () => {
    render(<OfflineIndicator />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders above mobile bottom navigation while offline", () => {
    setNavigatorOnLine(false);

    render(<OfflineIndicator />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "You're offline. Some features may be unavailable."
    );
    expect(alert).toHaveClass(
      "bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]"
    );
    expect(alert).toHaveClass("md:bottom-0");
    expect(alert).toHaveClass("z-tooltip");
  });
});
