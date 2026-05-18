import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ProfileWarningBanner from "@/app/listings/create/ProfileWarningBanner";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("ProfileWarningBanner", () => {
  it("shows incomplete-profile guidance and dismisses cleanly", () => {
    render(<ProfileWarningBanner percentage={45} missing={["Bio", "Photo"]} />);

    expect(
      screen.getByText(/complete your profile for better results/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/profile 45% complete/i)).toBeInTheDocument();
    expect(screen.getByText("Bio")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /complete profile/i })
    ).toHaveAttribute("href", "/profile/edit");

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(
      screen.queryByText(/complete your profile for better results/i)
    ).not.toBeInTheDocument();
  });

  it("does not render once the profile reaches the create-listing threshold", () => {
    render(<ProfileWarningBanner percentage={60} missing={[]} />);

    expect(
      screen.queryByText(/complete your profile for better results/i)
    ).not.toBeInTheDocument();
  });
});
