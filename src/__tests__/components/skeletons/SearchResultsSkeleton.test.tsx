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
    }

    // The skeleton must mirror the real results layout to avoid a layout shift
    // on load: a multi-column auto-fit grid of vertical cards (not a single
    // column of horizontal rows). See M-08 in docs/search-feature-audit-2026-06-16.md.
    const list = screen.getByTestId("search-loading-listing-list");
    expect(list).toHaveClass(
      "sm:grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))]"
    );
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
