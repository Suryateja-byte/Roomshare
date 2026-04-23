import {
  BookingStatus,
  ListingAvailabilitySource,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ADMIN_BOOKINGS_PAGE_SIZE = 50;

export const ADMIN_BOOKING_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
  "HELD",
  "EXPIRED",
] as const satisfies readonly BookingStatus[];

export const ADMIN_BOOKING_AVAILABILITY_SOURCES = [
  "LEGACY_BOOKING",
  "HOST_MANAGED",
] as const satisfies readonly ListingAvailabilitySource[];

export type AdminBookingAuditEntry = {
  id: string;
  action: string;
  previousStatus: string | null;
  newStatus: string;
  actorType: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
};

export type AdminBookingListItem = {
  id: string;
  status: BookingStatus;
  availabilitySource: ListingAvailabilitySource;
  listing: {
    id: string;
    title: string;
    owner: {
      id: string;
      name: string | null;
      email: string | null;
    };
  };
  tenant: {
    id: string | null;
    name: string | null;
    email: string | null;
  } | null;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  slotsRequested: number;
  createdAt: Date;
};

export type AdminBookingEvidence = AdminBookingListItem & {
  version: number;
  updatedAt: Date;
  heldUntil: Date | null;
  rejectionReason: string | null;
  auditEntries: AdminBookingAuditEntry[];
};

export type AdminBookingListFilters = {
  page: number;
  status?: BookingStatus;
  availabilitySource?: ListingAvailabilitySource;
  listingId?: string;
  tenantId?: string;
  q?: string;
};

export type AdminBookingListResult = {
  bookings: AdminBookingListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const adminBookingListSelect = {
  id: true,
  status: true,
  startDate: true,
  endDate: true,
  totalPrice: true,
  slotsRequested: true,
  createdAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      availabilitySource: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
  tenant: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.BookingSelect;

const adminBookingEvidenceSelect = {
  id: true,
  status: true,
  startDate: true,
  endDate: true,
  totalPrice: true,
  slotsRequested: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  heldUntil: true,
  rejectionReason: true,
  listing: {
    select: {
      id: true,
      title: true,
      availabilitySource: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
  tenant: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.BookingSelect;

type BookingListRow = Prisma.BookingGetPayload<{
  select: typeof adminBookingListSelect;
}>;

type BookingEvidenceRow = Prisma.BookingGetPayload<{
  select: typeof adminBookingEvidenceSelect;
}>;

function sanitizeAuditDetails(
  details: Prisma.JsonValue | null
): Record<string, unknown> | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  const sanitizedEntries = Object.entries(details).filter(
    ([key]) => key !== "actorId" && key !== "ipAddress"
  );

  if (sanitizedEntries.length === 0) {
    return null;
  }

  return Object.fromEntries(sanitizedEntries);
}

function mapBookingAuditEntry(entry: {
  id: string;
  action: string;
  previousStatus: string | null;
  newStatus: string;
  actorType: string;
  details: Prisma.JsonValue | null;
  createdAt: Date;
}): AdminBookingAuditEntry {
  return {
    id: entry.id,
    action: entry.action,
    previousStatus: entry.previousStatus,
    newStatus: entry.newStatus,
    actorType: entry.actorType,
    details: sanitizeAuditDetails(entry.details),
    createdAt: entry.createdAt,
  };
}

function mapBookingListRow(row: BookingListRow): AdminBookingListItem {
  return {
    id: row.id,
    status: row.status,
    availabilitySource: row.listing.availabilitySource,
    listing: {
      id: row.listing.id,
      title: row.listing.title,
      owner: {
        id: row.listing.owner.id,
        name: row.listing.owner.name,
        email: row.listing.owner.email,
      },
    },
    tenant: row.tenant
      ? {
          id: row.tenant.id,
          name: row.tenant.name,
          email: row.tenant.email,
        }
      : null,
    startDate: row.startDate,
    endDate: row.endDate,
    totalPrice: Number(row.totalPrice),
    slotsRequested: row.slotsRequested,
    createdAt: row.createdAt,
  };
}

function mapBookingEvidenceRow(
  row: BookingEvidenceRow,
  auditEntries: AdminBookingAuditEntry[]
): AdminBookingEvidence {
  return {
    ...mapBookingListRow(row),
    version: row.version,
    updatedAt: row.updatedAt,
    heldUntil: row.heldUntil,
    rejectionReason: row.rejectionReason,
    auditEntries,
  };
}

export function buildAdminBookingWhere(
  filters: AdminBookingListFilters
): Prisma.BookingWhereInput {
  const query = filters.q?.trim();
  const and: Prisma.BookingWhereInput[] = [];

  if (filters.status) {
    and.push({ status: filters.status });
  }

  if (filters.listingId) {
    and.push({ listingId: filters.listingId });
  }

  if (filters.tenantId) {
    and.push({ tenantId: filters.tenantId });
  }

  if (filters.availabilitySource) {
    and.push({
      listing: {
        is: {
          availabilitySource: filters.availabilitySource,
        },
      },
    });
  }

  if (query) {
    and.push({
      OR: [
        { id: { contains: query, mode: "insensitive" } },
        {
          listing: {
            is: {
              title: { contains: query, mode: "insensitive" },
            },
          },
        },
        {
          listing: {
            is: {
              owner: {
                is: {
                  name: { contains: query, mode: "insensitive" },
                },
              },
            },
          },
        },
        {
          listing: {
            is: {
              owner: {
                is: {
                  email: { contains: query, mode: "insensitive" },
                },
              },
            },
          },
        },
        {
          tenant: {
            is: {
              name: { contains: query, mode: "insensitive" },
            },
          },
        },
        {
          tenant: {
            is: {
              email: { contains: query, mode: "insensitive" },
            },
          },
        },
      ],
    });
  }

  if (and.length === 0) {
    return {};
  }

  if (and.length === 1) {
    return and[0] ?? {};
  }

  return { AND: and };
}

export async function getBookingAuditEntries(
  bookingId: string
): Promise<AdminBookingAuditEntry[]> {
  const entries = await prisma.bookingAuditLog.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      previousStatus: true,
      newStatus: true,
      actorType: true,
      details: true,
      createdAt: true,
    },
  });

  return entries.map(mapBookingAuditEntry);
}

export async function getAdminBookingList(
  filters: AdminBookingListFilters
): Promise<AdminBookingListResult> {
  const page = Math.max(1, Math.trunc(filters.page || 1));
  const where = buildAdminBookingWhere(filters);
  const skip = (page - 1) * ADMIN_BOOKINGS_PAGE_SIZE;

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: ADMIN_BOOKINGS_PAGE_SIZE,
      select: adminBookingListSelect,
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    bookings: bookings.map(mapBookingListRow),
    total,
    page,
    pageSize: ADMIN_BOOKINGS_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / ADMIN_BOOKINGS_PAGE_SIZE)),
  };
}

export async function getAdminBookingEvidence(
  bookingId: string
): Promise<AdminBookingEvidence | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: adminBookingEvidenceSelect,
  });

  if (!booking) {
    return null;
  }

  const auditEntries = await getBookingAuditEntries(bookingId);
  return mapBookingEvidenceRow(booking, auditEntries);
}
