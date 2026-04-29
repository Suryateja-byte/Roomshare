import { logAdminAction } from "@/lib/audit";
import { requireAdminAuth } from "@/lib/admin-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getClientIP, checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createVerificationSignedUrl } from "@/lib/verification/storage";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteParams = Promise<{ id: string; kind: string }>;

function parseDocumentKind(kind: string): "document" | "selfie" | null {
  return kind === "document" || kind === "selfie" ? kind : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: RouteParams }
) {
  const { id, kind: rawKind } = await params;
  const kind = parseDocumentKind(rawKind);

  if (!kind) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const adminCheck = await requireAdminAuth();
  if (adminCheck.code === "SESSION_EXPIRED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (adminCheck.error) {
    return NextResponse.json({ error: adminCheck.error }, { status: 403 });
  }
  const adminId = adminCheck.userId;
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIP(request);
  const rateLimit = await checkRateLimit(
    `${ip}:${adminId}`,
    "verificationDocumentView",
    RATE_LIMITS.verificationDocumentView
  );
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  try {
    const verificationRequest = await prisma.verificationRequest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        documentType: true,
        documentPath: true,
        selfiePath: true,
        documentsExpireAt: true,
        documentsDeletedAt: true,
      },
    });

    if (!verificationRequest) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (verificationRequest.documentsDeletedAt) {
      return NextResponse.json({ error: "Document deleted" }, { status: 410 });
    }

    if (
      !verificationRequest.documentsExpireAt ||
      verificationRequest.documentsExpireAt <= new Date()
    ) {
      return NextResponse.json({ error: "Document expired" }, { status: 410 });
    }

    const storagePath =
      kind === "document"
        ? verificationRequest.documentPath
        : verificationRequest.selfiePath;

    if (!storagePath) {
      return NextResponse.json(
        { error: "Document unavailable" },
        { status: 404 }
      );
    }

    const signedUrl = await createVerificationSignedUrl(storagePath);

    await logAdminAction({
      adminId,
      action: "VERIFICATION_DOCUMENT_VIEWED",
      targetType: "VerificationRequest",
      targetId: verificationRequest.id,
      details: {
        userId: verificationRequest.userId,
        kind,
        documentType: verificationRequest.documentType,
      },
      ipAddress: ip,
    });

    const response = NextResponse.redirect(signedUrl, 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    logger.sync.error("Failed to create verification document signed URL", {
      route: "/api/admin/verifications/[id]/documents/[kind]",
      requestId: id,
      kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to open verification document" },
      { status: 500 }
    );
  }
}
