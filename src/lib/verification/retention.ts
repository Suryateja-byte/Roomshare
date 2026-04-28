import "server-only";

import { prisma } from "@/lib/prisma";
import {
  deleteVerificationObjects,
  VERIFICATION_DOCUMENT_RETENTION_MS,
} from "@/lib/verification/storage";

interface CleanupExpiredVerificationDocumentsOptions {
  now?: Date;
  batchSize?: number;
}

export async function cleanupExpiredVerificationDocumentsOnce(
  options: CleanupExpiredVerificationDocumentsOptions = {}
) {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 50;
  const pendingCutoff = new Date(
    now.getTime() - VERIFICATION_DOCUMENT_RETENTION_MS
  );

  const expiredRequests = await prisma.verificationRequest.findMany({
    where: {
      status: { in: ["APPROVED", "REJECTED"] },
      documentsDeletedAt: null,
      documentsExpireAt: { lte: now },
      OR: [{ documentPath: { not: null } }, { selfiePath: { not: null } }],
    },
    select: {
      id: true,
      documentPath: true,
      selfiePath: true,
    },
    orderBy: { documentsExpireAt: "asc" },
    take: batchSize,
  });
  const expiredPendingRequests = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        documentPath: string | null;
        selfiePath: string | null;
      }>
    >`
      SELECT id, "documentPath", "selfiePath"
      FROM "VerificationRequest"
      WHERE status = 'PENDING'
        AND ("documentPath" IS NOT NULL OR "selfiePath" IS NOT NULL)
        AND (
          (
            "documentsDeletedAt" IS NULL
            AND (
              ("documentsExpireAt" IS NOT NULL AND "documentsExpireAt" <= ${now})
              OR ("documentsExpireAt" IS NULL AND "createdAt" <= ${pendingCutoff})
            )
          )
          OR "documentsDeletedAt" IS NOT NULL
        )
      ORDER BY COALESCE("documentsExpireAt", "createdAt") ASC
      LIMIT ${batchSize}
      FOR UPDATE
    `;

    const idsToTombstone = rows.map((request) => request.id);
    if (idsToTombstone.length > 0) {
      await tx.verificationRequest.updateMany({
        where: { id: { in: idsToTombstone }, documentsDeletedAt: null },
        data: { documentsDeletedAt: now },
      });
    }

    return rows;
  });
  const expiredStagedUploads = await prisma.verificationUpload.findMany({
    where: {
      consumedAt: null,
      expiresAt: { lte: now },
    },
    select: {
      id: true,
      storagePath: true,
    },
    orderBy: { expiresAt: "asc" },
    take: batchSize,
  });

  const requestIds = expiredRequests.map((request) => request.id);
  const expiredPendingRequestIds = expiredPendingRequests.map(
    (request) => request.id
  );
  const expiredUploadIds = expiredStagedUploads.map((upload) => upload.id);
  const storagePaths = [
    ...expiredRequests.flatMap((request) => [
      request.documentPath,
      request.selfiePath,
    ]),
    ...expiredPendingRequests.flatMap((request) => [
      request.documentPath,
      request.selfiePath,
    ]),
    ...expiredStagedUploads.map((upload) => upload.storagePath),
  ];

  const deletedObjects = await deleteVerificationObjects(storagePaths);

  if (requestIds.length > 0) {
    await prisma.$transaction([
      prisma.verificationRequest.updateMany({
        where: { id: { in: requestIds } },
        data: {
          documentPath: null,
          selfiePath: null,
          documentMimeType: null,
          selfieMimeType: null,
          documentsDeletedAt: now,
        },
      }),
      prisma.verificationUpload.deleteMany({
        where: { requestId: { in: requestIds } },
      }),
    ]);
  }

  if (expiredPendingRequestIds.length > 0) {
    await prisma.$transaction([
      prisma.verificationUpload.deleteMany({
        where: { requestId: { in: expiredPendingRequestIds } },
      }),
      prisma.verificationRequest.deleteMany({
        where: {
          id: { in: expiredPendingRequestIds },
          status: "PENDING",
          documentsDeletedAt: { not: null },
        },
      }),
    ]);
  }

  if (expiredUploadIds.length > 0) {
    await prisma.verificationUpload.deleteMany({
      where: { id: { in: expiredUploadIds } },
    });
  }

  return {
    requestsProcessed: requestIds.length,
    pendingRequestsExpired: expiredPendingRequestIds.length,
    stagedUploadsDeleted: expiredUploadIds.length,
    objectsDeleted: deletedObjects,
  };
}
