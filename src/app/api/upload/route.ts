import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createClient } from "@supabase/supabase-js";
import { withRateLimit } from "@/lib/with-rate-limit";
import { captureApiError } from "@/lib/api-error-handler";
import { validateCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { z } from "zod";
import sharp from "sharp";
import { circuitBreakers, isCircuitOpenError } from "@/lib/circuit-breaker";

// Initialize Supabase client with service role for storage operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Magic bytes signatures for image validation
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  "image/gif": [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }], // GIF8
  "image/webp": [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
  ],
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;

  for (const sig of signatures) {
    if (buffer.length < sig.offset + sig.bytes.length) return false;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[sig.offset + i] !== sig.bytes[i]) return false;
    }
  }
  return true;
}

// Safe extension mapping from validated MIME type
const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

const deleteUploadSchema = z.object({
  path: z.string().trim().min(1).max(500),
});

export async function POST(request: NextRequest) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  // P1-6 FIX: Add rate limiting to prevent storage abuse
  const rateLimitResponse = await withRateLimit(request, { type: "upload" });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check Supabase configuration
    if (!supabaseUrl || !supabaseServiceKey) {
      logger.sync.error("Missing Supabase config", {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey,
      });
      return NextResponse.json(
        { error: "Storage not configured" },
        { status: 500 }
      );
    }

    // Create Supabase client with explicit fetch options for better error handling
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Get form data
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string; // 'profile' or 'listing'

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size first (max 5MB) - check before reading buffer
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB" },
        { status: 400 }
      );
    }

    // Validate declared MIME type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" },
        { status: 400 }
      );
    }

    // Convert file to buffer for magic bytes validation
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate magic bytes to prevent MIME type spoofing
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        {
          error: "File content does not match declared type. Upload rejected.",
        },
        { status: 400 }
      );
    }

    // Strip EXIF/metadata (GPS coords, camera serial) while preserving orientation
    let processedBuffer: Buffer;
    try {
      if (file.type === "image/gif") {
        // Re-encode GIF through sharp to strip metadata while preserving animation
        processedBuffer = await sharp(buffer, { animated: true })
          .gif()
          .toBuffer();
      } else {
        // rotate() auto-applies EXIF orientation then strips all metadata
        processedBuffer = await sharp(buffer).rotate().toBuffer();
      }
    } catch (sharpError) {
      logger.sync.warn("Sharp image processing failed, rejecting upload", {
        route: "/api/upload",
        fileType: file.type,
        fileSize: buffer.length,
        error:
          sharpError instanceof Error ? sharpError.message : String(sharpError),
      });
      return NextResponse.json(
        { error: "Image processing failed. Please try a different image." },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = MIME_TO_EXTENSION[file.type];
    const filename = `${timestamp}-${randomString}.${extension}`;

    // Determine storage path based on type
    const bucket = "images";
    const folder = type === "profile" ? "profiles" : "listings";
    const path = `${folder}/${session.user.id}/${filename}`;

    // Upload to Supabase Storage with circuit breaker + timeout
    const UPLOAD_TIMEOUT_MS = 15000;

    try {
      await circuitBreakers.supabaseStorage.execute(async () => {
        const uploadPromise = supabase.storage
          .from(bucket)
          .upload(path, processedBuffer, {
            contentType: file.type,
            upsert: false,
          });

        // Race upload against timeout — clear timer on settlement to prevent leak
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("Upload timeout")),
            UPLOAD_TIMEOUT_MS
          );
        });
        uploadPromise.then(
          () => clearTimeout(timeoutId!),
          () => clearTimeout(timeoutId!)
        );

        const { error: uploadError } = await Promise.race([
          uploadPromise,
          timeoutPromise,
        ]);

        // CRITICAL: Throw on SDK error so circuit breaker counts it as failure
        if (uploadError) {
          throw uploadError;
        }
      });

      // Check if client disconnected after upload (partial fix for P2-2d)
      if (request.signal.aborted) {
        try {
          await supabase.storage.from(bucket).remove([path]);
        } catch (cleanupErr) {
          logger.sync.warn(
            "Failed to clean up orphaned upload after client abort",
            {
              route: "/api/upload",
              path,
              error:
                cleanupErr instanceof Error
                  ? cleanupErr.message
                  : String(cleanupErr),
            }
          );
        }
        return new NextResponse(null, { status: 499 });
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);

      return NextResponse.json({ url: urlData.publicUrl, path });
    } catch (error) {
      if (isCircuitOpenError(error)) {
        return NextResponse.json(
          { error: "Storage service temporarily unavailable" },
          { status: 503, headers: { "Retry-After": "30" } }
        );
      }
      if (error instanceof Error && error.message === "Upload timeout") {
        return NextResponse.json(
          { error: "Upload timed out. Please try again." },
          { status: 504 }
        );
      }
      throw error;
    }
  } catch (error) {
    // Handle specific error types
    if (error instanceof TypeError && error.message.includes("fetch")) {
      captureApiError(error, { route: "/api/upload", method: "POST" });
      return NextResponse.json(
        { error: "Unable to connect to storage service" },
        { status: 503 }
      );
    }

    return captureApiError(error, { route: "/api/upload", method: "POST" });
  }
}

// Delete uploaded image
export async function DELETE(request: NextRequest) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, {
    type: "uploadDelete",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Storage not configured" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const parsed = deleteUploadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request payload",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { path } = parsed.data;

    if (!path) {
      return NextResponse.json({ error: "No path provided" }, { status: 400 });
    }

    // P0-01 FIX: Strict prefix validation to prevent path traversal attacks
    // Before: path.includes() was bypassable with "../" sequences
    // After: Strict startsWith() with expected prefix structure
    const folder = path.startsWith("profiles/") ? "profiles" : "listings";
    const expectedPrefix = `${folder}/${session.user.id}/`;
    if (!path.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { error: deleteError } = await supabase.storage
      .from("images")
      .remove([path]);

    if (deleteError) {
      logger.sync.error("Supabase delete error", {
        errorType: deleteError.name,
      });
      return NextResponse.json(
        { error: "Failed to delete file" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return captureApiError(error, { route: "/api/upload", method: "DELETE" });
  }
}
