import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "@/components/ui/date-picker";

function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

describe("DatePicker", () => {
  it("opens the inline calendar below the trigger and selects a date", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const today = new Date();
    const expectedDate = formatLocalDate(
      new Date(today.getFullYear(), today.getMonth(), 15)
    );

    render(
      <DatePicker
        id="move-date"
        value=""
        onChange={onChange}
        placeholder="Select move-in date"
        minDate="2000-01-01"
        calendarMode="inline"
      />
    );

    const trigger = screen.getByRole("button", {
      name: /select move-in date/i,
    });
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded"));

    await user.click(trigger);

    const calendar = document.getElementById("move-date-calendar");
    expect(calendar).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", "move-date-calendar");

    await user.click(
      within(calendar as HTMLElement).getByRole("button", { name: "15" })
    );

    expect(onChange).toHaveBeenCalledWith(expectedDate);
    expect(
      document.getElementById("move-date-calendar")
    ).not.toBeInTheDocument();
  });

  it("keeps inline Clear and Today actions working", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const today = formatLocalDate(new Date());

    render(
      <DatePicker
        id="move-date"
        value="2026-05-15"
        onChange={onChange}
        minDate="2000-01-01"
        calendarMode="inline"
      />
    );

    const trigger = screen.getByRole("button", { name: /may 15, 2026/i });
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded"));

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith("");

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenLastCalledWith(today);
  });
});
