import { render, screen } from "@testing-library/react";
import BottomNavBar from "@/components/BottomNavBar";

let mockPathname = "/saved";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("@/lib/haptics", () => ({
  triggerLightHaptic: jest.fn(),
}));

jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

describe("BottomNavBar", () => {
  beforeEach(() => {
    mockPathname = "/saved";
  });

  it.each([
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify",
  ])("does not render on auth route %s", (pathname) => {
    mockPathname = pathname;

    render(<BottomNavBar />);

    expect(
      screen.queryByRole("navigation", { name: "Mobile navigation" })
    ).not.toBeInTheDocument();
  });

  it("renders on standard app routes", () => {
    mockPathname = "/saved";

    render(<BottomNavBar />);

    expect(
      screen.getByRole("navigation", { name: "Mobile navigation" })
    ).toBeInTheDocument();
  });
});
