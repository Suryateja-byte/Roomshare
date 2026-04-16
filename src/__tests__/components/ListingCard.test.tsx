import { render, screen } from "@testing-library/react";
import ListingCard from "@/components/listings/ListingCard";
import {
  useListingFocusActions,
  useIsListingFocused,
} from "@/contexts/ListingFocusContext";

jest.mock("@/contexts/ListingFocusContext", () => ({
  useListingFocusActions: jest.fn(),
  useIsListingFocused: jest.fn(),
}));

// Mock FavoriteButton
jest.mock("@/components/FavoriteButton", () => {
  return function MockFavoriteButton({
    listingId,
    initialIsSaved,
  }: {
    listingId: string;
    initialIsSaved?: boolean;
  }) {
    return (
      <button
        data-testid="favorite-button"
        data-listing-id={listingId}
        data-saved={initialIsSaved}
      >
        Favorite
      </button>
    );
  };
});

// Mock next/image
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, onError, ...props }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

jest.mock("@/components/listings/ImageCarousel", () => ({
  ImageCarousel: function MockImageCarousel({
    images,
    alt,
  }: {
    images: string[];
    alt: string;
  }) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={images[0] ?? ""} alt={alt} data-testid="listing-image" />
    );
  },
}));

const mockUseListingFocusActions = jest.mocked(useListingFocusActions);
const mockUseIsListingFocused = jest.mocked(useIsListingFocused);

function mockFocusState({
  isHovered = false,
  isActive = false,
}: {
  isHovered?: boolean;
  isActive?: boolean;
} = {}) {
  mockUseIsListingFocused.mockReturnValue({
    isHovered,
    isActive,
    isFocused: isHovered || isActive,
  });
}

const mockListing = {
  id: "listing-123",
  title: "Cozy Room in Downtown",
  price: 800,
  description: "A beautiful cozy room.",
  location: {
    city: "San Francisco",
    state: "CA",
  },
  amenities: ["WiFi", "Parking", "Laundry", "Pool"],
  availableSlots: 2,
  totalSlots: 3,
  images: ["/image1.jpg"],
  avgRating: 4.9,
  reviewCount: 5,
};

beforeEach(() => {
  mockUseListingFocusActions.mockReturnValue({
    setHovered: jest.fn(),
    setActive: jest.fn(),
    requestScrollTo: jest.fn(),
    ackScrollTo: jest.fn(),
    clearFocus: jest.fn(),
    hasProvider: false,
    focusSourceRef: { current: null },
  });
  mockFocusState();
});

describe("ListingCard", () => {
  describe("rendering", () => {
    it("renders listing title", () => {
      render(<ListingCard listing={mockListing} />);
      expect(screen.getByText("Cozy Room in Downtown")).toBeInTheDocument();
    });

    it("renders formatted price", () => {
      render(<ListingCard listing={mockListing} />);
      expect(screen.getByText("$800")).toBeInTheDocument();
      expect(screen.getByText(/\/\s*mo/i)).toBeInTheDocument();
    });

    it("renders location in the card body", () => {
      render(<ListingCard listing={mockListing} />);
      expect(screen.getByText(/San Francisco, CA/)).toBeInTheDocument();
    });

    it("renders room type with location when roomType is provided", () => {
      const listing = { ...mockListing, roomType: "Private Room" };
      render(<ListingCard listing={listing} />);
      expect(
        screen.getByText(/Private Room · San Francisco, CA/)
      ).toBeInTheDocument();
    });

    it("renders availability metadata when moveInDate and leaseDuration provided", () => {
      const listing = {
        ...mockListing,
        roomType: "Private Room",
        moveInDate: "2026-08-01",
        leaseDuration: "6_months",
      };
      render(<ListingCard listing={listing} />);
      expect(screen.getByText(/Available Aug 1/)).toBeInTheDocument();
      expect(screen.getByText(/6 mo lease/)).toBeInTheDocument();
    });

    it("shows location and availability on one line when no roomType", () => {
      const listing = {
        ...mockListing,
        moveInDate: "2026-08-01",
        leaseDuration: "6_months",
      };
      render(<ListingCard listing={listing} />);
      const el = screen.getByText(/San Francisco, CA/);
      expect(el.textContent).toContain("Available Aug 1");
      expect(el.textContent).toContain("6 mo lease");
    });

    it("renders availability badge with slot counts", () => {
      render(<ListingCard listing={mockListing} />);
      expect(screen.getByText("2 of 3 open")).toBeInTheDocument();
    });

    it("renders availability badge as Filled when no slots", () => {
      const filledListing = { ...mockListing, availableSlots: 0 };
      render(<ListingCard listing={filledListing} />);
      expect(screen.getByText("Filled")).toBeInTheDocument();
    });

    it("renders Available for single-slot listing", () => {
      const singleListing = {
        ...mockListing,
        availableSlots: 1,
        totalSlots: 1,
      };
      render(<ListingCard listing={singleListing} />);
      expect(screen.getByText("Available")).toBeInTheDocument();
    });

    it("renders FavoriteButton", () => {
      render(<ListingCard listing={mockListing} />);
      expect(screen.getByTestId("favorite-button")).toBeInTheDocument();
    });

    it("passes isSaved prop to FavoriteButton", () => {
      render(<ListingCard listing={mockListing} isSaved={true} />);
      const favoriteBtn = screen.getByTestId("favorite-button");
      expect(favoriteBtn).toHaveAttribute("data-saved", "true");
    });

    it("links to listing detail page", () => {
      render(<ListingCard listing={mockListing} />);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/listings/listing-123");
    });

    it("honors a custom listing detail href", () => {
      render(
        <ListingCard
          listing={mockListing}
          href="/listings/listing-123?startDate=2026-05-01&endDate=2026-06-01"
        />
      );

      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "/listings/listing-123?startDate=2026-05-01&endDate=2026-06-01"
      );
    });

    it("keeps the card article rounded on mobile", () => {
      render(<ListingCard listing={mockListing} />);
      const article = screen.getByTestId("listing-card");
      expect(article).toHaveClass("rounded-2xl");
      expect(article).not.toHaveClass("rounded-none");
    });

    it("marks search-feed cards with the mobile feed variant", () => {
      render(<ListingCard listing={mockListing} mobileVariant="feed" />);
      expect(screen.getByTestId("listing-card")).toHaveAttribute(
        "data-mobile-variant",
        "feed"
      );
    });
  });

  describe("price formatting", () => {
    it("formats price with comma for thousands", () => {
      const expensiveListing = { ...mockListing, price: 1500 };
      render(<ListingCard listing={expensiveListing} />);
      expect(screen.getByText("$1,500")).toBeInTheDocument();
    });

    it("shows Free for zero price", () => {
      const freeListing = { ...mockListing, price: 0 };
      render(<ListingCard listing={freeListing} />);
      expect(screen.getByText("Free")).toBeInTheDocument();
    });

    it("handles negative price", () => {
      const negativeListing = { ...mockListing, price: -100 };
      render(<ListingCard listing={negativeListing} />);
      expect(screen.getByText("$0")).toBeInTheDocument();
    });
  });

  describe("location formatting", () => {
    it("abbreviates full state names", () => {
      const listing = {
        ...mockListing,
        location: { city: "Austin", state: "Texas" },
      };
      render(<ListingCard listing={listing} />);
      expect(screen.getByText(/Austin, TX/)).toBeInTheDocument();
    });

    it("keeps state abbreviation as is", () => {
      const listing = {
        ...mockListing,
        location: { city: "Denver", state: "CO" },
      };
      render(<ListingCard listing={listing} />);
      expect(screen.getByText(/Denver, CO/)).toBeInTheDocument();
    });

    it("removes duplicate state from city", () => {
      const listing = {
        ...mockListing,
        location: { city: "Irving, TX", state: "TX" },
      };
      render(<ListingCard listing={listing} />);
      expect(screen.getByText(/Irving, TX/)).toBeInTheDocument();
      // Should not show "Irving, TX, TX"
      expect(screen.queryByText(/Irving, TX, TX/)).not.toBeInTheDocument();
    });
  });

  describe("title fallback", () => {
    it("shows Untitled Listing for empty title", () => {
      const listing = { ...mockListing, title: "" };
      render(<ListingCard listing={listing} />);
      expect(screen.getByText("Untitled Listing")).toBeInTheDocument();
    });

    it("shows Untitled Listing for whitespace title", () => {
      const listing = { ...mockListing, title: "   " };
      render(<ListingCard listing={listing} />);
      expect(screen.getByText("Untitled Listing")).toBeInTheDocument();
    });

    it("trims title whitespace", () => {
      const listing = { ...mockListing, title: "  Nice Room  " };
      render(<ListingCard listing={listing} />);
      // The component should handle trimming
      expect(screen.getByText("Nice Room")).toBeInTheDocument();
    });
  });

  describe("images", () => {
    it("renders listing image when available", () => {
      render(<ListingCard listing={mockListing} />);
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "/image1.jpg");
    });

    it("renders placeholder when no images", () => {
      const listing = { ...mockListing, images: [] };
      render(<ListingCard listing={listing} />);
      expect(screen.getByText("No Photos")).toBeInTheDocument();
    });

    it("renders placeholder when images undefined", () => {
      const listing = { ...mockListing, images: undefined };
      render(<ListingCard listing={listing} />);
      expect(screen.getByText("No Photos")).toBeInTheDocument();
    });
  });

  describe("focus state styling", () => {
    it("renders a stronger hovered state without promoting the card to active", () => {
      mockFocusState({ isHovered: true });

      render(<ListingCard listing={mockListing} />);

      const article = screen.getByTestId("listing-card");
      expect(article).toHaveAttribute("data-focus-state", "hovered");
      expect(article).toHaveClass("ring-2", "ring-primary/50", "shadow-ambient");
      expect(article).not.toHaveClass("ring-offset-2");
    });

    it("keeps the active state styling distinct from hover", () => {
      mockFocusState({ isActive: true });

      render(<ListingCard listing={mockListing} />);

      const article = screen.getByTestId("listing-card");
      expect(article).toHaveAttribute("data-focus-state", "active");
      expect(article).toHaveClass(
        "ring-2",
        "ring-primary",
        "ring-offset-2",
        "shadow-ambient-lg"
      );
      expect(article).not.toHaveClass("ring-primary/50");
    });

    it("defaults to no focus styling when neither hovered nor active", () => {
      render(<ListingCard listing={mockListing} />);

      const article = screen.getByTestId("listing-card");
      expect(article).toHaveAttribute("data-focus-state", "none");
      expect(article).not.toHaveClass("ring-primary/50", "ring-offset-2");
    });
  });

  describe("accessibility", () => {
    it("has accessible link", () => {
      render(<ListingCard listing={mockListing} />);
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });

    it("has alt text on image", () => {
      render(<ListingCard listing={mockListing} />);
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute(
        "alt",
        "Cozy Room in Downtown in San Francisco, CA"
      );
    });

    it("has rating aria-label", () => {
      render(<ListingCard listing={mockListing} />);
      const rating = screen.getByLabelText(/rating/i);
      expect(rating).toBeInTheDocument();
    });
  });

  describe("rating display", () => {
    it("displays rating value", () => {
      render(<ListingCard listing={mockListing} />);
      expect(screen.getByText("4.9")).toBeInTheDocument();
    });

    it("displays star icon", () => {
      const { container } = render(<ListingCard listing={mockListing} />);
      const starSvg = container.querySelector("svg.text-amber-400");
      expect(starSvg).toBeInTheDocument();
    });
  });

  describe("Top Rated badge", () => {
    const topRatedListing = {
      ...mockListing,
      avgRating: 4.6,
      reviewCount: 4,
    };

    it("shows Top Rated badge in default variant (avgRating=4.6, reviewCount=4)", () => {
      render(<ListingCard listing={topRatedListing} />);
      expect(screen.getByText("Top Rated")).toBeInTheDocument();
    });

    it("shows Top Rated badge in feed variant (avgRating=4.6, reviewCount=4)", () => {
      render(<ListingCard listing={topRatedListing} mobileVariant="feed" />);
      expect(screen.getByText("Top Rated")).toBeInTheDocument();
    });

    it("hides Top Rated badge when avgRating below threshold (4.3)", () => {
      const listing = { ...mockListing, avgRating: 4.3, reviewCount: 4 };
      render(<ListingCard listing={listing} />);
      expect(screen.queryByText("Top Rated")).not.toBeInTheDocument();
    });

    it("hides Top Rated badge when Guest Favorite takes priority (avgRating=4.95, reviewCount=6)", () => {
      const listing = { ...mockListing, avgRating: 4.95, reviewCount: 6 };
      render(<ListingCard listing={listing} />);
      expect(screen.queryByText("Top Rated")).not.toBeInTheDocument();
    });

    it("hides Top Rated badge when reviewCount too low (2)", () => {
      const listing = { ...mockListing, avgRating: 4.6, reviewCount: 2 };
      render(<ListingCard listing={listing} />);
      expect(screen.queryByText("Top Rated")).not.toBeInTheDocument();
    });

    it("includes 'top rated' in ariaLabel when badge is present", () => {
      render(<ListingCard listing={topRatedListing} />);
      const article = screen.getByTestId("listing-card");
      expect(article).toHaveAttribute(
        "aria-label",
        expect.stringContaining("top rated")
      );
    });

    it("does not include 'top rated' in ariaLabel when badge is absent (avgRating=4.3)", () => {
      const listing = { ...mockListing, avgRating: 4.3, reviewCount: 4 };
      render(<ListingCard listing={listing} />);
      const article = screen.getByTestId("listing-card");
      expect(article).not.toHaveAttribute(
        "aria-label",
        expect.stringContaining("top rated")
      );
    });
  });

  describe("publicAvailability prop path (CFM-603)", () => {
    it("prefers publicAvailability.openSlots over legacy availableSlots in slot badge", () => {
      const listing = {
        ...mockListing,
        availableSlots: 99,
        totalSlots: 99,
        publicAvailability: {
          availabilitySource: "HOST_MANAGED" as const,
          openSlots: 1,
          totalSlots: 3,
          availableFrom: "2026-05-01",
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: "2026-04-01T00:00:00Z",
          publicStatus: "AVAILABLE" as const,
          freshnessBucket: "NORMAL" as const,
        },
      };
      render(<ListingCard listing={listing} />);
      expect(screen.getByTestId("slot-badge")).toHaveTextContent("1 of 3 open");
    });

    it("renders 'Needs reconfirmation' on stale host-managed listings", () => {
      const listing = {
        ...mockListing,
        publicAvailability: {
          availabilitySource: "HOST_MANAGED" as const,
          openSlots: 2,
          totalSlots: 3,
          availableFrom: "2026-05-01",
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: "2025-12-01T00:00:00Z",
          publicStatus: "NEEDS_RECONFIRMATION" as const,
          freshnessBucket: "STALE" as const,
        },
      };
      render(<ListingCard listing={listing} />);
      expect(screen.getByTestId("slot-badge")).toHaveTextContent(
        /needs reconfirmation/i
      );
    });

    it("renders 'Full' when publicStatus=FULL", () => {
      const listing = {
        ...mockListing,
        availableSlots: 0,
        totalSlots: 3,
        publicAvailability: {
          availabilitySource: "HOST_MANAGED" as const,
          openSlots: 0,
          totalSlots: 3,
          availableFrom: null,
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: "2026-04-01T00:00:00Z",
          publicStatus: "FULL" as const,
          freshnessBucket: "NORMAL" as const,
        },
      };
      render(<ListingCard listing={listing} />);
      expect(screen.getByTestId("slot-badge")).toHaveTextContent(/full/i);
    });

    it("renders 'Closed' when publicStatus=CLOSED (statusReason=AVAILABLE_UNTIL_PASSED)", () => {
      const listing = {
        ...mockListing,
        publicAvailability: {
          availabilitySource: "HOST_MANAGED" as const,
          openSlots: 0,
          totalSlots: 3,
          availableFrom: null,
          availableUntil: "2025-12-31",
          minStayMonths: 1,
          lastConfirmedAt: "2026-04-01T00:00:00Z",
          publicStatus: "CLOSED" as const,
          freshnessBucket: "NORMAL" as const,
        },
      };
      render(<ListingCard listing={listing} />);
      expect(screen.getByTestId("slot-badge")).toHaveTextContent(/closed/i);
    });

    it("prefers publicAvailability.availableFrom over legacy moveInDate", () => {
      const listing = {
        ...mockListing,
        moveInDate: "2025-01-01",
        publicAvailability: {
          availabilitySource: "HOST_MANAGED" as const,
          openSlots: 2,
          totalSlots: 3,
          availableFrom: "2026-06-15",
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: "2026-04-01T00:00:00Z",
          publicStatus: "AVAILABLE" as const,
          freshnessBucket: "NORMAL" as const,
        },
      };
      render(<ListingCard listing={listing} />);
      // "Available Jun 15" derives from publicAvailability.availableFrom,
      // not from moveInDate=2025-01-01.
      expect(
        screen.getByText(/available jun 15/i)
      ).toBeInTheDocument();
    });

    it("aria-label slot count derives from publicAvailability when present", () => {
      const listing = {
        ...mockListing,
        availableSlots: 99,
        totalSlots: 99,
        publicAvailability: {
          availabilitySource: "HOST_MANAGED" as const,
          openSlots: 2,
          totalSlots: 4,
          availableFrom: "2026-05-01",
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: "2026-04-01T00:00:00Z",
          publicStatus: "AVAILABLE" as const,
          freshnessBucket: "NORMAL" as const,
        },
      };
      render(<ListingCard listing={listing} />);
      const article = screen.getByTestId("listing-card");
      expect(article).toHaveAttribute(
        "aria-label",
        expect.stringContaining("2 of 4 spots available")
      );
    });
  });
});
