/**
 * Tests for SlotSelector component
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { SlotSelector } from "@/components/SlotSelector";

describe("SlotSelector", () => {
  const defaultProps = {
    value: 1,
    onChange: jest.fn(),
    max: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with value and max", () => {
    render(<SlotSelector {...defaultProps} />);

    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(1);
    expect(screen.getByText("5 available")).toBeInTheDocument();
  });

  it("decrement button calls onChange with value - 1", () => {
    render(<SlotSelector {...defaultProps} value={3} />);

    fireEvent.click(screen.getByLabelText("Decrease slots"));
    expect(defaultProps.onChange).toHaveBeenCalledWith(2);
  });

  it("increment button calls onChange with value + 1", () => {
    render(<SlotSelector {...defaultProps} value={3} />);

    fireEvent.click(screen.getByLabelText("Increase slots"));
    expect(defaultProps.onChange).toHaveBeenCalledWith(4);
  });

  it("decrement button is disabled when value equals min", () => {
    render(<SlotSelector {...defaultProps} value={1} min={1} />);

    expect(screen.getByLabelText("Decrease slots")).toBeDisabled();
  });

  it("increment button is disabled when value equals max", () => {
    render(<SlotSelector {...defaultProps} value={5} max={5} />);

    expect(screen.getByLabelText("Increase slots")).toBeDisabled();
  });

  it("manual input clamps to [min, max]", () => {
    render(<SlotSelector {...defaultProps} min={1} max={5} />);

    const input = screen.getByRole("spinbutton");

    // Type a value above max
    fireEvent.change(input, { target: { value: "10" } });
    expect(defaultProps.onChange).toHaveBeenCalledWith(5);

    // Type a value below min
    fireEvent.change(input, { target: { value: "0" } });
    expect(defaultProps.onChange).toHaveBeenCalledWith(1);
  });

  it("disabled state prevents interaction", () => {
    render(<SlotSelector {...defaultProps} disabled />);

    expect(screen.getByLabelText("Decrease slots")).toBeDisabled();
    expect(screen.getByLabelText("Increase slots")).toBeDisabled();
    expect(screen.getByRole("spinbutton")).toBeDisabled();
  });
});
