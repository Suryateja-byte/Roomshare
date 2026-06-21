/**
 * Tests for the accessible DatePicker (grid semantics, names, keyboard nav).
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DatePicker } from "@/components/ui/date-picker";

// A fixed selected date keeps the calendar deterministic regardless of "today".
// minDate is far in the past so no day is disabled.
function renderPicker(props: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onChange = jest.fn();
  render(
    <DatePicker
      value="2026-06-15"
      minDate="2020-01-01"
      onChange={onChange}
      aria-label="Move-in date"
      {...props}
    />
  );
  return { onChange };
}

function openCalendar() {
  fireEvent.click(screen.getByRole("button", { name: /move-in date/i }));
  return screen.getByRole("grid");
}

describe("DatePicker accessibility", () => {
  it("exposes a labelled grid with weekday column headers", () => {
    renderPicker();
    const grid = openCalendar();

    expect(grid).toHaveAccessibleName(/june 2026/i);
    for (const weekday of [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]) {
      expect(
        within(grid).getByRole("columnheader", { name: weekday })
      ).toBeInTheDocument();
    }
  });

  it("gives each day a full, localized accessible name", () => {
    renderPicker();
    const grid = openCalendar();

    // June 15, 2026 is a Monday.
    expect(
      within(grid).getByRole("button", { name: "Monday, June 15, 2026" })
    ).toBeInTheDocument();
  });

  it("marks the selected day with aria-selected on its gridcell", () => {
    renderPicker();
    const grid = openCalendar();

    const selectedButton = within(grid).getByRole("button", {
      name: "Monday, June 15, 2026",
    });
    expect(selectedButton.closest('[role="gridcell"]')).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("keeps exactly one day in the roving tab sequence", () => {
    renderPicker();
    const grid = openCalendar();

    const tabbable = within(grid)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute("data-date", "2026-06-15");
  });

  it("moves the roving day with arrow keys", () => {
    renderPicker();
    const grid = openCalendar();

    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(grid.querySelector('[data-roving="true"]')).toHaveAttribute(
      "data-date",
      "2026-06-16"
    );

    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(grid.querySelector('[data-roving="true"]')).toHaveAttribute(
      "data-date",
      "2026-06-23"
    );
  });

  it("clamps PageUp to the last valid day of the target month", () => {
    renderPicker({ value: "2026-03-31" });
    const grid = openCalendar();

    fireEvent.keyDown(grid, { key: "PageUp" });

    // March 31 → February (28 days in 2026) clamps to Feb 28, not an overflow.
    expect(screen.getByRole("grid")).toHaveAccessibleName(/february 2026/i);
    expect(
      screen.getByRole("grid").querySelector('[data-roving="true"]')
    ).toHaveAttribute("data-date", "2026-02-28");
  });

  it("crosses the month boundary when navigating past the end of the month", () => {
    renderPicker({ value: "2026-06-30" });
    const grid = openCalendar();

    fireEvent.keyDown(grid, { key: "ArrowRight" });

    // The visible month should now be July 2026 with July 1 holding focus.
    expect(screen.getByRole("grid")).toHaveAccessibleName(/july 2026/i);
    expect(
      screen.getByRole("grid").querySelector('[data-roving="true"]')
    ).toHaveAttribute("data-date", "2026-07-01");
  });
});
