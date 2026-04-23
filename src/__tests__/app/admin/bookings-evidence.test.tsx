import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";

const mockRedirect = jest.fn((destination: string) => {
  throw new Error(`REDIRECT:${destination}`);
});
const mockNotFound = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const mockGetAdminBookingList = jest.fn();
const mockGetAdminBookingEvidence = jest.fn();

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

jest.mock("next/navigation", () => ({
  redirect: (destination: string) => mockRedirect(destination),
  notFound: () => mockNotFound(),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    listing: {
      count: jest.fn(),
    },
    verificationRequest: {
      count: jest.fn(),
    },
    report: {
      count: jest.fn(),
    },
    booking: {
      count: jest.fn(),
    },
    message: {
      count: jest.fn(),
    },
  },
}));

jest.mock("@/lib/bookings/admin-evidence", () => ({
  ADMIN_BOOKINGS_PAGE_SIZE: 50,
  ADMIN_BOOKING_STATUSES: [
    "PENDING",
    "ACCEPTED",
    "REJECTED",
    "CANCELLED",
    "HELD",
    "EXPIRED",
  ],
  ADMIN_BOOKING_AVAILABILITY_SOURCES: [
    "LEGACY_BOOKING",
    "HOST_MANAGED",
  ],
  getAdminBookingList: (...args: unknown[]) => mockGetAdminBookingList(...args),
  getAdminBookingEvidence: (...args: unknown[]) =>
    mockGetAdminBookingEvidence(...args),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AdminDashboard from "@/app/admin/page";
import AdminBookingsPage from "@/app/admin/bookings/page";
import AdminBookingDetailPage from "@/app/admin/bookings/[id]/page";

describe("Admin booking evidence pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "admin-1" },
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true });
    (prisma.user.count as jest.Mock).mockImplementation(
      ({ where }: { where?: { isVerified?: boolean } } = {}) =>
        Promise.resolve(where?.isVerified ? 12 : 100)
    );
    (prisma.listing.count as jest.Mock).mockImplementation(
      ({ where }: { where?: { status?: string } } = {}) =>
        Promise.resolve(where?.status === "ACTIVE" ? 40 : 55)
    );
    (prisma.verificationRequest.count as jest.Mock).mockResolvedValue(3);
    (prisma.report.count as jest.Mock).mockResolvedValue(6);
    (prisma.booking.count as jest.Mock).mockResolvedValue(22);
    (prisma.message.count as jest.Mock).mockResolvedValue(71);
  });

  it("redirects unauthenticated admins away from the bookings index", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    await expect(
      AdminBookingsPage({
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("REDIRECT:/login?callbackUrl=/admin/bookings");
  });

  it("loads the bookings index with parsed filters and read-only evidence links", async () => {
    mockGetAdminBookingList.mockResolvedValue({
      bookings: [
        {
          id: "booking-1",
          status: "ACCEPTED",
          availabilitySource: "HOST_MANAGED",
          listing: {
            id: "listing-1",
            title: "Loft room",
            owner: {
              id: "host-1",
              name: "Host One",
              email: "host1@example.com",
            },
          },
          tenant: {
            id: "tenant-1",
            name: "Tenant One",
            email: "tenant1@example.com",
          },
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          endDate: new Date("2026-06-01T00:00:00.000Z"),
          totalPrice: 3200,
          slotsRequested: 2,
          createdAt: new Date("2026-03-15T18:30:00.000Z"),
        },
      ],
      total: 51,
      page: 2,
      pageSize: 50,
      totalPages: 2,
    });

    render(
      await AdminBookingsPage({
        searchParams: Promise.resolve({
          page: "2",
          status: "ACCEPTED",
          availabilitySource: "HOST_MANAGED",
          listingId: "listing-1",
          tenantId: "tenant-1",
          q: "host1@example.com",
        }),
      })
    );

    expect(mockGetAdminBookingList).toHaveBeenCalledWith({
      page: 2,
      status: "ACCEPTED",
      availabilitySource: "HOST_MANAGED",
      listingId: "listing-1",
      tenantId: "tenant-1",
      q: "host1@example.com",
    });
    expect(screen.getByDisplayValue("host1@example.com")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 51 bookings")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2 · 50 per page")).toBeInTheDocument();
    expect(screen.getByText("Loft room")).toBeInTheDocument();
    expect(screen.getByText("Host One")).toBeInTheDocument();
    expect(screen.getByText("Tenant One")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Loft room" })
    ).toHaveAttribute("href", "/listings/listing-1");
    expect(
      screen.getByRole("link", { name: "View evidence" })
    ).toHaveAttribute("href", "/admin/bookings/booking-1");
  });

  it("renders the booking detail timeline with deleted-account fallback", async () => {
    mockGetAdminBookingEvidence.mockResolvedValue({
      id: "booking-1",
      status: "REJECTED",
      availabilitySource: "LEGACY_BOOKING",
      listing: {
        id: "listing-1",
        title: "Garden suite",
        owner: {
          id: "host-1",
          name: "Host One",
          email: "host1@example.com",
        },
      },
      tenant: null,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-05-01T00:00:00.000Z"),
      totalPrice: 1500,
      slotsRequested: 1,
      createdAt: new Date("2026-03-01T12:00:00.000Z"),
      updatedAt: new Date("2026-03-02T12:00:00.000Z"),
      version: 4,
      heldUntil: new Date("2026-03-01T13:00:00.000Z"),
      rejectionReason: "Docs missing",
      auditEntries: [
        {
          id: "audit-1",
          action: "REJECTED",
          previousStatus: "PENDING",
          newStatus: "REJECTED",
          actorType: "SYSTEM",
          details: {
            slotsRequested: 1,
            version: 4,
            extraNote: "Escalated for review",
          },
          createdAt: new Date("2026-03-02T12:00:00.000Z"),
        },
      ],
    });

    render(
      await AdminBookingDetailPage({
        params: Promise.resolve({ id: "booking-1" }),
      })
    );

    expect(screen.getByText("Booking Summary")).toBeInTheDocument();
    expect(screen.getByText("Garden suite")).toBeInTheDocument();
    expect(screen.getByText("Deleted account")).toBeInTheDocument();
    expect(screen.getByText("Docs missing")).toBeInTheDocument();
    expect(screen.getByText("Audit Timeline")).toBeInTheDocument();
    expect(screen.getByText("Actor: System")).toBeInTheDocument();
    expect(screen.getByText("slotsRequested")).toBeInTheDocument();
    expect(screen.getByText(/Escalated for review/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /accept|reject|cancel/i })
    ).not.toBeInTheDocument();
  });

  it("returns notFound for an unknown booking evidence page", async () => {
    mockGetAdminBookingEvidence.mockResolvedValue(null);

    await expect(
      AdminBookingDetailPage({
        params: Promise.resolve({ id: "missing-booking" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("adds bookings as an admin dashboard quick action", async () => {
    render(await AdminDashboard());

    expect(screen.getByText("Total Bookings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bookings/i })).toHaveAttribute(
      "href",
      "/admin/bookings"
    );
  });
});
