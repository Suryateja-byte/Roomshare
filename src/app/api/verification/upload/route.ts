import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkSuspension } from "@/app/actions/suspension";
import { validateCsrf } from "@/lib/csrf";
import { getClientIP } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import {
  buildVerificationStoragePath,
  getVerificationStorageClient,
  isVerificationMimeType,
  validateVerificationMagicBytes,
  VERIFICATION_DOCUMENTS_BUCKET,
  VERIFICATION_UPLOAD_TTL_MS,
  type VerificationUploadKind,
} from "@/lib/verification/storage";

export const runtime = "nodejs";

const MAX_VERIFICATION_UPLOAD_BYTES = 10 * 1024 * 1024;

function parseKind(
  value: FormDataEntryValue | null
): VerificationUploadKind | null {
  return value === "document" || value === "selfie" ? value : null;
}

export async function POST(request: NextRequest) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  const ipRateLimit = await withRateLimit(request, {
    type: "verificationUpload",
  });
  if (ipRateLimit) return ipRateLimit;

  let storagePath: string | null = null;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRateLimit = await withRateLimit(request, {
      type: "verificationUpload",
      endpoint: "/api/verification/upload/user",
      getIdentifier: (rateLimitedRequest) =>
        `${getClientIP(rateLimitedRequest)}:${session.user.id}`,
    });
    if (userRateLimit) return userRateLimit;

    const suspension = await checkSuspension(session.user.id);
    if (suspension.suspended) {
      return NextResponse.json(
        { error: suspension.error || "Account suspended" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const kind = parseKind(formData.get("kind"));

    if (!kind) {
      return NextResponse.json(
        { error: "Invalid verification upload kind" },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_VERIFICATION_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB" },
        { status: 400 }
      );
    }

    if (!isVerificationMimeType(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, WebP" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateVerificationMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: "File content does not match declared type" },
        { status: 400 }
      );
    }

    let processedBuffer: Buffer;
    try {
      processedBuffer = await sharp(buffer).rotate().toBuffer();
    } catch (error) {
      logger.sync.warn("Verification image processing failed", {
        route: "/api/verification/upload",
        fileType: file.type,
        fileSize: buffer.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: "Image processing failed. Please try a different image." },
        { status: 400 }
      );
    }

    storagePath = buildVerificationStoragePath(
      session.user.id,
      kind,
      file.type
    );
    const supabase = getVerificationStorageClient();
    const { error: uploadError } = await supabase.storage
      .from(VERIFICATION_DOCUMENTS_BUCKET)
      .upload(storagePath, processedBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const expiresAt = new Date(Date.now() + VERIFICATION_UPLOAD_TTL_MS);
    const upload = await prisma.verificationUpload.create({
      data: {
        userId: session.user.id,
        kind,
        storagePath,
        mimeType: file.type,
        sizeBytes: processedBuffer.length,
        expiresAt,
      },
      select: {
        id: true,
        kind: true,
        expiresAt: true,
      },
    });

    return NextResponse.json({
      uploadId: upload.id,
      kind: upload.kind,
      expiresAt: upload.expiresAt.toISOString(),
    });
  } catch (error) {
    if (storagePath) {
      try {
        await getVerificationStorageClient()
          .storage.from(VERIFICATION_DOCUMENTS_BUCKET)
          .remove([storagePath]);
      } catch (cleanupError) {
        logger.sync.warn("Failed to clean up verification upload", {
          route: "/api/verification/upload",
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      }
    }

    if (
      error instanceof Error &&
      error.message === "VERIFICATION_STORAGE_NOT_CONFIGURED"
    ) {
      return NextResponse.json(
        { error: "Verification storage not configured" },
        { status: 500 }
      );
    }

    logger.sync.error("Verification upload failed", {
      route: "/api/verification/upload",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to upload verification document" },
      { status: 500 }
    );
  }
}
