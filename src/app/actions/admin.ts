"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { ListingStatus, ReportStatus } from "@prisma/client";
import { logAdminAction } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import { requireAdminAuth } from "@/lib/admin-auth";
import {
  syncListingLifecycleProjectionInTx,
  tombstoneCanonicalInventoryInTx,
} from "@/lib/listings/canonical-lifecycle";
import { getModerationWriteLockReason } from "@/lib/listings/moderation-write-lock";
import {
  checkRateLimit,
  RATE_LIMITS,
  getClientIPFromHeaders,
} from "@/lib/rate-limit";
import { headers } from "next/headers";
import { restoreConsumptionsForHostBan } from "@/lib/payments/contact-restoration";

// Helper to check admin status — exported for use in other admin action files (verification.ts etc.)
export async function requireAdmin() {
  return requireAdminAuth();
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

    if (suspend) {
      await restoreConsumptionsForHostBan(userId);
    }

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
          statusReason: true,
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
          statusReason: string | null;
        }>
      >`
        SELECT
          id,
          status,
          title,
          "ownerId",
          version,
          "statusReason"
        FROM "Listing"
        WHERE id = ${listingId}
        FOR UPDATE
      `;

      if (!listing) {
        return { error: "Listing not found" } as const;
      }

      if (listing.version !== expectedVersion) {
        return {
          error: "This listing was updated elsewhere. Reload and try again.",
          code: "VERSION_CONFLICT",
        } as const;
      }

      const lockReason = getModerationWriteLockReason(listing.statusReason);
      if (status === "ACTIVE" && lockReason) {
        return {
          error:
            "This listing is moderation-locked. Use Unsuppress Listing to restore it.",
          code: "LISTING_REQUIRES_UNSUPPRESS",
          lockReason,
        } as const;
      }

      const nextStatusReason =
        status === "PAUSED"
          ? (lockReason ?? "ADMIN_PAUSED")
          : lockReason
            ? listing.statusReason
            : null;

      await tx.listing.update({
        where: { id: listingId },
        data: {
          status,
          statusReason: nextStatusReason,
          version: listing.version + 1,
        },
      });

      await markListingDirtyInTx(tx, listingId, "status_changed");
      await syncListingLifecycleProjectionInTx(tx, listingId, {
        role: "moderator",
        id: adminCheck.userId,
      });

      return {
        success: true,
        listingTitle: listing.title,
        ownerId: listing.ownerId,
        previousStatus: listing.status,
        previousStatusReason: listing.statusReason,
        status,
        statusReason: nextStatusReason,
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
        previousStatusReason: result.previousStatusReason,
        newStatus: result.status,
        newStatusReason: result.statusReason,
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

export async function unsuppressListing(
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
    const result = await prisma.$transaction(async (tx) => {
      const [listing] = await tx.$queryRaw<
        Array<{
          id: string;
          status: ListingStatus;
          title: string;
          ownerId: string;
          version: number;
          statusReason: string | null;
        }>
      >`
        SELECT
          id,
          status,
          title,
          "ownerId",
          version,
          "statusReason"
        FROM "Listing"
        WHERE id = ${listingId}
        FOR UPDATE
      `;

      if (!listing) {
        return { error: "Listing not found", code: "NOT_FOUND" } as const;
      }

      if (listing.version !== expectedVersion) {
        return {
          error: "This listing was updated elsewhere. Reload and try again.",
          code: "VERSION_CONFLICT",
        } as const;
      }

      const lockReason = getModerationWriteLockReason(listing.statusReason);
      if (!lockReason) {
        return {
          error: "This listing is not moderation-locked.",
          code: "LISTING_NOT_MODERATION_LOCKED",
        } as const;
      }

      const nextVersion = listing.version + 1;
      await tx.listing.update({
        where: { id: listingId },
        data: {
          status: "ACTIVE",
          statusReason: null,
          version: nextVersion,
        },
      });

      await markListingDirtyInTx(tx, listingId, "status_changed");
      await syncListingLifecycleProjectionInTx(tx, listingId, {
        role: "moderator",
        id: adminCheck.userId,
      });

      return {
        success: true,
        listingTitle: listing.title,
        ownerId: listing.ownerId,
        previousStatus: listing.status,
        previousStatusReason: listing.statusReason,
        lockReason,
        status: "ACTIVE" as const,
        statusReason: null,
        version: nextVersion,
      } as const;
    });

    if ("error" in result) {
      return result;
    }

    await logAdminAction({
      adminId: adminCheck.userId!,
      action: "LISTING_RESTORED",
      targetType: "Listing",
      targetId: listingId,
      details: {
        previousStatus: result.previousStatus,
        previousStatusReason: result.previousStatusReason,
        newStatus: result.status,
        newStatusReason: null,
        restoredLockReason: result.lockReason,
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
    logger.sync.error("Failed to unsuppress listing (admin)", {
      action: "unsuppressListing",
      adminId: adminCheck.userId,
      listingId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to restore listing" };
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

  void listingId;
  void expectedVersion;

  return {
    error:
      "Listing migration review was retired with the contact-first cutover.",
    code: "MIGRATION_REVIEW_RETIRED",
  };
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
      // Lock listing row to prevent concurrent modifications and report races.
      const [listing] = await tx.$queryRaw<
        {
          id: string;
          title: string;
          ownerId: string;
          status: ListingStatus;
          statusReason: string | null;
          version: number;
        }[]
      >`
        SELECT "id", "title", "ownerId", "status", "statusReason", "version"
        FROM "Listing"
        WHERE "id" = ${listingId}
        FOR UPDATE
      `;

      if (!listing) throw new Error("NOT_FOUND");

      const reportCount = await tx.report.count({ where: { listingId } });
      if (reportCount > 0) {
        const newVersion = listing.version + 1;
        await tx.listing.update({
          where: { id: listingId },
          data: {
            status: "PAUSED",
            statusReason: "SUPPRESSED",
            version: newVersion,
          },
        });
        await markListingDirtyInTx(tx, listingId, "status_changed");
        await syncListingLifecycleProjectionInTx(tx, listingId, {
          role: "moderator",
          id: adminCheck.userId,
        });

        return {
          action: "suppressed",
          listing,
          reportCount,
          newVersion,
        } as const;
      }

      await tombstoneCanonicalInventoryInTx(tx, listingId, "TOMBSTONE");
      await tx.listing.delete({ where: { id: listingId } });

      return { action: "deleted", listing, reportCount } as const;
    });

    // Audit log AFTER successful transaction
    if (result.action === "suppressed") {
      await logAdminAction({
        adminId: adminCheck.userId!,
        action: "LISTING_HIDDEN",
        targetType: "Listing",
        targetId: listingId,
        details: {
          listingTitle: result.listing.title,
          ownerId: result.listing.ownerId,
          previousStatus: result.listing.status,
          previousStatusReason: result.listing.statusReason,
          newStatus: "PAUSED",
          newStatusReason: "SUPPRESSED",
          reportCount: result.reportCount,
          suppressedDueToAdminDelete: true,
          version: result.newVersion,
        },
      });
    } else {
      await logAdminAction({
        adminId: adminCheck.userId!,
        action: "LISTING_DELETED",
        targetType: "Listing",
        targetId: listingId,
        details: {
          listingTitle: result.listing.title,
          ownerId: result.listing.ownerId,
          previousStatus: result.listing.status,
        },
      });
    }

    revalidatePath("/admin/listings");
    return result.action === "suppressed"
      ? {
          success: true,
          action: result.action,
          notifiedTenants: 0,
          status: "PAUSED" as const,
          statusReason: "SUPPRESSED" as const,
          version: result.newVersion,
        }
      : { success: true, action: result.action, notifiedTenants: 0 };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") return { error: "Listing not found" };
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
    const reviewedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const [report] = await tx.$queryRaw<
        Array<{
          status: ReportStatus;
          reason: string;
          listingId: string;
          reporterId: string;
        }>
      >`
        SELECT status, reason, "listingId", "reporterId"
        FROM "Report"
        WHERE id = ${reportId}
        FOR UPDATE
      `;

      if (!report) {
        return { error: "Report not found", code: "NOT_FOUND" } as const;
      }

      if (report.status !== "OPEN") {
        return {
          error: "This report has already been reviewed.",
          code: "STATE_CONFLICT",
        } as const;
      }

      await tx.report.update({
        where: { id: reportId },
        data: {
          status: action,
          adminNotes: notes,
          reviewedBy: adminCheck.userId,
          resolvedAt: reviewedAt,
        },
      });

      return { success: true, report } as const;
    });

    if ("error" in result) {
      return result;
    }

    // Audit log
    await logAdminAction({
      adminId: adminCheck.userId!,
      action: action === "RESOLVED" ? "REPORT_RESOLVED" : "REPORT_DISMISSED",
      targetType: "Report",
      targetId: reportId,
      details: {
        previousStatus: result.report.status,
        newStatus: action,
        reason: result.report.reason,
        listingId: result.report.listingId,
        reporterId: result.report.reporterId,
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
      const [report] = await tx.$queryRaw<
        Array<{
          listingId: string;
          reason: string;
          reporterId: string;
          status: ReportStatus;
        }>
      >`
        SELECT "listingId", reason, "reporterId", status
        FROM "Report"
        WHERE id = ${reportId}
        FOR UPDATE
      `;

      if (!report) {
        return { error: "Report not found", code: "NOT_FOUND" } as const;
      }

      if (report.status !== "OPEN") {
        return {
          error: "This report has already been reviewed.",
          code: "STATE_CONFLICT",
        } as const;
      }

      // Lock listing row to prevent concurrent moderation races.
      const [listing] = await tx.$queryRaw<
        {
          id: string;
          title: string;
          ownerId: string;
          status: ListingStatus;
          statusReason: string | null;
          version: number;
        }[]
      >`
        SELECT "id", "title", "ownerId", status, "statusReason", version
        FROM "Listing"
        WHERE "id" = ${report.listingId}
        FOR UPDATE
      `;

      if (!listing) {
        return { error: "Listing not found", code: "NOT_FOUND" } as const;
      }

      // Update report status
      await tx.report.update({
        where: { id: reportId },
        data: {
          status: "RESOLVED",
          adminNotes: notes || "Listing suppressed due to policy violation",
          reviewedBy: adminCheck.userId,
          resolvedAt: new Date(),
        },
      });

      await tx.listing.update({
        where: { id: report.listingId },
        data: {
          status: "PAUSED",
          statusReason: "SUPPRESSED",
          version: listing.version + 1,
        },
      });

      await markListingDirtyInTx(tx, report.listingId, "status_changed");
      await syncListingLifecycleProjectionInTx(tx, report.listingId, {
        role: "moderator",
        id: adminCheck.userId,
      });

      return {
        success: true,
        report,
        listing,
        newVersion: listing.version + 1,
      } as const;
    });

    if ("error" in result) {
      return result;
    }

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
        adminNotes: notes || "Listing suppressed due to policy violation",
        listingSuppressed: true,
      },
    });

    // Audit log for listing suppression
    await logAdminAction({
      adminId: adminCheck.userId!,
      action: "LISTING_HIDDEN",
      targetType: "Listing",
      targetId: result.report.listingId,
      details: {
        listingTitle: result.listing.title,
        ownerId: result.listing.ownerId,
        previousStatus: result.listing.status,
        previousStatusReason: result.listing.statusReason,
        newStatus: "PAUSED",
        newStatusReason: "SUPPRESSED",
        version: result.newVersion,
        suppressedDueToReport: reportId,
        adminNotes: notes || "Listing suppressed due to policy violation",
      },
    });

    revalidatePath("/admin/reports");
    revalidatePath("/admin/listings");
    return { success: true, affectedBookings: 0 };
  } catch (error) {
    logger.sync.error("Failed to resolve report with listing suppression", {
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
      totalMessages,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isVerified: true } }),
      prisma.user.count({ where: { isSuspended: true } }),
      prisma.listing.count(),
      prisma.listing.count({ where: { status: "ACTIVE" } }),
      prisma.verificationRequest.count({ where: { status: "PENDING" } }),
      prisma.report.count({ where: { status: "OPEN" } }),
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
      totalBookings: 0,
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
