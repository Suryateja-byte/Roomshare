import { auth } from "@/auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { getAdminBookingEvidence } from "@/lib/bookings/admin-evidence";
import { ArrowLeft, CalendarClock } from "lucide-react";

export const metadata = {
  title: "Booking Evidence Detail | Admin | RoomShare",
  description: "Read-only booking evidence detail for RoomShare admins",
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

function formatActorType(actorType: string | null) {
  if (!actorType) {
    return "Unknown";
  }

  switch (actorType) {
    case "SYSTEM":
      return "System";
    case "ADMIN":
      return "Admin";
    case "USER":
      return "User";
    case "HOST":
      return "Host";
    default:
      return actorType;
  }
}

function renderAuditDetails(details: Record<string, unknown> | null) {
  if (!details) {
    return <p className="text-sm text-on-surface-variant">No details</p>;
  }

  const knownKeys = [
    "slotsRequested",
    "version",
    "rejectionReason",
    "heldUntil",
    "listingTitle",
  ] as const;

  const knownEntries = knownKeys
    .map((key) => [key, details[key]] as const)
    .filter(([, value]) => value !== undefined && value !== null);
  const unknownEntries = Object.entries(details).filter(
    ([key, value]) =>
      !knownKeys.includes(
        key as
          | "slotsRequested"
          | "version"
          | "rejectionReason"
          | "heldUntil"
          | "listingTitle"
      ) &&
      value !== undefined
  );

  return (
    <div className="space-y-3">
      {knownEntries.length > 0 && (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {knownEntries.map(([key, value]) => (
            <div key={key}>
              <dt className="font-medium text-on-surface">{key}</dt>
              <dd className="text-on-surface-variant">
                {key === "heldUntil" && typeof value === "string"
                  ? formatDateTime(new Date(value))
                  : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {unknownEntries.length > 0 && (
        <pre className="overflow-x-auto rounded-lg bg-surface-container-high p-3 text-xs text-on-surface-variant">
          {JSON.stringify(Object.fromEntries(unknownEntries), null, 2)}
        </pre>
      )}
    </div>
  );
}

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const booking = await getAdminBookingEvidence(id);

  if (!booking) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-surface-canvas">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <Link
            href="/admin/bookings"
            className="mb-4 inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Booking Evidence
          </Link>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <CalendarClock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-on-surface">
                Booking Evidence
              </h1>
              <p className="text-on-surface-variant">
                Read-only booking facts and audit timeline
              </p>
            </div>
          </div>
        </div>

        <section className="mb-8 rounded-lg bg-surface-container-lowest p-6 shadow-ambient-sm">
          <h2 className="mb-4 text-lg font-display font-semibold text-on-surface">
            Booking Summary
          </h2>
          <dl className="grid gap-4 md:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-on-surface">Booking ID</dt>
              <dd className="font-mono text-sm text-on-surface-variant">
                {booking.id}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">Status</dt>
              <dd className="text-sm text-on-surface-variant">{booking.status}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">
                Availability Source
              </dt>
              <dd className="text-sm text-on-surface-variant">
                {booking.availabilitySource}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">Version</dt>
              <dd className="text-sm text-on-surface-variant">{booking.version}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">Listing</dt>
              <dd className="text-sm text-on-surface-variant">
                <Link
                  href={`/listings/${booking.listing.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {booking.listing.title}
                </Link>
                <div className="font-mono text-xs">{booking.listing.id}</div>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">Host</dt>
              <dd className="text-sm text-on-surface-variant">
                <div>{booking.listing.owner.name || "Unknown host"}</div>
                <div>{booking.listing.owner.email || "No email"}</div>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">Tenant</dt>
              <dd className="text-sm text-on-surface-variant">
                <div>{booking.tenant?.name || "Deleted account"}</div>
                <div>{booking.tenant?.email || "No email"}</div>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">Stay Dates</dt>
              <dd className="text-sm text-on-surface-variant">
                {formatDate(booking.startDate)} - {formatDate(booking.endDate)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">Total Price</dt>
              <dd className="text-sm text-on-surface-variant">
                {formatPrice(booking.totalPrice)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">
                Slots Requested
              </dt>
              <dd className="text-sm text-on-surface-variant">
                {booking.slotsRequested}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">Created At</dt>
              <dd className="text-sm text-on-surface-variant">
                {formatDateTime(booking.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-on-surface">Updated At</dt>
              <dd className="text-sm text-on-surface-variant">
                {formatDateTime(booking.updatedAt)}
              </dd>
            </div>
            {booking.heldUntil && (
              <div>
                <dt className="text-sm font-medium text-on-surface">
                  Held Until
                </dt>
                <dd className="text-sm text-on-surface-variant">
                  {formatDateTime(booking.heldUntil)}
                </dd>
              </div>
            )}
            {booking.rejectionReason && (
              <div>
                <dt className="text-sm font-medium text-on-surface">
                  Rejection Reason
                </dt>
                <dd className="text-sm text-on-surface-variant">
                  {booking.rejectionReason}
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-lg bg-surface-container-lowest p-6 shadow-ambient-sm">
          <h2 className="mb-4 text-lg font-display font-semibold text-on-surface">
            Audit Timeline
          </h2>

          {booking.auditEntries.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              No audit entries were recorded for this booking.
            </p>
          ) : (
            <ol className="space-y-4">
              {booking.auditEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-outline-variant/20 p-4"
                >
                  <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="font-medium text-on-surface">
                        {entry.action}
                      </h3>
                      <p className="text-sm text-on-surface-variant">
                        Actor: {formatActorType(entry.actorType)}
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        Status: {entry.previousStatus || "null"} → {entry.newStatus}
                      </p>
                    </div>
                    <p className="text-sm text-on-surface-variant">
                      {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                  <div className="mt-3">{renderAuditDetails(entry.details)}</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
