import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
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
    success: jest.fn(),
  },
}));

jest.mock("@/app/actions/admin", () => ({
  updateListingStatus: jest.fn(),
  deleteListing: jest.fn(),
  toggleUserAdmin: jest.fn(),
  suspendUser: jest.fn(),
}));

jest.mock("@/components/ListingMigrationReviewPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="migration-review-panel" />,
}));

jest.mock("@/components/UserAvatar", () => ({
  __esModule: true,
  default: ({ name }: { name?: string | null }) => (
    <div data-testid="user-avatar">{name ?? "Unknown"}</div>
  ),
}));

import ListingList from "@/app/admin/listings/ListingList";
import UserList from "@/app/admin/users/UserList";

describe("Admin booking navigation links", () => {
  it("links listing booking counts to the filtered admin bookings view", () => {
    render(
      <ListingList
        initialListings={[
          {
            id: "listing-1",
            title: "Loft room",
            price: 1800,
            status: "ACTIVE",
            version: 3,
            images: [],
            viewCount: 12,
            createdAt: new Date("2026-04-01T00:00:00.000Z"),
            owner: {
              id: "host-1",
              name: "Host One",
              email: "host1@example.com",
            },
            location: {
              city: "Chicago",
              state: "IL",
            },
            _count: {
              reports: 0,
              bookings: 4,
            },
          },
        ]}
        migrationReviewByListingId={{}}
        totalListings={1}
      />
    );

    expect(
      screen.getByRole("link", { name: "4 bookings" })
    ).toHaveAttribute("href", "/admin/bookings?listingId=listing-1");
  });

  it("links user booking counts to the filtered admin bookings view", () => {
    render(
      <UserList
        initialUsers={[
          {
            id: "tenant-1",
            name: "Tenant One",
            email: "tenant1@example.com",
            image: null,
            isVerified: true,
            isAdmin: false,
            isSuspended: false,
            emailVerified: new Date("2026-03-01T00:00:00.000Z"),
            _count: {
              listings: 1,
              bookings: 7,
              reviewsWritten: 2,
            },
          },
        ]}
        totalUsers={1}
        currentUserId="admin-1"
      />
    );

    expect(
      screen.getByRole("link", { name: "7 bookings" })
    ).toHaveAttribute("href", "/admin/bookings?tenantId=tenant-1");
  });
});
