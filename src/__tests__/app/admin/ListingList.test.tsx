import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt = "", ...props }: { alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
  },
}));

jest.mock("@/app/actions/admin", () => ({
  updateListingStatus: jest.fn(),
  deleteListing: jest.fn(),
}));

import { deleteListing } from "@/app/actions/admin";
import ListingList from "@/app/admin/listings/ListingList";

type Listing = React.ComponentProps<typeof ListingList>["initialListings"][number];

function createListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "listing-1",
    title: "Reported Listing",
    price: 1200,
    status: "ACTIVE",
    version: 3,
    images: [],
    viewCount: 7,
    createdAt: new Date("2026-04-12T12:00:00.000Z"),
    owner: {
      id: "owner-1",
      name: "Owner One",
      email: "owner@example.com",
    },
    location: { city: "Chicago", state: "IL" },
    _count: { reports: 1 },
    ...overrides,
  };
}

function renderListingList(
  overrides: Partial<React.ComponentProps<typeof ListingList>> = {}
) {
  return render(
    <ListingList
      initialListings={[createListing()]}
      totalListings={1}
      searchQuery=""
      currentStatus="all"
      currentPage={1}
      totalPages={1}
      {...overrides}
    />
  );
}

describe("Admin ListingList evidence-preserving delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows suppress copy for reported listings", () => {
    renderListingList();

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Reported Listing" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Suppress Listing" }));

    expect(
      screen.getByText(
        "This listing has reports, so it will be suppressed instead of deleted to preserve moderation evidence."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Are you sure you want to delete this listing?")
    ).not.toBeInTheDocument();
  });

  it("keeps reported listings in the all filter after suppression", async () => {
    (deleteListing as jest.Mock).mockResolvedValue({
      success: true,
      action: "suppressed",
      status: "PAUSED",
      version: 4,
    });

    renderListingList();

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Reported Listing" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Suppress Listing" }));
    fireEvent.click(screen.getByRole("button", { name: "Suppress Listing" }));

    await waitFor(() => {
      expect(screen.getByText("Reported Listing")).toBeInTheDocument();
      expect(screen.getByText("Paused")).toBeInTheDocument();
    });
    expect(deleteListing).toHaveBeenCalledWith("listing-1");
  });

  it("removes reported listings from non-paused filters after suppression", async () => {
    (deleteListing as jest.Mock).mockResolvedValue({
      success: true,
      action: "suppressed",
      status: "PAUSED",
      version: 4,
    });

    renderListingList({ currentStatus: "ACTIVE" });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Reported Listing" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Suppress Listing" }));
    fireEvent.click(screen.getByRole("button", { name: "Suppress Listing" }));

    await waitFor(() => {
      expect(screen.queryByText("Reported Listing")).not.toBeInTheDocument();
    });
    expect(
      screen.getByText("No listings found matching your criteria")
    ).toBeInTheDocument();
  });

  it("keeps hard-delete copy and removes unreported listings after delete", async () => {
    (deleteListing as jest.Mock).mockResolvedValue({
      success: true,
      action: "deleted",
    });

    renderListingList({
      initialListings: [
        createListing({
          id: "listing-2",
          title: "Clean Listing",
          _count: { reports: 0 },
        }),
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Clean Listing" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete Listing" }));

    expect(
      screen.getByText(
        "Are you sure you want to delete this listing? This action cannot be undone."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Forever" }));

    await waitFor(() => {
      expect(screen.queryByText("Clean Listing")).not.toBeInTheDocument();
    });
    expect(deleteListing).toHaveBeenCalledWith("listing-2");
  });
});
