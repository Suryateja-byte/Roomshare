import { render, screen } from "@testing-library/react";
import { SlotBadge } from "@/components/listings/SlotBadge";

describe("SlotBadge", () => {
  // -- 5 display states --

  it('shows "Available" for single-slot available', () => {
    render(<SlotBadge availableSlots={1} totalSlots={1} />);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it('shows "Filled" for single-slot filled', () => {
    render(<SlotBadge availableSlots={0} totalSlots={1} />);
    expect(screen.getByText("Filled")).toBeInTheDocument();
  });

  it('shows "All N open" when all multi-slots available', () => {
    render(<SlotBadge availableSlots={3} totalSlots={3} />);
    expect(screen.getByText("All 3 open")).toBeInTheDocument();
  });

  it('shows "X of Y open" for multi-slot partial', () => {
    render(<SlotBadge availableSlots={2} totalSlots={4} />);
    expect(screen.getByText("2 of 4 open")).toBeInTheDocument();
  });

  it('shows "Filled" for multi-slot all filled', () => {
    render(<SlotBadge availableSlots={0} totalSlots={3} />);
    expect(screen.getByText("Filled")).toBeInTheDocument();
  });

  // -- Edge cases --

  it("clamps availableSlots to totalSlots when over", () => {
    render(<SlotBadge availableSlots={5} totalSlots={3} />);
    // 5 clamped to 3 → "All 3 open"
    expect(screen.getByText("All 3 open")).toBeInTheDocument();
  });

  it("clamps negative availableSlots to 0", () => {
    render(<SlotBadge availableSlots={-2} totalSlots={3} />);
    expect(screen.getByText("Filled")).toBeInTheDocument();
  });

  it("treats totalSlots < 1 as single-slot", () => {
    render(<SlotBadge availableSlots={1} totalSlots={0} />);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("treats totalSlots=0, availableSlots=0 as single-slot filled", () => {
    render(<SlotBadge availableSlots={0} totalSlots={0} />);
    expect(screen.getByText("Filled")).toBeInTheDocument();
  });

  // -- Overlay mode --

  it("applies neutral glass bg + rounded-lg in overlay mode", () => {
    render(<SlotBadge availableSlots={1} totalSlots={1} overlay />);
    const badge = screen.getByTestId("slot-badge");
    expect(badge.className).toContain("bg-surface-container-lowest/90");
    expect(badge.className).toContain("backdrop-blur-sm");
    expect(badge.className).toContain("rounded-lg");
  });

  it("applies green text color for available overlay", () => {
    render(<SlotBadge availableSlots={1} totalSlots={1} overlay />);
    const badge = screen.getByTestId("slot-badge");
    expect(badge.className).toContain("text-green-700");
  });

  it("applies blue text color for partial overlay", () => {
    render(<SlotBadge availableSlots={1} totalSlots={3} overlay />);
    const badge = screen.getByTestId("slot-badge");
    expect(badge.className).toContain("text-blue-700");
  });

  it("applies red text color for filled overlay", () => {
    render(<SlotBadge availableSlots={0} totalSlots={1} overlay />);
    const badge = screen.getByTestId("slot-badge");
    expect(badge.className).toContain("text-red-700");
  });

  // -- Non-overlay mode --

  it("uses Badge component (rounded-full) in non-overlay mode", () => {
    render(<SlotBadge availableSlots={1} totalSlots={1} />);
    const badge = screen.getByTestId("slot-badge");
    expect(badge.className).toContain("rounded-full");
    expect(badge.className).not.toContain("backdrop-blur");
  });

  // -- className passthrough --

  it("passes custom className", () => {
    render(<SlotBadge availableSlots={1} totalSlots={1} className="mt-2" />);
    const badge = screen.getByTestId("slot-badge");
    expect(badge.className).toContain("mt-2");
  });
});
