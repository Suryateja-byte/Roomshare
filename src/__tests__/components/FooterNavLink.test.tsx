import { render, screen } from "@testing-library/react";
import FooterNavLink from "@/components/FooterNavLink";

// Mock next/navigation — control usePathname return value
let mockPathname = "/";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

// Mock next/link
jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

describe("FooterNavLink", () => {
  beforeEach(() => {
    mockPathname = "/";
  });

  it("renders a link with the correct href and children", () => {
    render(<FooterNavLink href="/search">Browse</FooterNavLink>);
    const link = screen.getByRole("link", { name: "Browse" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/search");
  });

  it('applies aria-current="page" when pathname matches href', () => {
    mockPathname = "/search";
    render(<FooterNavLink href="/search">Browse</FooterNavLink>);
    const link = screen.getByRole("link", { name: "Browse" });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("does not apply aria-current when pathname does not match href", () => {
    mockPathname = "/about";
    render(<FooterNavLink href="/search">Browse</FooterNavLink>);
    const link = screen.getByRole("link", { name: "Browse" });
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("applies active styling when pathname matches", () => {
    mockPathname = "/about";
    render(
      <FooterNavLink
        href="/about"
        className="hover:text-zinc-900 transition-colors"
      >
        About
      </FooterNavLink>
    );
    const link = screen.getByRole("link", { name: "About" });
    expect(link.className).toContain("text-zinc-900");
    expect(link.className).toContain("dark:text-white");
  });

  it("does not apply active styling when pathname differs", () => {
    mockPathname = "/";
    render(
      <FooterNavLink
        href="/about"
        className="hover:text-zinc-900 transition-colors"
      >
        About
      </FooterNavLink>
    );
    const link = screen.getByRole("link", { name: "About" });
    expect(link.className).not.toContain("dark:text-white");
  });

  it("passes through custom className", () => {
    render(
      <FooterNavLink href="/search" className="my-custom-class">
        Browse
      </FooterNavLink>
    );
    const link = screen.getByRole("link", { name: "Browse" });
    expect(link.className).toContain("my-custom-class");
  });
});
