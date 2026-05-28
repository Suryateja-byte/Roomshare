import { render, screen } from "@testing-library/react";
import { SearchResultsSkeleton } from "@/components/skeletons/PageSkeleton";

describe("SearchResultsSkeleton", () => {
  it("renders an accessible search loading region with stable listing rows", () => {
    render(<SearchResultsSkeleton count={3} />);

    const region = screen.getByRole("status", {
      name: /loading search results/i,
    });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveAttribute(
      "data-testid",
      "search-page-loading-skeleton"
    );

    const rows = screen.getAllByTestId("search-loading-listing-row");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveAttribute("aria-hidden", "true");
      expect(row).toHaveClass("md:grid-cols-[168px_minmax(0,1fr)]");
    }
  });

  it("uses motion-reduction classes on animated skeleton elements", () => {
    render(<SearchResultsSkeleton count={1} />);

    const row = screen.getByTestId("search-loading-listing-row");
    const reducedMotionElement = row.querySelector(
      '[class*="motion-reduce:animate-none"]'
    );
    expect(reducedMotionElement).not.toBeNull();
  });
});
