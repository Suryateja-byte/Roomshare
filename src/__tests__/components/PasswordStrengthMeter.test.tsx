import { render, screen } from "@testing-library/react";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";

describe("PasswordStrengthMeter", () => {
  it("renders a placeholder div when password is empty to reserve layout space", () => {
    const { container } = render(<PasswordStrengthMeter password="" />);
    const placeholder = container.firstChild as HTMLElement;
    expect(placeholder).not.toBeNull();
    expect(placeholder.tagName).toBe("DIV");
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(placeholder.className).toContain("min-h-[7.5rem]");
  });

  it("has role=progressbar with correct aria attributes", () => {
    render(<PasswordStrengthMeter password="weakpass" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(bar).toHaveAttribute("aria-valuenow");
    expect(bar).toHaveAttribute("aria-label", "Password strength");
  });

  it("has aria-live polite for screen reader announcements", () => {
    render(<PasswordStrengthMeter password="Test123!" />);
    const liveRegion = document.querySelector("[aria-live='polite']");
    expect(liveRegion).toBeInTheDocument();
  });

  it("shows Strong when all criteria met", () => {
    render(<PasswordStrengthMeter password="MyStr0ng!Pass" />);
    expect(screen.getByText("Strong")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "5");
  });
});
