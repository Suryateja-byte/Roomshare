import { render, screen } from "@testing-library/react";
import {
  ListingCardSkeleton,
  ListingGridSkeleton,
} from "@/components/skeletons/ListingCardSkeleton";

describe("ListingCardSkeleton", () => {
  it("matches the live listing-card shell geometry", () => {
    render(<ListingCardSkeleton />);

    const skeleton = screen.getByTestId("listing-card-skeleton");
    expect(skeleton).toHaveClass("rounded-2xl");
    expect(skeleton).toHaveClass("shadow-sm");
    expect(skeleton).toHaveClass("mb-4");

    const imageShell = skeleton.querySelector(".aspect-\\[4\\/3\\]");
    expect(imageShell).not.toBeNull();
  });

  it("renders the search results grid spacing contract", () => {
    render(<ListingGridSkeleton count={3} />);

    const grid = screen.getByTestId("listing-card-skeleton-grid");
    expect(grid).toHaveClass("gap-5");
    expect(grid).toHaveClass("sm:gap-x-6");
    expect(grid).toHaveClass("sm:gap-y-9");
    expect(screen.getAllByTestId("listing-card-skeleton")).toHaveLength(3);
  });
});
