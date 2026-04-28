"use server";

import { auth } from "@/auth";
import { logAdminAction } from "@/lib/audit";
import { sendNotificationEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimit,
  getClientIPFromHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { noHtmlTags, sanitizeUnicode } from "@/lib/schemas";
import {
  deleteVerificationObjects,
  VERIFICATION_DOCUMENT_RETENTION_MS,
} from "@/lib/verification/storage";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireAdmin } from "./admin";
import { checkSuspension } from "./suspension";

export type DocumentType = "passport" | "driver_license" | "national_id";

interface SubmitVerificationInput {
  documentType: DocumentType;
  documentUploadId: string;
  selfieUploadId?: string;
}

const documentTypeSchema = z.enum([
  "passport",
  "driver_license",
  "national_id",
]);

const uploadIdSchema = z.string().trim().min(1).max(100);

const submitVerificationSchema = z
  .object({
    documentType: documentTypeSchema,
    documentUploadId: uploadIdSchema,
    selfieUploadId: uploadIdSchema.optional(),
  })
  .strict();

const rejectVerificationSchema = z.object({
  requestId: z.string().trim().min(1).max(100),
  reason: z
    .string()
    .transform(sanitizeUnicode)
    .pipe(
      z
        .string()
        .min(1, "Reason is required")
        .max(500, "Reason must be 500 characters or less")
        .refine(noHtmlTags, "Reason cannot contain HTML")
    ),
});

// 24-hour cooldown period after rejection (balances spam prevention with UX)
const COOLDOWN_HOURS = 24;

function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

async function checkActionRateLimit(
  userId: string,
  type: keyof typeof RATE_LIMITS,
  endpoint: string
) {
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  return checkRateLimit(`${ip}:${userId}`, endpoint, RATE_LIMITS[type]);
}

async function checkAdminWriteRateLimit(adminId: string) {
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  return checkRateLimit(
    `${ip}:${adminId}`,
    "adminWrite",
    RATE_LIMITS.adminWrite
  );
}

function documentRetentionExpiry(now: Date): Date {
  return new Date(now.getTime() + VERIFICATION_DOCUMENT_RETENTION_MS);
}

export async function submitVerificationRequest(
  input: SubmitVerificationInput
) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", code: "SESSION_EXPIRED" };
  }

  const suspension = await checkSuspension(session.user.id);
  if (suspension.suspended) {
    return { error: suspension.error || "Account suspended" };
  }

  const rateLimit = await checkActionRateLimit(
    session.user.id,
    "verificationSubmit",
    "verificationSubmit"
  );
  if (!rateLimit.success) {
    return { error: "Too many requests. Please try again later." };
  }

  const parsed = submitVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid verification input" };
  }
  const validatedInput = parsed.data;

  if (validatedInput.documentUploadId === validatedInput.selfieUploadId) {
    return { error: "Document and selfie uploads must be different files" };
  }

  try {
    const now = new Date();
    const request = await prisma.$transaction(async (tx) => {
      const existingRequest = await tx.verificationRequest.findFirst({
        where: {
          userId: session.user.id,
          status: "PENDING",
        },
        select: { id: true },
      });

      if (existingRequest) {
        return {
          error: "You already have a pending verification request",
          code: "PENDING_REQUEST_EXISTS",
        } as const;
      }

      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        select: { isVerified: true },
      });

      if (user?.isVerified) {
        return { error: "You are already verified" } as const;
      }

      const cooldownTime = new Date(
        now.getTime() - COOLDOWN_HOURS * 60 * 60 * 1000
      );
      const recentRejection = await tx.verificationRequest.findFirst({
        where: {
          userId: session.user.id,
          status: "REJECTED",
          updatedAt: { gte: cooldownTime },
        },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      });

      if (recentRejection) {
        const cooldownEndTime = new Date(
          recentRejection.updatedAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000
        );
        const hoursRemaining = Math.ceil(
          (cooldownEndTime.getTime() - now.getTime()) / (1000 * 60 * 60)
        );
        return {
          error: `Please wait ${hoursRemaining} hour${hoursRemaining !== 1 ? "s" : ""} before resubmitting. Review the rejection reason and ensure your documents are clear, well-lit, and show all corners of the ID.`,
          cooldownRemaining: hoursRemaining,
        } as const;
      }

      const uploadIds = [
        validatedInput.documentUploadId,
        validatedInput.selfieUploadId,
      ].filter(Boolean) as string[];

      const uploads = await tx.verificationUpload.findMany({
        where: { id: { in: uploadIds } },
        select: {
          id: true,
          userId: true,
          kind: true,
          storagePath: true,
          mimeType: true,
          expiresAt: true,
          consumedAt: true,
          requestId: true,
        },
      });
      const uploadsById = new Map(uploads.map((upload) => [upload.id, upload]));
      const documentUpload = uploadsById.get(validatedInput.documentUploadId);
      const selfieUpload = validatedInput.selfieUploadId
        ? uploadsById.get(validatedInput.selfieUploadId)
        : null;

      const isUsableUpload = (
        upload: NonNullable<typeof documentUpload>,
        expectedKind: "document" | "selfie"
      ) =>
        upload.userId === session.user.id &&
        upload.kind === expectedKind &&
        !upload.consumedAt &&
        !upload.requestId &&
        upload.expiresAt > now;

      if (!documentUpload || !isUsableUpload(documentUpload, "document")) {
        return { error: "Document upload is invalid or expired" } as const;
      }

      if (
        validatedInput.selfieUploadId &&
        (!selfieUpload || !isUsableUpload(selfieUpload, "selfie"))
      ) {
        return { error: "Selfie upload is invalid or expired" } as const;
      }

      const createdRequest = await tx.verificationRequest.create({
        data: {
          userId: session.user.id,
          documentType: validatedInput.documentType,
          documentUrl: null,
          selfieUrl: null,
          documentPath: documentUpload.storagePath,
          selfiePath: selfieUpload?.storagePath ?? null,
          documentMimeType: documentUpload.mimeType,
          selfieMimeType: selfieUpload?.mimeType ?? null,
          documentsExpireAt: documentRetentionExpiry(now),
          documentsDeletedAt: null,
        },
        select: { id: true },
      });

      const consumedUploads = await tx.verificationUpload.updateMany({
        where: {
          id: { in: uploadIds },
          userId: session.user.id,
          consumedAt: null,
          requestId: null,
          expiresAt: { gt: now },
        },
        data: {
          consumedAt: now,
          requestId: createdRequest.id,
        },
      });

      if (consumedUploads.count !== uploadIds.length) {
        throw new Error("VERIFICATION_UPLOAD_CONSUME_CONFLICT");
      }

      return { success: true, requestId: createdRequest.id } as const;
    });

    if ("error" in request) {
      return request;
    }

    revalidatePath("/profile");
    revalidatePath("/verify");

    return { success: true, requestId: request.requestId };
  } catch (error: unknown) {
    if (isPrismaKnownRequestError(error) && error.code === "P2002") {
      return {
        error: "You already have a pending verification request",
        code: "PENDING_REQUEST_EXISTS",
      };
    }
    if (
      error instanceof Error &&
      error.message === "VERIFICATION_UPLOAD_CONSUME_CONFLICT"
    ) {
      return { error: "Verification upload is invalid or expired" };
    }

    logger.sync.error("Failed to submit verification request", {
      action: "submitVerificationRequest",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to submit verification request" };
  }
}

export async function getMyVerificationStatus() {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "not_logged_in" as const };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isVerified: true },
    });

    if (user?.isVerified) {
      return { status: "verified" as const };
    }

    const pendingRequest = await prisma.verificationRequest.findFirst({
      where: {
        userId: session.user.id,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (pendingRequest) {
      return { status: "pending" as const, requestId: pendingRequest.id };
    }

    const rejectedRequest = await prisma.verificationRequest.findFirst({
      where: {
        userId: session.user.id,
        status: "REJECTED",
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        adminNotes: true,
        updatedAt: true,
      },
    });

    if (rejectedRequest) {
      const cooldownTime = new Date(
        Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000
      );
      const isInCooldown = rejectedRequest.updatedAt >= cooldownTime;
      let cooldownRemaining: number | undefined;
      let canResubmitAt: Date | undefined;

      if (isInCooldown) {
        canResubmitAt = new Date(
          rejectedRequest.updatedAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000
        );
        cooldownRemaining = Math.ceil(
          (canResubmitAt.getTime() - Date.now()) / (1000 * 60 * 60)
        );
      }

      return {
        status: "rejected" as const,
        reason:
          rejectedRequest.adminNotes || "Your verification was not approved",
        requestId: rejectedRequest.id,
        canResubmit: !isInCooldown,
        cooldownRemaining,
        canResubmitAt: canResubmitAt?.toISOString(),
      };
    }

    return { status: "not_started" as const };
  } catch (error: unknown) {
    logger.sync.error("Failed to get verification status", {
      action: "getMyVerificationStatus",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { status: "error" as const };
  }
}

// Admin functions
export async function getPendingVerifications() {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error, code: adminCheck.code, requests: [] };
  }

  try {
    const requests = await prisma.verificationRequest.findMany({
      where: { status: "PENDING" },
      select: {
        id: true,
        userId: true,
        documentType: true,
        status: true,
        adminNotes: true,
        createdAt: true,
        updatedAt: true,
        reviewedAt: true,
        reviewedBy: true,
        documentPath: true,
        selfiePath: true,
        documentsExpireAt: true,
        documentsDeletedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const now = new Date();
    return {
      requests: requests.map((request) => {
        const documentsAvailable =
          Boolean(request.documentPath) &&
          !request.documentsDeletedAt &&
          Boolean(request.documentsExpireAt) &&
          request.documentsExpireAt! > now;
        return {
          id: request.id,
          userId: request.userId,
          documentType: request.documentType,
          status: request.status,
          adminNotes: request.adminNotes,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
          reviewedAt: request.reviewedAt,
          reviewedBy: request.reviewedBy,
          hasDocument: documentsAvailable,
          hasSelfie:
            Boolean(request.selfiePath) &&
            !request.documentsDeletedAt &&
            Boolean(request.documentsExpireAt) &&
            request.documentsExpireAt! > now,
          canApprove: documentsAvailable,
          user: request.user,
        };
      }),
    };
  } catch (error: unknown) {
    logger.sync.error("Failed to fetch pending verifications", {
      action: "getPendingVerifications",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to fetch verifications", requests: [] };
  }
}

export async function approveVerification(requestId: string) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error, code: adminCheck.code };
  }

  const rateLimit = await checkAdminWriteRateLimit(adminCheck.userId!);
  if (!rateLimit.success) {
    return { error: "Too many requests. Please slow down." };
  }

  try {
    const reviewedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const [request] = await tx.$queryRaw<
        Array<{
          id: string;
          userId: string;
          documentType: string;
          status: "PENDING" | "APPROVED" | "REJECTED";
          documentPath: string | null;
          documentsExpireAt: Date | null;
          documentsDeletedAt: Date | null;
        }>
      >`
        SELECT id, "userId", "documentType", status, "documentPath", "documentsExpireAt", "documentsDeletedAt"
        FROM "VerificationRequest"
        WHERE id = ${requestId}
        FOR UPDATE
      `;

      if (!request) {
        return { error: "Request not found", code: "NOT_FOUND" } as const;
      }

      if (request.status !== "PENDING") {
        return {
          error: "This verification request has already been reviewed.",
          code: "STATE_CONFLICT",
        } as const;
      }

      if (
        !request.documentPath ||
        request.documentsDeletedAt ||
        !request.documentsExpireAt ||
        request.documentsExpireAt <= reviewedAt
      ) {
        return {
          error: "Verification document is unavailable or expired.",
          code: "DOCUMENT_UNAVAILABLE",
        } as const;
      }

      const user = await tx.user.findUnique({
        where: { id: request.userId },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        return { error: "User not found", code: "NOT_FOUND" } as const;
      }

      await tx.verificationRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewedAt,
          reviewedBy: adminCheck.userId!,
          documentsExpireAt: documentRetentionExpiry(reviewedAt),
        },
      });

      await tx.user.update({
        where: { id: request.userId },
        data: { isVerified: true },
      });

      return { success: true, request, user } as const;
    });

    if ("error" in result) {
      return result;
    }

    if (result.user.email) {
      await sendNotificationEmail("welcomeEmail", result.user.email, {
        userName: result.user.name || "User",
      });
    }

    await logAdminAction({
      adminId: adminCheck.userId!,
      action: "VERIFICATION_APPROVED",
      targetType: "VerificationRequest",
      targetId: requestId,
      details: {
        userId: result.request.userId,
        documentType: result.request.documentType,
      },
    });

    revalidatePath("/admin/verifications");

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to approve verification", {
      action: "approveVerification",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to approve verification" };
  }
}

export async function rejectVerification(requestId: string, reason: string) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return { error: adminCheck.error, code: adminCheck.code };
  }

  const rateLimit = await checkAdminWriteRateLimit(adminCheck.userId!);
  if (!rateLimit.success) {
    return { error: "Too many requests. Please slow down." };
  }

  const parsed = rejectVerificationSchema.safeParse({ requestId, reason });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const validated = parsed.data;

  try {
    const reviewedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const [request] = await tx.$queryRaw<
        Array<{
          id: string;
          userId: string;
          documentType: string;
          status: "PENDING" | "APPROVED" | "REJECTED";
        }>
      >`
        SELECT id, "userId", "documentType", status
        FROM "VerificationRequest"
        WHERE id = ${validated.requestId}
        FOR UPDATE
      `;

      if (!request) {
        return { error: "Request not found", code: "NOT_FOUND" } as const;
      }

      if (request.status !== "PENDING") {
        return {
          error: "This verification request has already been reviewed.",
          code: "STATE_CONFLICT",
        } as const;
      }

      const user = await tx.user.findUnique({
        where: { id: request.userId },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        return { error: "User not found", code: "NOT_FOUND" } as const;
      }

      await tx.verificationRequest.update({
        where: { id: validated.requestId },
        data: {
          status: "REJECTED",
          adminNotes: validated.reason,
          reviewedAt,
          reviewedBy: adminCheck.userId!,
          documentsExpireAt: documentRetentionExpiry(reviewedAt),
        },
      });

      return { success: true, request, user } as const;
    });

    if ("error" in result) {
      return result;
    }

    if (result.user.email) {
      await sendNotificationEmail("verificationRejected", result.user.email, {
        userName: result.user.name || "User",
        reason: validated.reason,
      });
    }

    await logAdminAction({
      adminId: adminCheck.userId!,
      action: "VERIFICATION_REJECTED",
      targetType: "VerificationRequest",
      targetId: validated.requestId,
      details: {
        userId: result.request.userId,
        documentType: result.request.documentType,
        rejectionReason: validated.reason,
      },
    });

    revalidatePath("/admin/verifications");
    revalidatePath("/verify");

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to reject verification", {
      action: "rejectVerification",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to reject verification" };
  }
}

export async function cancelVerificationRequest() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", code: "SESSION_EXPIRED" };
  }

  const suspension = await checkSuspension(session.user.id);
  if (suspension.suspended) {
    return { error: suspension.error || "Account suspended" };
  }

  const rateLimit = await checkActionRateLimit(
    session.user.id,
    "verificationCancel",
    "verificationCancel"
  );
  if (!rateLimit.success) {
    return { error: "Too many requests. Please try again later." };
  }

  try {
    const deletionRequestedAt = new Date();
    const cancellation = await prisma.$transaction(async (tx) => {
      const pendingRequests = await tx.$queryRaw<
        Array<{
          id: string;
          documentPath: string | null;
          selfiePath: string | null;
        }>
      >`
        SELECT id, "documentPath", "selfiePath"
        FROM "VerificationRequest"
        WHERE "userId" = ${session.user.id}
          AND status = 'PENDING'
        FOR UPDATE
      `;

      const pendingRequestIds = pendingRequests.map((request) => request.id);
      const requestUploadFilter =
        pendingRequestIds.length > 0
          ? Prisma.sql`"requestId" IN (${Prisma.join(pendingRequestIds)}) OR`
          : Prisma.empty;
      const stagedUploads = await tx.$queryRaw<
        Array<{
          id: string;
          storagePath: string;
        }>
      >(Prisma.sql`
        SELECT id, "storagePath"
        FROM "VerificationUpload"
        WHERE "userId" = ${session.user.id}
          AND (
            ${requestUploadFilter}
            ("requestId" IS NULL AND "consumedAt" IS NULL)
          )
        FOR UPDATE
      `);

      if (pendingRequestIds.length > 0) {
        await tx.verificationRequest.updateMany({
          where: { id: { in: pendingRequestIds }, userId: session.user.id },
          data: { documentsDeletedAt: deletionRequestedAt },
        });
      }

      return {
        pendingRequestIds,
        stagedUploadIds: stagedUploads.map((upload) => upload.id),
        storagePaths: [
          ...pendingRequests.flatMap((request) => [
            request.documentPath,
            request.selfiePath,
          ]),
          ...stagedUploads.map((upload) => upload.storagePath),
        ],
      };
    });

    await deleteVerificationObjects(cancellation.storagePaths);

    await prisma.$transaction(async (tx) => {
      if (cancellation.stagedUploadIds.length > 0) {
        await tx.verificationUpload.deleteMany({
          where: {
            id: { in: cancellation.stagedUploadIds },
            userId: session.user.id,
          },
        });
      }

      if (cancellation.pendingRequestIds.length > 0) {
        await tx.verificationRequest.deleteMany({
          where: {
            id: { in: cancellation.pendingRequestIds },
            userId: session.user.id,
            status: "PENDING",
          },
        });
      }
    });

    revalidatePath("/verify");
    revalidatePath("/profile");

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to cancel verification request", {
      action: "cancelVerificationRequest",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to cancel verification request" };
  }
}
