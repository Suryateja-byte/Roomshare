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

    expect(heading).toHaveAttribute("id", "search-results-heading");
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveClass("sr-only", "md:hidden");
  });
});
