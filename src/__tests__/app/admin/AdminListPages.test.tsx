import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const mockUserListProps = jest.fn();
const mockListingListProps = jest.fn();
const mockRedirect = jest.fn((destination: string) => {
  throw new Error(`REDIRECT:${destination}`);
});

jest.mock("@/app/admin/users/UserList", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockUserListProps(props);
    return <div>UserList mock</div>;
  },
}));

jest.mock("@/app/admin/listings/ListingList", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockListingListProps(props);
    return <div>ListingList mock</div>;
  },
}));

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

jest.mock("next/navigation", () => ({
  redirect: (destination: string) => mockRedirect(destination),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    listing: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import AdminListingsPage from "@/app/admin/listings/page";
import AdminUsersPage from "@/app/admin/users/page";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type UserWhere = {
  OR?: Array<{
    name?: { contains: string };
    email?: { contains: string };
  }>;
  isVerified?: boolean;
  isAdmin?: boolean;
  isSuspended?: boolean;
};

type ListingWhere = {
  OR?: Array<{
    title?: { contains: string };
    description?: { contains: string };
    owner?: {
      is?: {
        name?: { contains: string };
        email?: { contains: string };
      };
    };
  }>;
  status?: "ACTIVE" | "PAUSED" | "RENTED";
};

function createUser(index: number) {
  return {
    id: `user-${index}`,
    name: `User ${index}`,
    email: `user-${String(index).padStart(3, "0")}@example.com`,
    image: null,
    isVerified: index % 2 === 0,
    isAdmin: index % 10 === 0,
    isSuspended: index % 15 === 0,
    emailVerified: null,
    _count: { listings: index % 4, reviewsWritten: index % 3 },
  };
}

function createListing(index: number) {
  const statuses = ["ACTIVE", "PAUSED", "RENTED"] as const;
  return {
    id: `listing-${index}`,
    title: `Listing ${index}`,
    description: `Listing description ${index}`,
    price: 1000 + index,
    status: statuses[(index - 1) % statuses.length],
    version: 1,
    images: [],
    viewCount: index,
    createdAt: new Date(
      `2026-04-${String((index % 20) + 1).padStart(2, "0")}T12:00:00.000Z`
    ),
    owner: {
      id: `owner-${index}`,
      name: `Owner ${index}`,
      email: `owner-${index}@example.com`,
    },
    location: { city: "Chicago", state: "IL" },
    _count: { reports: index % 2 },
  };
}

function userSearch(where: UserWhere | undefined) {
  return (
    where?.OR?.[0]?.name?.contains ?? where?.OR?.[1]?.email?.contains ?? ""
  );
}

function listingSearch(where: ListingWhere | undefined) {
  return (
    where?.OR?.[0]?.title?.contains ??
    where?.OR?.[1]?.description?.contains ??
    where?.OR?.[2]?.owner?.is?.name?.contains ??
    where?.OR?.[3]?.owner?.is?.email?.contains ??
    ""
  );
}

describe("admin server-backed list pages", () => {
  const users = Array.from({ length: 125 }, (_, index) =>
    createUser(index + 1)
  );
  const listings = Array.from({ length: 125 }, (_, index) =>
    createListing(index + 1)
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: "admin-1" } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true });

    const filterUsers = (where?: UserWhere) => {
      const q = userSearch(where).toLowerCase();
      return users.filter((user) => {
        if (where?.isVerified && !user.isVerified) return false;
        if (where?.isAdmin && !user.isAdmin) return false;
        if (where?.isSuspended && !user.isSuspended) return false;
        if (!q) return true;
        return (
          user.name.toLowerCase().includes(q) ||
          user.email.toLowerCase().includes(q)
        );
      });
    };

    (prisma.user.count as jest.Mock).mockImplementation(
      async ({ where }: { where?: UserWhere } = {}) => filterUsers(where).length
    );
    (prisma.user.findMany as jest.Mock).mockImplementation(
      async ({
        where,
        skip = 0,
        take,
      }: {
        where?: UserWhere;
        skip?: number;
        take?: number;
      }) => {
        const filtered = filterUsers(where);
        return filtered.slice(skip, take ? skip + take : undefined);
      }
    );

    const filterListings = (where?: ListingWhere) => {
      const q = listingSearch(where).toLowerCase();
      return listings.filter((listing) => {
        if (where?.status && listing.status !== where.status) return false;
        if (!q) return true;
        return (
          listing.title.toLowerCase().includes(q) ||
          listing.description.toLowerCase().includes(q) ||
          listing.owner.name.toLowerCase().includes(q) ||
          listing.owner.email.toLowerCase().includes(q)
        );
      });
    };

    (prisma.listing.count as jest.Mock).mockImplementation(
      async ({ where }: { where?: ListingWhere } = {}) =>
        filterListings(where).length
    );
    (prisma.listing.findMany as jest.Mock).mockImplementation(
      async ({
        where,
        skip = 0,
        take,
      }: {
        where?: ListingWhere;
        skip?: number;
        take?: number;
      }) => {
        const filtered = filterListings(where);
        return filtered.slice(skip, take ? skip + take : undefined);
      }
    );
  });

  it("serves users beyond the first 100 rows with page-number pagination", async () => {
    render(
      await AdminUsersPage({
        searchParams: Promise.resolve({ page: "3" }),
      })
    );

    expect(screen.getByText("UserList mock")).toBeInTheDocument();
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        skip: 100,
        take: 50,
      })
    );
    expect(mockUserListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPage: 3,
        totalPages: 3,
        totalUsers: 125,
        initialUsers: expect.arrayContaining([
          expect.objectContaining({ id: "user-101" }),
        ]),
      })
    );
  });

  it("whitelists user filters and applies search on the server", async () => {
    render(
      await AdminUsersPage({
        searchParams: Promise.resolve({
          q: "User 120",
          filter: "admin",
          page: "2",
        }),
      })
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isAdmin: true,
          OR: expect.arrayContaining([
            { name: { contains: "User 120", mode: "insensitive" } },
            { email: { contains: "User 120", mode: "insensitive" } },
          ]),
        }),
        skip: 0,
        take: 50,
      })
    );
    expect(mockUserListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: "User 120",
        currentFilter: "admin",
        currentPage: 1,
      })
    );
  });

  it("clamps invalid user filter and page params", async () => {
    render(
      await AdminUsersPage({
        searchParams: Promise.resolve({ filter: "owner", page: "-4" }),
      })
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        skip: 0,
        take: 50,
      })
    );
    expect(mockUserListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        currentFilter: "all",
        currentPage: 1,
      })
    );
  });

  it("serves listings beyond the first 100 rows with page-number pagination", async () => {
    render(
      await AdminListingsPage({
        searchParams: Promise.resolve({ page: "3" }),
      })
    );

    expect(screen.getByText("ListingList mock")).toBeInTheDocument();
    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        skip: 100,
        take: 50,
      })
    );
    expect(mockListingListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPage: 3,
        totalPages: 3,
        totalListings: 125,
        initialListings: expect.arrayContaining([
          expect.objectContaining({ id: "listing-101" }),
        ]),
      })
    );
  });

  it("whitelists listing statuses and applies search on the server", async () => {
    render(
      await AdminListingsPage({
        searchParams: Promise.resolve({
          q: "Owner 11",
          status: "PAUSED",
          page: "2",
        }),
      })
    );

    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PAUSED",
          OR: expect.arrayContaining([
            { title: { contains: "Owner 11", mode: "insensitive" } },
            { description: { contains: "Owner 11", mode: "insensitive" } },
            {
              owner: {
                is: { name: { contains: "Owner 11", mode: "insensitive" } },
              },
            },
            {
              owner: {
                is: { email: { contains: "Owner 11", mode: "insensitive" } },
              },
            },
          ]),
        }),
        skip: 0,
        take: 50,
      })
    );
    expect(mockListingListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: "Owner 11",
        currentStatus: "PAUSED",
        currentPage: 1,
      })
    );
  });

  it("clamps invalid listing status and page params", async () => {
    render(
      await AdminListingsPage({
        searchParams: Promise.resolve({ status: "DELETED", page: "0" }),
      })
    );

    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        skip: 0,
        take: 50,
      })
    );
    expect(mockListingListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStatus: "all",
        currentPage: 1,
      })
    );
  });
});
