import { render, screen } from "@testing-library/react";
import SearchResultsMobileHeading from "@/components/search/SearchResultsMobileHeading";

describe("SearchResultsMobileHeading", () => {
  it("always renders stable heading markup and lets CSS hide it on desktop", () => {
    render(
      <SearchResultsMobileHeading total={7} locationLabel="San Francisco" />
    );

    const heading = screen.getByRole("heading", {
      name: "7 places in San Francisco",
    });

    // Regression for audit #48: the mobile heading must use a distinct id so it
    // never collides with InlineFilterStrip's desktop h1 (which uses
    // "search-results-heading-desktop"). A shared "search-results-heading" id
    // produced invalid duplicate-id HTML on desktop.
    expect(heading).toHaveAttribute("id", "search-results-heading-mobile");
    expect(heading).not.toHaveAttribute("id", "search-results-heading");
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveClass("sr-only", "md:hidden");
  });
});
