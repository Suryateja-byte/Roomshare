"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { ListingStatus, ReportStatus } from "@prisma/client";
import { logAdminAction } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import {
  checkRateLimit,
  RATE_LIMITS,
  getClientIPFromHeaders,
} from "@/lib/rate-limit";
import { headers } from "next/headers";
import {
  HOST_MANAGED_WRITE_ERROR_MESSAGES,
  prepareHostManagedListingWrite,
} from "@/lib/listings/host-managed-write";
import {
  executeLockedListingMigrationReview,
  fetchLockedListingMigrationReviewRecord,
} from "@/lib/migration/review";

// Helper to check admin status — exported for use in other admin action files (verification.ts etc.)
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: "Unauthorized",
      code: "SESSION_EXPIRED",
      isAdmin: false,
      userId: null,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    return {
      error: "Unauthorized",
      code: "NOT_ADMIN",
      isAdmin: false,
      userId: session.user.id,
    };
  }

  return { error: null, code: null, isAdmin: true, userId: session.user.id };
}

// ==================== USER MANAGEMENT ====================

export async function getUsers(options?: {
  search?: string;
  isVerified?: boolean;
  isAdmin?: boolean;
  isSuspended?: boolean;
  page?: number;
  limit?: number;
}) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error, users: [], total: 0 };
  }

  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const skip = (page - 1) * limit;

  try {
    // P1-8 FIX: Use proper Prisma type instead of any
    const where: Prisma.UserWhereInput = {};

    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
      ];
    }

    if (options?.isVerified !== undefined) {
      where.isVerified = options.isVerified;
    }

    if (options?.isAdmin !== undefined) {
      where.isAdmin = options.isAdmin;
    }

    if (options?.isSuspended !== undefined) {
      where.isSuspended = options.isSuspended;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          isVerified: true,
          isAdmin: true,
          isSuspended: true,
          emailVerified: true,
          _count: {
            select: {
              listings: true,
              bookings: true,
              reviewsWritten: true,
            },
          },
        },
        orderBy: { email: "asc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  } catch (error) {
    logger.sync.error("Failed to fetch users (admin)", {
      action: "getUsers",
      adminId: adminCheck.userId,
      hasSearch: !!options?.search,
      filters: {
        isVerified: options?.isVerified,
        isAdmin: options?.isAdmin,
        isSuspended: options?.isSuspended,
      },
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to fetch users", users: [], total: 0 };
  }
}

export async function toggleUserAdmin(userId: string) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error };
  }

  // Rate limit admin writes
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${adminCheck.userId}`,
    "adminWrite",
    RATE_LIMITS.adminWrite
  );
  if (!rl.success) {
    return { error: "Too many requests. Please slow down." };
  }

  // Prevent self-demotion
  if (userId === adminCheck.userId) {
    return { error: "Cannot change your own admin status" };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true, name: true, email: true },
    });

    if (!user) {
      return { error: "User not found" };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isAdmin: !user.isAdmin },
    });

    // Audit log
    await logAdminAction({
      adminId: adminCheck.userId!,
      action: user.isAdmin ? "ADMIN_REVOKED" : "ADMIN_GRANTED",
      targetType: "User",
      targetId: userId,
      details: {
        previousState: user.isAdmin,
        newState: !user.isAdmin,
        userName: user.name,
        targetUserId: userId,
      },
    });

    revalidatePath("/admin/users");
    return { success: true, isAdmin: !user.isAdmin };
  } catch (error) {
    logger.sync.error("Failed to toggle admin status", {
      action: "toggleUserAdmin",
      adminId: adminCheck.userId,
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to update admin status" };
  }
}

export async function suspendUser(userId: string, suspend: boolean) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error };
  }

  // Rate limit admin writes
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${adminCheck.userId}`,
    "adminWrite",
    RATE_LIMITS.adminWrite
  );
  if (!rl.success) {
    return { error: "Too many requests. Please slow down." };
  }

  // Prevent self-suspension
  if (userId === adminCheck.userId) {
    return { error: "Cannot suspend yourself" };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSuspended: true, name: true, email: true },
    });

    if (!user) {
      return { error: "User not found" };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isSuspended: suspend },
    });

    // Audit log
    await logAdminAction({
      adminId: adminCheck.userId!,
      action: suspend ? "USER_SUSPENDED" : "USER_UNSUSPENDED",
      targetType: "User",
      targetId: userId,
      details: {
        previousState: user.isSuspended,
        newState: suspend,
        userName: user.name,
        targetUserId: userId,
      },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    logger.sync.error("Failed to update user suspension", {
      action: "suspendUser",
      adminId: adminCheck.userId,
      userId,
      suspend,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to update user status" };
  }
}

// ==================== LISTING MANAGEMENT ====================

export async function getListingsForAdmin(options?: {
  search?: string;
  status?: ListingStatus;
  ownerId?: string;
  page?: number;
  limit?: number;
}) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error, listings: [], total: 0 };
  }

  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const skip = (page - 1) * limit;

  try {
    // P1-8 FIX: Use proper Prisma type instead of any
    const where: Prisma.ListingWhereInput = {};

    if (options?.search) {
      where.OR = [
        { title: { contains: options.search, mode: "insensitive" } },
        { description: { contains: options.search, mode: "insensitive" } },
      ];
    }

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.ownerId) {
      where.ownerId = options.ownerId;
    }

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        select: {
          id: true,
          title: true,
          price: true,
          status: true,
          version: true,
          images: true,
          viewCount: true,
          createdAt: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          location: {
            select: {
              city: true,
              state: true,
            },
          },
          _count: {
            select: {
              reports: true,
              bookings: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.listing.count({ where }),
    ]);

    return { listings, total, page, limit };
  } catch (error) {
    logger.sync.error("Failed to fetch listings (admin)", {
      action: "getListingsForAdmin",
      adminId: adminCheck.userId,
      options,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to fetch listings", listings: [], total: 0 };
  }
}

export async function updateListingStatus(
  listingId: string,
  status: ListingStatus,
  expectedVersion: number
) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error };
  }

  // Rate limit admin writes
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${adminCheck.userId}`,
    "adminWrite",
    RATE_LIMITS.adminWrite
  );
  if (!rl.success) {
    return { error: "Too many requests. Please slow down." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [listing] = await tx.$queryRaw<
        Array<{
          id: string;
          status: ListingStatus;
          title: string;
          ownerId: string;
          version: number;
          availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
          statusReason: string | null;
          needsMigrationReview: boolean;
          openSlots: number | null;
          availableSlots: number;
          totalSlots: number;
          moveInDate: Date | null;
          availableUntil: Date | null;
          minStayMonths: number;
          lastConfirmedAt: Date | null;
          freshnessReminderSentAt: Date | null;
          freshnessWarningSentAt: Date | null;
          autoPausedAt: Date | null;
        }>
      >`
        SELECT
          id,
          status,
          title,
          "ownerId",
          version,
          "availabilitySource",
          "statusReason",
          "needsMigrationReview",
          "openSlots",
          "availableSlots",
          "totalSlots",
          "moveInDate",
          "availableUntil",
          "minStayMonths",
          "lastConfirmedAt",
          "freshnessReminderSentAt",
          "freshnessWarningSentAt",
          "autoPausedAt"
        FROM "Listing"
        WHERE id = ${listingId}
        FOR UPDATE
      `;

      if (!listing) {
        return { error: "Listing not found" } as const;
      }

      if (listing.version !== expectedVersion) {
        return {
          error: HOST_MANAGED_WRITE_ERROR_MESSAGES.VERSION_CONFLICT,
          code: "VERSION_CONFLICT",
        } as const;
      }

      if (listing.needsMigrationReview && status === "ACTIVE") {
        return {
          error:
            HOST_MANAGED_WRITE_ERROR_MESSAGES.HOST_MANAGED_MIGRATION_REVIEW_REQUIRED,
          code: "HOST_MANAGED_MIGRATION_REVIEW_REQUIRED",
        } as const;
      }

      if (listing.availabilitySource === "HOST_MANAGED") {
        const preparedWrite = prepareHostManagedListingWrite(
          listing,
          {
            expectedVersion,
            status,
          },
          {
            actor: "admin",
            now: new Date(),
          }
        );

        if (!preparedWrite.ok) {
          return {
            error: preparedWrite.error,
            code: preparedWrite.code,
          } as const;
        }

        await tx.listing.update({
          where: { id: listingId },
          data: preparedWrite.data,
        });

        await markListingDirtyInTx(tx, listingId, "status_changed");

        return {
          success: true,
          listingTitle: listing.title,
          ownerId: listing.ownerId,
          previousStatus: listing.status,
          status: preparedWrite.status,
          statusReason: preparedWrite.statusReason,
          version: preparedWrite.nextVersion,
        } as const;
      }

      await tx.listing.update({
        where: { id: listingId },
        data: { status, version: listing.version + 1 },
      });

      await markListingDirtyInTx(tx, listingId, "status_changed");

      return {
        success: true,
        listingTitle: listing.title,
        ownerId: listing.ownerId,
        previousStatus: listing.status,
        status,
        statusReason: listing.statusReason,
        version: listing.version + 1,
      } as const;
    });

    if ("error" in result) {
      return result;
    }

    // Audit log
    await logAdminAction({
      adminId: adminCheck.userId!,
        action:
        result.status === "PAUSED"
          ? "LISTING_HIDDEN"
          : result.status === "RENTED"
            ? "LISTING_RENTED"
            : "LISTING_RESTORED",
      targetType: "Listing",
      targetId: listingId,
      details: {
        previousStatus: result.previousStatus,
        newStatus: result.status,
        statusReason: result.statusReason,
        listingTitle: result.listingTitle,
        ownerId: result.ownerId,
      },
    });

    revalidatePath("/admin/listings");
    return {
      success: true,
      status: result.status,
      statusReason: result.statusReason,
      version: result.version,
    };
  } catch (error) {
    logger.sync.error("Failed to update listing status (admin)", {
      action: "updateListingStatus",
      adminId: adminCheck.userId,
      listingId,
      status,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to update listing status" };
  }
}

export async function reviewListingMigration(
  listingId: string,
  expectedVersion: number
) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error };
  }

  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${adminCheck.userId}`,
    "adminWrite",
    RATE_LIMITS.adminWrite
  );
  if (!rl.success) {
    return { error: "Too many requests. Please slow down." };
  }

  try {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const listing = await fetchLockedListingMigrationReviewRecord(
        tx,
        listingId,
        now
      );

      if (!listing) {
        return { error: "Listing not found" } as const;
      }

      const reviewResult = await executeLockedListingMigrationReview(tx, listing, {
        actor: "admin",
        expectedVersion,
        now,
      });

      if (!reviewResult.success) {
        return reviewResult;
      }

      await markListingDirtyInTx(tx, listingId, "listing_updated");

      return {
        ...reviewResult,
        listingTitle: listing.title,
        ownerId: listing.ownerId,
        previousAvailabilitySource: listing.availabilitySource,
        previousNeedsMigrationReview: listing.needsMigrationReview,
      } as const;
    });

    if (!("success" in result) || !result.success) {
      return result;
    }

    await logAdminAction({
      adminId: adminCheck.userId!,
      action: "LISTING_MIGRATION_REVIEWED",
      targetType: "Listing",
      targetId: listingId,
      details: {
        listingTitle: result.listingTitle,
        ownerId: result.ownerId,
        previousAvailabilitySource: result.previousAvailabilitySource,
        previousNeedsMigrationReview: result.previousNeedsMigrationReview,
        newAvailabilitySource: result.availabilitySource,
        newNeedsMigrationReview: result.needsMigrationReview,
        newStatus: result.status,
        statusReason: result.statusReason,
      },
    });

    revalidatePath("/admin/listings");
    revalidatePath(`/listings/${listingId}`);
    revalidatePath(`/listings/${listingId}/edit`);
    revalidatePath("/search");

    return result;
  } catch (error) {
    logger.sync.error("Failed to review listing migration (admin)", {
      action: "adminReviewListingMigration",
      adminId: adminCheck.userId,
      listingId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to review listing migration" };
  }
}

export async function deleteListing(listingId: string) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error };
  }

  // Rate limit admin deletes
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${adminCheck.userId}`,
    "adminDelete",
    RATE_LIMITS.adminDelete
  );
  if (!rl.success) {
    return { error: "Too many requests. Please slow down." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock listing row to prevent concurrent modifications (TOCTOU fix)
      const [listing] = await tx.$queryRaw<
        { id: string; title: string; ownerId: string; status: string }[]
      >`SELECT "id", "title", "ownerId", "status" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;

      if (!listing) throw new Error("NOT_FOUND");

      // Check for active ACCEPTED bookings INSIDE the transaction
      const activeAcceptedBookings = await tx.booking.count({
        where: {
          listingId,
          status: "ACCEPTED",
          endDate: { gte: new Date() },
        },
      });

      if (activeAcceptedBookings > 0) {
        throw new Error("ACTIVE_BOOKINGS");
      }

      // Get pending bookings for notifications
      const pendingBookings = await tx.booking.findMany({
        where: { listingId, status: "PENDING" },
        select: { id: true, tenantId: true },
      });

      // Cancel pending bookings explicitly
      await tx.booking.updateMany({
        where: { listingId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });

      // Batch-create notifications for affected tenants
      if (pendingBookings.length > 0) {
        await tx.notification.createMany({
          data: pendingBookings
            .filter((booking) => booking.tenantId != null)
            .map((booking) => ({
              userId: booking.tenantId!,
              type: "BOOKING_CANCELLED",
              title: "Booking Request Cancelled",
              message: `Your pending booking request for "${listing.title}" has been cancelled because the listing was removed by an administrator.`,
              link: "/bookings",
            })),
        });
      }

      // Delete the listing
      await tx.listing.delete({ where: { id: listingId } });

      return { listing, pendingBookingsCount: pendingBookings.length };
    });

    // Audit log AFTER successful transaction
    await logAdminAction({
      adminId: adminCheck.userId!,
      action: "LISTING_DELETED",
      targetType: "Listing",
      targetId: listingId,
      details: {
        listingTitle: result.listing.title,
        ownerId: result.listing.ownerId,
        previousStatus: result.listing.status,
        pendingBookingsNotified: result.pendingBookingsCount,
      },
    });

    revalidatePath("/admin/listings");
    return { success: true, notifiedTenants: result.pendingBookingsCount };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") return { error: "Listing not found" };
      if (error.message === "ACTIVE_BOOKINGS") {
        // Intentionally simplified response: the UI uses /api/listings/[id]/can-delete
        // for detailed activeBookings info, not this action's error shape.
        return { error: "Cannot delete listing with active bookings" };
      }
    }
    logger.sync.error("Failed to delete listing (admin)", {
      action: "deleteListing",
      adminId: adminCheck.userId,
      listingId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to delete listing" };
  }
}

// ==================== REPORT MANAGEMENT ====================

export async function getReports(options?: {
  status?: ReportStatus;
  page?: number;
  limit?: number;
}) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error, reports: [], total: 0 };
  }

  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const skip = (page - 1) * limit;

  try {
    // P1-8 FIX: Use proper Prisma type instead of any
    const where: Prisma.ReportWhereInput = {};

    if (options?.status) {
      where.status = options.status;
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              images: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          reporter: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    return { reports, total, page, limit };
  } catch (error) {
    logger.sync.error("Failed to fetch reports (admin)", {
      action: "getReports",
      adminId: adminCheck.userId,
      options,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to fetch reports", reports: [], total: 0 };
  }
}

export async function resolveReport(
  reportId: string,
  action: "RESOLVED" | "DISMISSED",
  notes?: string
) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error };
  }

  // Rate limit admin writes
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${adminCheck.userId}`,
    "adminWrite",
    RATE_LIMITS.adminWrite
  );
  if (!rl.success) {
    return { error: "Too many requests. Please slow down." };
  }

  try {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { status: true, reason: true, listingId: true, reporterId: true },
    });

    if (!report) {
      return { error: "Report not found" };
    }

    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: action,
        adminNotes: notes,
        reviewedBy: adminCheck.userId,
        resolvedAt: new Date(),
      },
    });

    // Audit log
    await logAdminAction({
      adminId: adminCheck.userId!,
      action: action === "RESOLVED" ? "REPORT_RESOLVED" : "REPORT_DISMISSED",
      targetType: "Report",
      targetId: reportId,
      details: {
        previousStatus: report.status,
        newStatus: action,
        reason: report.reason,
        listingId: report.listingId,
        reporterId: report.reporterId,
        adminNotes: notes,
      },
    });

    revalidatePath("/admin/reports");
    return { success: true };
  } catch (error) {
    logger.sync.error("Failed to resolve report", {
      action: "resolveReport",
      adminId: adminCheck.userId,
      reportId,
      resolution: action,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to resolve report" };
  }
}

export async function resolveReportAndRemoveListing(
  reportId: string,
  notes?: string
) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error };
  }

  // Rate limit admin deletes
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${adminCheck.userId}`,
    "adminDelete",
    RATE_LIMITS.adminDelete
  );
  if (!rl.success) {
    return { error: "Too many requests. Please slow down." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Fetch and validate report
      const report = await tx.report.findUnique({
        where: { id: reportId },
        select: {
          listingId: true,
          reason: true,
          reporterId: true,
          status: true,
        },
      });

      if (!report) throw new Error("REPORT_NOT_FOUND");

      // Lock listing row to prevent concurrent modifications (TOCTOU fix)
      const [listing] = await tx.$queryRaw<
        { id: string; title: string; ownerId: string }[]
      >`SELECT "id", "title", "ownerId" FROM "Listing" WHERE "id" = ${report.listingId} FOR UPDATE`;

      if (!listing) throw new Error("LISTING_NOT_FOUND");

      // BIZ-01: Check for active ACCEPTED bookings before deletion
      const activeAcceptedBookings = await tx.booking.count({
        where: {
          listingId: report.listingId,
          status: "ACCEPTED",
          endDate: { gte: new Date() },
        },
      });

      if (activeAcceptedBookings > 0) {
        throw new Error("ACTIVE_BOOKINGS");
      }

      // Get affected bookings (PENDING) for notifications
      const affectedBookings = await tx.booking.findMany({
        where: {
          listingId: report.listingId,
          status: "PENDING",
        },
        select: { id: true, tenantId: true },
      });

      // Cancel affected bookings explicitly
      await tx.booking.updateMany({
        where: {
          listingId: report.listingId,
          status: "PENDING",
        },
        data: { status: "CANCELLED" },
      });

      // Batch-create notifications for affected tenants (skip deleted accounts)
      if (affectedBookings.length > 0) {
        await tx.notification.createMany({
          data: affectedBookings
            .filter((booking) => booking.tenantId != null)
            .map((booking) => ({
              userId: booking.tenantId!,
              type: "BOOKING_CANCELLED",
              title: "Booking Cancelled - Listing Removed",
              message: `Your booking for "${listing.title}" has been cancelled because the listing was removed due to a policy violation.`,
              link: "/bookings",
            })),
        });
      }

      // Update report status
      await tx.report.update({
        where: { id: reportId },
        data: {
          status: "RESOLVED",
          adminNotes: notes || "Listing removed due to policy violation",
          reviewedBy: adminCheck.userId,
          resolvedAt: new Date(),
        },
      });

      // Delete the listing
      await tx.listing.delete({ where: { id: report.listingId } });

      return {
        report,
        listing,
        affectedBookingsCount: affectedBookings.length,
      };
    });

    // Audit log for report resolution (AFTER successful transaction)
    await logAdminAction({
      adminId: adminCheck.userId!,
      action: "REPORT_RESOLVED",
      targetType: "Report",
      targetId: reportId,
      details: {
        previousStatus: result.report.status,
        newStatus: "RESOLVED",
        reason: result.report.reason,
        listingId: result.report.listingId,
        reporterId: result.report.reporterId,
        adminNotes: notes || "Listing removed due to policy violation",
        listingRemoved: true,
        affectedBookings: result.affectedBookingsCount,
      },
    });

    // Audit log for listing deletion
    await logAdminAction({
      adminId: adminCheck.userId!,
      action: "LISTING_DELETED",
      targetType: "Listing",
      targetId: result.report.listingId,
      details: {
        listingTitle: result.listing.title,
        ownerId: result.listing.ownerId,
        deletedDueToReport: reportId,
        adminNotes: notes || "Listing removed due to policy violation",
        affectedBookings: result.affectedBookingsCount,
      },
    });

    revalidatePath("/admin/reports");
    revalidatePath("/admin/listings");
    return { success: true, affectedBookings: result.affectedBookingsCount };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "REPORT_NOT_FOUND")
        return { error: "Report not found" };
      if (error.message === "LISTING_NOT_FOUND")
        return { error: "Listing not found" };
      if (error.message === "ACTIVE_BOOKINGS") {
        return { error: "Cannot remove listing with active bookings" };
      }
    }
    logger.sync.error("Failed to resolve report with listing removal", {
      action: "resolveReportAndRemoveListing",
      adminId: adminCheck.userId,
      reportId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to resolve report" };
  }
}

// ==================== ADMIN STATS ====================

export async function getAdminStats() {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error };
  }

  try {
    const [
      totalUsers,
      verifiedUsers,
      suspendedUsers,
      totalListings,
      activeListings,
      pendingVerifications,
      openReports,
      totalBookings,
      totalMessages,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isVerified: true } }),
      prisma.user.count({ where: { isSuspended: true } }),
      prisma.listing.count(),
      prisma.listing.count({ where: { status: "ACTIVE" } }),
      prisma.verificationRequest.count({ where: { status: "PENDING" } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.booking.count(),
      prisma.message.count(),
    ]);

    return {
      totalUsers,
      verifiedUsers,
      suspendedUsers,
      totalListings,
      activeListings,
      pendingVerifications,
      openReports,
      totalBookings,
      totalMessages,
    };
  } catch (error) {
    logger.sync.error("Failed to fetch admin stats", {
      action: "getAdminStats",
      adminId: adminCheck.userId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to fetch stats" };
  }
}
