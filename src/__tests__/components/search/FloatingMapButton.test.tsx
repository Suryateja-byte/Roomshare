import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import FloatingMapButton from "@/components/search/FloatingMapButton";

const mockTriggerHaptic = jest.fn();

jest.mock("framer-motion", () => ({
  LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  domAnimation: {},
  m: {
    button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      children: React.ReactNode;
    }) => <button {...props}>{children}</button>,
  },
}));

jest.mock("lucide-react", () => ({
  Map: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="map-icon" {...props} />
  ),
  List: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="list-icon" {...props} />
  ),
}));

jest.mock("@/lib/haptics", () => ({
  triggerHaptic: () => mockTriggerHaptic(),
}));

describe("FloatingMapButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("centers the mobile pill without translate-based positioning", () => {
    render(
      <FloatingMapButton isListMode={false} resultCount={12} onToggle={jest.fn()} />
    );

    const button = screen.getByRole("button", { name: "Show list" });

    expect(button.className).toContain("inset-x-0");
    expect(button.className).toContain("mx-auto");
    expect(button.className).toContain("w-max");
    expect(button.className).not.toContain("-translate-x-1/2");
    expect(button).toHaveTextContent("List · 12");
  });

  it("uses bottom offset for safe-area spacing in both modes", () => {
    const { rerender } = render(
      <FloatingMapButton isListMode={true} onToggle={jest.fn()} />
    );

    let button = screen.getByRole("button", { name: "Show map" });
    expect(button.getAttribute("style")).toContain("bottom:");
    expect(button.getAttribute("style")).toContain("1.5rem");
    expect(button.getAttribute("style")).toContain("safe-area-inset-bottom");
    expect(button.className).not.toContain("pb-[");

    rerender(<FloatingMapButton isListMode={false} onToggle={jest.fn()} />);

    button = screen.getByRole("button", { name: "Show list" });
    expect(button.getAttribute("style")).toContain("15dvh");
    expect(button.getAttribute("style")).toContain("1rem");
    expect(button.getAttribute("style")).toContain("safe-area-inset-bottom");
  });

  it("triggers haptics and toggles on press", () => {
    const onToggle = jest.fn();

    render(<FloatingMapButton isListMode={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: "Show list" }));

    expect(mockTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
