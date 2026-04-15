import { render, screen } from "@testing-library/react";
import { SplitStayCard } from "@/components/search/SplitStayCard";
import type { ListingData } from "@/lib/data";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ fill: _fill, ...props }: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

jest.mock("@/contexts/ListingFocusContext", () => ({
  useListingFocusState: () => ({
    hoveredId: null,
    activeId: null,
    scrollRequest: null,
    focusSource: null,
  }),
  useListingFocusActions: () => ({
    setHovered: jest.fn(),
    setActive: jest.fn(),
    requestScrollTo: jest.fn(),
    ackScrollTo: jest.fn(),
    clearFocus: jest.fn(),
    hasProvider: false,
    focusSourceRef: { current: null },
  }),
}));

function createListing(id: string, title: string, price: number): ListingData {
  return {
    id,
    title,
    description: `${title} description`,
    price,
    images: [`https://example.com/${id}.jpg`],
    availableSlots: 1,
    totalSlots: 1,
    amenities: [],
    houseRules: [],
    householdLanguages: [],
    location: {
      city: "San Francisco",
      state: "CA",
      lat: 37.7749,
      lng: -122.4194,
    },
  };
}

describe("SplitStayCard", () => {
  it("preserves the canonical detail range for both split-stay listing links", () => {
    render(
      <SplitStayCard
        pair={{
          first: createListing("listing-a", "Split Stay A", 1200),
          second: createListing("listing-b", "Split Stay B", 1400),
          combinedPrice: 5400,
          splitLabel: "2 mo + 2 mo",
        }}
        listingDetailDateParams={{
          moveInDate: "2026-05-01",
          endDate: "2026-06-01",
        }}
      />
    );

    expect(screen.getByText("Split Stay A").closest("a")).toHaveAttribute(
      "href",
      "/listings/listing-a?startDate=2026-05-01&endDate=2026-06-01"
    );
    expect(screen.getByText("Split Stay B").closest("a")).toHaveAttribute(
      "href",
      "/listings/listing-b?startDate=2026-05-01&endDate=2026-06-01"
    );
  });

  it("falls back to bare listing links when no valid range exists", () => {
    render(
      <SplitStayCard
        pair={{
          first: createListing("listing-a", "Split Stay A", 1200),
          second: createListing("listing-b", "Split Stay B", 1400),
          combinedPrice: 5400,
          splitLabel: "2 mo + 2 mo",
        }}
        listingDetailDateParams={{
          moveInDate: "2026-05-01",
        }}
      />
    );

    expect(screen.getByText("Split Stay A").closest("a")).toHaveAttribute(
      "href",
      "/listings/listing-a"
    );
    expect(screen.getByText("Split Stay B").closest("a")).toHaveAttribute(
      "href",
      "/listings/listing-b"
    );
  });
});
