/**
 * Regression guard: every /admin read page must gate access through the
 * suspended-aware requireAdminAuth() helper, not a raw isAdmin check.
 *
 * Before this fix, several pages did their own
 * `prisma.user.findUnique({ select: { isAdmin: true } })` (or trusted the stale
 * JWT `session.user.isAdmin`) and never checked `isSuspended`, so a suspended
 * admin could still load admin views. These tests drive the real
 * requireAdminAuth() against a suspended admin and assert the page redirects to
 * "/". A page that skips the helper would never see the suspended flag and would
 * fall through instead of redirecting — failing this test.
 */
import "@testing-library/jest-dom";

const mockRedirect = jest.fn((destination: string) => {
  throw new Error(`REDIRECT:${destination}`);
});

jest.mock("next/navigation", () => ({
  redirect: (destination: string) => mockRedirect(destination),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

// Client child components are never rendered (the guard redirects first), but
// their modules load when the page modules import them — stub to keep load clean.
jest.mock("@/app/admin/users/UserList", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/app/admin/listings/ListingList", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/app/admin/verifications/VerificationList", () => ({
  __esModule: true,
  default: () => null,
}));

import AdminDashboard from "@/app/admin/page";
import AdminUsersPage from "@/app/admin/users/page";
import AdminListingsPage from "@/app/admin/listings/page";
import AuditLogPage from "@/app/admin/audit/page";
import VerificationsPage from "@/app/admin/verifications/page";
import AdminBookingsRedirectPage from "@/app/admin/bookings/page";
import AdminBookingDetailRedirectPage from "@/app/admin/bookings/[id]/page";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type AdminPageComponent = (props: {
  searchParams: Promise<Record<string, string>>;
}) => Promise<unknown>;

const adminPages: Array<{ name: string; Page: AdminPageComponent }> = [
  { name: "/admin (dashboard)", Page: AdminDashboard as unknown as AdminPageComponent },
  { name: "/admin/users", Page: AdminUsersPage as unknown as AdminPageComponent },
  { name: "/admin/listings", Page: AdminListingsPage as unknown as AdminPageComponent },
  { name: "/admin/audit", Page: AuditLogPage as unknown as AdminPageComponent },
  { name: "/admin/verifications", Page: VerificationsPage as unknown as AdminPageComponent },
  { name: "/admin/bookings", Page: AdminBookingsRedirectPage as unknown as AdminPageComponent },
  {
    name: "/admin/bookings/[id]",
    Page: AdminBookingDetailRedirectPage as unknown as AdminPageComponent,
  },
];

describe("admin read pages gate on suspended status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: "admin-1" } });
  });

  describe.each(adminPages)("$name", ({ Page }) => {
    it("redirects a suspended admin to /", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isAdmin: true,
        isSuspended: true,
      });

      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        "REDIRECT:/"
      );
      expect(mockRedirect).toHaveBeenCalledTimes(1);
      expect(mockRedirect).toHaveBeenCalledWith("/");
    });

    it("redirects a logged-out visitor to login", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        /^REDIRECT:\/login/
      );
    });

    it("redirects a non-admin user to /", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isAdmin: false,
        isSuspended: false,
      });

      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        "REDIRECT:/"
      );
      expect(mockRedirect).toHaveBeenCalledWith("/");
    });
  });
});
