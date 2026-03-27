/**
 * Tests for HoldCountdown component — countdown timer for HELD bookings.
 */

import { render, screen, act } from "@testing-library/react";
import HoldCountdown from "@/components/bookings/HoldCountdown";

describe("HoldCountdown", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders countdown for active hold", () => {
    const heldUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
    render(<HoldCountdown heldUntil={heldUntil} />);

    // Should show approximately 10:00 or 9:59
    expect(screen.getByText(/\d+:\d{2}/)).toBeInTheDocument();
  });

  it('renders "Hold expired" when heldUntil is in the past', () => {
    const heldUntil = new Date(Date.now() - 1000).toISOString(); // already expired
    render(<HoldCountdown heldUntil={heldUntil} />);

    expect(screen.getByText("Hold expired")).toBeInTheDocument();
  });

  it("calls onExpired when countdown reaches zero", () => {
    const onExpired = jest.fn();
    // 3 seconds from now
    const heldUntil = new Date(Date.now() + 3000).toISOString();
    render(<HoldCountdown heldUntil={heldUntil} onExpired={onExpired} />);

    expect(onExpired).not.toHaveBeenCalled();

    // Advance 4 seconds
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("shows green color when more than 50% TTL remains", () => {
    const heldUntil = new Date(Date.now() + 12 * 60 * 1000).toISOString(); // 12 min of 15 min TTL
    const { container } = render(
      <HoldCountdown heldUntil={heldUntil} holdTtlMinutes={15} />
    );

    const span = container.querySelector("span");
    expect(span?.className).toContain("green");
  });

  it("shows amber color when between 2min and 50% TTL", () => {
    const heldUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min of 15 min TTL
    const { container } = render(
      <HoldCountdown heldUntil={heldUntil} holdTtlMinutes={15} />
    );

    const span = container.querySelector("span");
    expect(span?.className).toContain("amber");
  });

  it("shows red+pulse when less than 2 minutes remain", () => {
    const heldUntil = new Date(Date.now() + 60 * 1000).toISOString(); // 1 min left
    const { container } = render(
      <HoldCountdown heldUntil={heldUntil} holdTtlMinutes={15} />
    );

    const span = container.querySelector("span");
    expect(span?.className).toContain("red");
    expect(span?.className).toContain("pulse");
  });

  it("shows muted color for expired hold", () => {
    const heldUntil = new Date(Date.now() - 1000).toISOString();
    const { container } = render(<HoldCountdown heldUntil={heldUntil} />);

    const span = container.querySelector("span");
    expect(span?.className).toContain("text-on-surface-variant");
  });

  it("updates countdown every second", () => {
    const heldUntil = new Date(Date.now() + 65 * 1000).toISOString(); // 65 seconds
    render(<HoldCountdown heldUntil={heldUntil} />);

    // Should show 1:05 initially
    expect(screen.getByText("1:05")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Should now show 1:04
    expect(screen.getByText("1:04")).toBeInTheDocument();
  });
});
