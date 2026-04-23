import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import {
  ADMIN_BOOKINGS_PAGE_SIZE,
  ADMIN_BOOKING_AVAILABILITY_SOURCES,
  ADMIN_BOOKING_STATUSES,
  getAdminBookingList,
} from "@/lib/bookings/admin-evidence";
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import type { BookingStatus, ListingAvailabilitySource } from "@prisma/client";

export const metadata = {
  title: "Bookings Evidence | Admin | RoomShare",
  description: "Read-only booking evidence for RoomShare admins",
};

type SearchParams = Promise<{
  page?: string;
  status?: string;
  availabilitySource?: string;
  listingId?: string;
  tenantId?: string;
  q?: string;
}>;

function asQueryValue(value?: string) {
  return value?.trim() ? value.trim() : undefined;
}

function isBookingStatus(value?: string): value is BookingStatus {
  return ADMIN_BOOKING_STATUSES.includes(value as BookingStatus);
}

function isAvailabilitySource(
  value?: string
): value is ListingAvailabilitySource {
  return ADMIN_BOOKING_AVAILABILITY_SOURCES.includes(
    value as ListingAvailabilitySource
  );
}

function formatDateRange(startDate: Date, endDate: Date) {
  return `${startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} - ${endDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildPageHref(
  basePath: string,
  values: {
    page?: number;
    status?: string;
    availabilitySource?: string;
    listingId?: string;
    tenantId?: string;
    q?: string;
  }
) {
  const params = new URLSearchParams();
  const stringFields = {
    status: values.status,
    availabilitySource: values.availabilitySource,
    listingId: values.listingId,
    tenantId: values.tenantId,
    q: values.q,
  };

  if (values.page && values.page > 1) {
    params.set("page", String(values.page));
  }

  for (const [key, value] of Object.entries(stringFields)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const className =
    status === "ACCEPTED"
      ? "bg-green-100 text-green-700"
      : status === "PENDING" || status === "HELD"
        ? "bg-amber-100 text-amber-700"
        : status === "REJECTED" || status === "CANCELLED" || status === "EXPIRED"
          ? "bg-slate-100 text-slate-700"
          : "bg-surface-container-high text-on-surface";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {status}
    </span>
  );
}

function AvailabilitySourceBadge({
  availabilitySource,
}: {
  availabilitySource: ListingAvailabilitySource;
}) {
  const className =
    availabilitySource === "HOST_MANAGED"
      ? "bg-blue-100 text-blue-700"
      : "bg-purple-100 text-purple-700";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {availabilitySource}
    </span>
  );
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin/bookings");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!currentUser?.isAdmin) {
    redirect("/");
  }

  const params = await searchParams;
  const pageValue = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const status = isBookingStatus(params.status) ? params.status : undefined;
  const availabilitySource = isAvailabilitySource(params.availabilitySource)
    ? params.availabilitySource
    : undefined;
  const listingId = asQueryValue(params.listingId);
  const tenantId = asQueryValue(params.tenantId);
  const q = asQueryValue(params.q);

  const result = await getAdminBookingList({
    page,
    status,
    availabilitySource,
    listingId,
    tenantId,
    q,
  });

  const previousPageHref =
    result.page > 1
      ? buildPageHref("/admin/bookings", {
          page: result.page - 1,
          status,
          availabilitySource,
          listingId,
          tenantId,
          q,
        })
      : null;
  const nextPageHref =
    result.page < result.totalPages
      ? buildPageHref("/admin/bookings", {
          page: result.page + 1,
          status,
          availabilitySource,
          listingId,
          tenantId,
          q,
        })
      : null;

  return (
    <div className="min-h-screen bg-surface-canvas">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8">
          <Link
            href="/admin"
            className="mb-4 inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-on-surface">
                Booking Evidence
              </h1>
              <p className="text-on-surface-variant">
                Read-only legacy and host-managed booking history for admins
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-lg bg-surface-container-lowest p-4 shadow-ambient-sm">
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="flex flex-col gap-1 text-sm text-on-surface">
              Search
              <input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Booking, listing, host, tenant"
                className="rounded-lg border border-outline-variant/20 bg-surface-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-on-surface">
              Status
              <select
                name="status"
                defaultValue={status ?? ""}
                className="rounded-lg border border-outline-variant/20 bg-surface-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">All statuses</option>
                {ADMIN_BOOKING_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-on-surface">
              Availability Source
              <select
                name="availabilitySource"
                defaultValue={availabilitySource ?? ""}
                className="rounded-lg border border-outline-variant/20 bg-surface-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">All sources</option>
                {ADMIN_BOOKING_AVAILABILITY_SOURCES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-on-surface">
              Listing ID
              <input
                type="text"
                name="listingId"
                defaultValue={listingId ?? ""}
                className="rounded-lg border border-outline-variant/20 bg-surface-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-on-surface">
              Tenant ID
              <input
                type="text"
                name="tenantId"
                defaultValue={tenantId ?? ""}
                className="rounded-lg border border-outline-variant/20 bg-surface-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-lg bg-on-surface px-4 py-2 text-sm font-medium text-white"
              >
                Apply Filters
              </button>
              <Link
                href="/admin/bookings"
                className="inline-flex items-center justify-center rounded-lg border border-outline-variant/20 px-4 py-2 text-sm font-medium text-on-surface"
              >
                Reset
              </Link>
            </div>
          </form>
        </div>

        <div className="mb-4 flex items-center justify-between text-sm text-on-surface-variant">
          <p>
            Showing {result.bookings.length} of {result.total} bookings
          </p>
          <p>
            Page {result.page} of {result.totalPages} · {ADMIN_BOOKINGS_PAGE_SIZE}{" "}
            per page
          </p>
        </div>

        <div className="overflow-hidden rounded-lg bg-surface-container-lowest shadow-ambient-sm">
          {result.bookings.length === 0 ? (
            <div className="p-10 text-center text-on-surface-variant">
              No bookings matched the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-outline-variant/10 text-sm">
                <thead className="bg-surface-container-high">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    <th className="px-4 py-3">Booking ID</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Availability</th>
                    <th className="px-4 py-3">Listing</th>
                    <th className="px-4 py-3">Host</th>
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Stay</th>
                    <th className="px-4 py-3">Total Price</th>
                    <th className="px-4 py-3">Slots</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {result.bookings.map((booking) => (
                    <tr key={booking.id} className="align-top text-on-surface">
                      <td className="whitespace-nowrap px-4 py-4 font-mono text-xs">
                        {booking.id}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <StatusBadge status={booking.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <AvailabilitySourceBadge
                          availabilitySource={booking.availabilitySource}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/listings/${booking.listing.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {booking.listing.title}
                        </Link>
                        <p className="mt-1 font-mono text-xs text-on-surface-variant">
                          {booking.listing.id}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p>{booking.listing.owner.name || "Unknown host"}</p>
                        <p className="text-xs text-on-surface-variant">
                          {booking.listing.owner.email || "No email"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p>{booking.tenant?.name || "Deleted account"}</p>
                        <p className="text-xs text-on-surface-variant">
                          {booking.tenant?.email || "No email"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-on-surface-variant">
                        {formatDateRange(booking.startDate, booking.endDate)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {formatPrice(booking.totalPrice)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {booking.slotsRequested}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-on-surface-variant">
                        {formatDateTime(booking.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <Link
                          href={`/admin/bookings/${booking.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          View evidence
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-on-surface-variant">
            {result.total === 0
              ? "No pages"
              : `Showing page ${result.page} of ${result.totalPages}`}
          </div>
          <div className="flex items-center gap-2">
            {previousPageHref ? (
              <Link
                href={previousPageHref}
                className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/20 px-4 py-2 text-sm font-medium text-on-surface"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Link>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-outline-variant/20 px-4 py-2 text-sm font-medium text-on-surface-variant/60">
                <ChevronLeft className="h-4 w-4" />
                Previous
              </span>
            )}
            {nextPageHref ? (
              <Link
                href={nextPageHref}
                className="inline-flex items-center gap-2 rounded-lg bg-on-surface px-4 py-2 text-sm font-medium text-white"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2 text-sm font-medium text-on-surface-variant/60">
                Next
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
