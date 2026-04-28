import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { geocodeAddress } from "@/lib/geocoding";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import {
  householdLanguagesSchema,
  supabaseImageUrlSchema,
  sanitizeUnicode,
  noHtmlTags,
  NO_HTML_MSG,
  listingLeaseDurationSchema,
  listingRoomTypeSchema,
  listingGenderPreferenceSchema,
  listingHouseholdGenderSchema,
} from "@/lib/schemas";
import { VALID_AMENITIES, VALID_HOUSE_RULES } from "@/lib/filter-schema";
import { checkListingLanguageCompliance } from "@/lib/listing-language-guard";
import { isValidLanguageCode } from "@/lib/languages";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import { withRateLimit } from "@/lib/with-rate-limit";
import { captureApiError } from "@/lib/api-error-handler";
import { isCircuitOpenError } from "@/lib/circuit-breaker";
import { validateCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { checkSuspension, checkEmailVerified } from "@/app/actions/suspension";
import { normalizeStringList } from "@/lib/utils";
import { z } from "zod";
import { features } from "@/lib/env";
import { syncListingEmbedding } from "@/lib/embeddings/sync";
import { getHostModerationWriteLockResult } from "@/lib/listings/moderation-write-lock";
import { normalizeAddress } from "@/lib/search/normalize-address";
import { syncCanonicalListingInventory } from "@/lib/listings/canonical-inventory";
import {
  isStrictDateOnly,
  parseStrictDateOnlyToUtcDate,
} from "@/lib/date-only";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_FRESHNESS_SECONDS = 5 * 60;

// Extract storage path from Supabase public URL
function extractStoragePath(publicUrl: string): string | null {
  const match = publicUrl.match(/\/storage\/v1\/object\/public\/images\/(.+)$/);
  return match ? match[1] : null;
}

async function readDeletePayload(
  request: Request
): Promise<{ password?: string } | null> {
  const body = await request.text();
  if (!body.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const password = (parsed as { password?: unknown }).password;
    return typeof password === "string" ? { password } : {};
  } catch {
    return null;
  }
}

const expectedVersionSchema = z.coerce.number().int().min(1);

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
  .refine((value) => isStrictDateOnly(value), {
    message: "Invalid calendar date",
  });

const nullableDateOnlySchema = z.union([dateOnlySchema, z.null()]);

function toUtcDateOnly(value: string): Date {
  const parsed = parseStrictDateOnlyToUtcDate(value);
  if (!parsed) {
    throw new Error("Invalid date-only value");
  }
  return parsed;
}

function todayUtcDateOnly(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

const listingProfilePatchSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    title: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform(sanitizeUnicode)
      .refine(noHtmlTags, NO_HTML_MSG),
    description: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .transform(sanitizeUnicode)
      .refine(noHtmlTags, NO_HTML_MSG),
    price: z.coerce.number().positive().multipleOf(0.01),
    amenities: z
      .union([
        z.array(z.string().max(50).transform(sanitizeUnicode)).max(20),
        z.string().transform((s) => [sanitizeUnicode(s)]),
      ])
      .optional()
      .default([]),
    houseRules: z
      .union([
        z.array(z.string().max(50).transform(sanitizeUnicode)).max(20),
        z.string().transform((s) => [sanitizeUnicode(s)]),
      ])
      .optional()
      .default([]),
    address: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .transform(sanitizeUnicode)
      .refine(noHtmlTags, NO_HTML_MSG),
    city: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform(sanitizeUnicode)
      .refine(noHtmlTags, NO_HTML_MSG),
    state: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform(sanitizeUnicode)
      .refine(noHtmlTags, NO_HTML_MSG),
    zip: z.string().trim().min(1).max(20),
    leaseDuration: listingLeaseDurationSchema,
    roomType: listingRoomTypeSchema,
    householdLanguages: z
      .array(z.string().trim().toLowerCase().transform(sanitizeUnicode))
      .max(20)
      .optional(),
    genderPreference: listingGenderPreferenceSchema,
    householdGender: listingHouseholdGenderSchema,
    primaryHomeLanguage: z
      .string()
      .refine(isValidLanguageCode, { message: "Invalid language code" })
      .nullable()
      .optional(),
    images: z.array(supabaseImageUrlSchema).max(10).optional(),
  })
  .strict();

const hostManagedAvailabilityPatchSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    openSlots: z.coerce.number().int().min(0).max(20),
    totalSlots: z.coerce.number().int().min(1).max(20),
    moveInDate: nullableDateOnlySchema,
    availableUntil: nullableDateOnlySchema.optional(),
    minStayMonths: z.coerce.number().int().min(1),
    status: z.enum(["ACTIVE", "PAUSED", "RENTED"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.openSlots > value.totalSlots) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["openSlots"],
        message: "Open slots cannot exceed total slots",
      });
    }

    if (value.status === "ACTIVE") {
      if (value.openSlots <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["openSlots"],
          message: "Active listings require at least one open slot",
        });
      }
      if (!value.moveInDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["moveInDate"],
          message: "Move-in date is required for active listings",
        });
      }
    }

    if (value.availableUntil) {
      const availableUntil = toUtcDateOnly(value.availableUntil);
      const today = todayUtcDateOnly();
      if (availableUntil < today) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["availableUntil"],
          message: "Available until date cannot be in the past",
        });
      }
      if (
        value.moveInDate &&
        availableUntil < toUtcDateOnly(value.moveInDate)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["availableUntil"],
          message: "Available until date cannot be before move-in date",
        });
      }
    }
  });

type ListingProfilePatch = z.infer<typeof listingProfilePatchSchema>;
type HostManagedAvailabilityPatch = z.infer<
  typeof hostManagedAvailabilityPatchSchema
>;

function isHostManagedAvailabilityPatch(rawBody: unknown): boolean {
  return (
    !!rawBody &&
    typeof rawBody === "object" &&
    !Array.isArray(rawBody) &&
    ("openSlots" in rawBody || "status" in rawBody)
  );
}

function hasRetiredAvailabilityKeys(rawBody: unknown): boolean {
  return (
    !!rawBody &&
    typeof rawBody === "object" &&
    !Array.isArray(rawBody) &&
    ("totalSlots" in rawBody ||
      "moveInDate" in rawBody ||
      "availableUntil" in rawBody ||
      "minStayMonths" in rawBody)
  );
}

function getHostManagedDateOnlyErrors(
  rawBody: unknown
): Record<string, string[]> {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return {};
  }

  const body = rawBody as Record<string, unknown>;
  const fieldErrors: Record<string, string[]> = {};
  if (
    typeof body.moveInDate === "string" &&
    !parseStrictDateOnlyToUtcDate(body.moveInDate.trim())
  ) {
    fieldErrors.moveInDate = ["Invalid calendar date"];
  }
  if (
    typeof body.availableUntil === "string" &&
    !parseStrictDateOnlyToUtcDate(body.availableUntil.trim())
  ) {
    fieldErrors.availableUntil = ["Invalid calendar date"];
  }
  return fieldErrors;
}

type LockedListingRow = {
  id: string;
  ownerId: string;
  version: number;
  status: string;
  statusReason: string | null;
  normalizedAddress: string | null;
  physicalUnitId: string | null;
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
};

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, {
    type: "deleteListing",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Per-user rate limiting (after auth, complements IP-based rate limit above)
    const userDeleteRateLimit = await withRateLimit(request, {
      type: "deleteListing",
      getIdentifier: () => `user:${session.user.id}`,
      endpoint: "/api/listings/[id]/user",
    });
    if (userDeleteRateLimit) return userDeleteRateLimit;

    const deletePayload = await readDeletePayload(request);
    if (!deletePayload) {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.password) {
      if (!deletePayload.password) {
        return NextResponse.json(
          {
            error: "Password is required to delete this listing",
            code: "PASSWORD_REQUIRED",
          },
          { status: 403 }
        );
      }

      const passwordValid = await bcrypt.compare(
        deletePayload.password,
        user.password
      );
      if (!passwordValid) {
        return NextResponse.json(
          { error: "Password is incorrect", code: "PASSWORD_INVALID" },
          { status: 403 }
        );
      }
    } else {
      const authTime = session.authTime;
      if (
        !authTime ||
        Math.floor(Date.now() / 1000) - authTime > SESSION_FRESHNESS_SECONDS
      ) {
        return NextResponse.json(
          {
            error: "Please sign in again to confirm listing deletion.",
            code: "SESSION_FRESHNESS_REQUIRED",
          },
          { status: 403 }
        );
      }
    }

    const { id } = await params;

    // Wrap ownership check + delete/suppression in interactive transaction with
    // FOR UPDATE to prevent TOCTOU races between ownership, reports, and writes.
    let deleteResult:
      | {
          action: "deleted";
          listingImages: string[];
        }
      | {
          action: "suppressed";
          ownerId: string;
          reportCount: number;
        };

    try {
      deleteResult = await prisma.$transaction(async (tx) => {
        // Lock the listing row to prevent concurrent modifications
        const [listing] = await tx.$queryRaw<
          Array<{
            ownerId: string;
            images: string[];
            version: number;
          }>
        >`
                    SELECT "ownerId", "images", "version" FROM "Listing"
                    WHERE "id" = ${id}
                    FOR UPDATE
                `;

        if (!listing || listing.ownerId !== session.user.id) {
          throw new Error("NOT_FOUND_OR_UNAUTHORIZED");
        }

        const reportCount = await tx.report.count({ where: { listingId: id } });
        if (reportCount > 0) {
          await tx.listing.update({
            where: { id },
            data: {
              status: "PAUSED",
              statusReason: "SUPPRESSED",
              version: listing.version + 1,
            },
          });
          await markListingDirtyInTx(tx, id, "status_changed");

          return {
            action: "suppressed",
            ownerId: listing.ownerId,
            reportCount,
          } as const;
        }

        // Delete listing; contact-first tables are independent projections/ledgers.
        await tx.listing.delete({ where: { id } });
        return {
          action: "deleted",
          listingImages: listing.images || [],
        } as const;
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "NOT_FOUND_OR_UNAUTHORIZED") {
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        }
      }
      throw error;
    }

    if (deleteResult.action === "suppressed") {
      try {
        await logger.info("Owner listing delete suppressed", {
          action: "ownerDeleteListingSuppressed",
          route: "/api/listings/[id]",
          method: "DELETE",
          listingId: id,
          ownerId: deleteResult.ownerId,
          reportCount: deleteResult.reportCount,
        });
      } catch (logError) {
        logger.sync.error("Failed to log owner listing suppression", {
          action: "ownerDeleteListingSuppressed",
          listingId: id,
          error:
            logError instanceof Error ? logError.message : "Unknown error",
        });
      }
    }

    // Hard-delete search doc cleanup is handled by ON DELETE CASCADE FK on
    // listing_search_docs and listing_search_doc_dirty. Suppressed listings are
    // marked dirty in the transaction above.

    // Clean up images from Supabase storage (outside transaction — best-effort)
    if (
      deleteResult.action === "deleted" &&
      deleteResult.listingImages.length > 0 &&
      supabaseUrl &&
      supabaseServiceKey
    ) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const paths = deleteResult.listingImages
          .map(extractStoragePath)
          .filter((p): p is string => p !== null);

        if (paths.length > 0) {
          await supabase.storage.from("images").remove(paths);
        }
      } catch (storageError) {
        logger.sync.error("Failed to delete images from storage", {
          error:
            storageError instanceof Error
              ? storageError.message
              : "Unknown error",
          route: "/api/listings/[id]",
          method: "DELETE",
        });
        // Continue even if storage cleanup fails
      }
    }

    return NextResponse.json(
      {
        success: true,
        notifiedTenants: 0,
      },
      { status: 200 }
    );
  } catch (error) {
    return captureApiError(error, {
      route: "/api/listings/[id]",
      method: "DELETE",
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, {
    type: "updateListing",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Per-user rate limiting (after auth, complements IP-based rate limit above)
    const userPatchRateLimit = await withRateLimit(request, {
      type: "updateListing",
      getIdentifier: () => `user:${userId}`,
      endpoint: "/api/listings/[id]/user",
    });
    if (userPatchRateLimit) return userPatchRateLimit;

    const suspension = await checkSuspension(userId);
    if (suspension.suspended) {
      await logger.warn("Listing update blocked: account suspended", {
        route: "/api/listings/[id]",
        method: "PATCH",
        userId: userId.slice(0, 8) + "...",
      });
      return NextResponse.json(
        { error: suspension.error || "Account suspended" },
        { status: 403 }
      );
    }

    const emailCheck = await checkEmailVerified(userId);
    if (!emailCheck.verified) {
      await logger.warn("Listing update blocked: email unverified", {
        route: "/api/listings/[id]",
        method: "PATCH",
        userId: userId.slice(0, 8) + "...",
      });
      return NextResponse.json(
        { error: emailCheck.error || "Email verification required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // Check listing exists and user is the owner
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { location: true },
    });

    if (!listing || listing.ownerId !== userId) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    let result: unknown;
    let removedImageUrls: string[] = [];

    if (isHostManagedAvailabilityPatch(rawBody)) {
      const dateOnlyErrors = getHostManagedDateOnlyErrors(rawBody);
      if (Object.keys(dateOnlyErrors).length > 0) {
        return NextResponse.json(
          { error: "Validation failed", fields: dateOnlyErrors },
          { status: 400 }
        );
      }

      const parsed = hostManagedAvailabilityPatchSchema.safeParse(rawBody);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Validation failed",
            fields: parsed.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      const availabilityPatch: HostManagedAvailabilityPatch = parsed.data;

      try {
        const availabilityPatchResult = await prisma.$transaction(
          async (tx) => {
            const [lockedListing] = await tx.$queryRaw<LockedListingRow[]>`
            SELECT
              id,
              "ownerId",
              version,
              status,
              "statusReason",
              "normalizedAddress",
              "physicalUnitId",
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
            WHERE "id" = ${id}
            FOR UPDATE
          `;

            if (!lockedListing || lockedListing.ownerId !== userId) {
              throw new Error("NOT_FOUND");
            }

            const writeLock = getHostModerationWriteLockResult({
              statusReason: lockedListing.statusReason,
              moderationWriteLocksEnabled: features.moderationWriteLocks,
            });

            if (writeLock) {
              return {
                ok: false,
                error: writeLock.error,
                code: writeLock.code,
                lockReason: writeLock.lockReason,
                httpStatus: writeLock.httpStatus,
              } as const;
            }

            if (lockedListing.version !== availabilityPatch.expectedVersion) {
              return {
                ok: false,
                error:
                  "This listing changed while you were editing it. Refresh and try again.",
                code: "VERSION_CONFLICT",
                httpStatus: 409,
              } as const;
            }

            const nextMoveInDate = availabilityPatch.moveInDate
              ? toUtcDateOnly(availabilityPatch.moveInDate)
              : null;
            const nextAvailableUntil =
              availabilityPatch.availableUntil === undefined
                ? lockedListing.availableUntil
                : availabilityPatch.availableUntil
                  ? toUtcDateOnly(availabilityPatch.availableUntil)
                  : null;

            if (nextAvailableUntil && nextAvailableUntil < todayUtcDateOnly()) {
              return {
                ok: false,
                error: "Validation failed",
                fields: {
                  availableUntil: [
                    "Available until date cannot be in the past",
                  ],
                },
                httpStatus: 400,
              } as const;
            }
            if (
              nextAvailableUntil &&
              nextMoveInDate &&
              nextAvailableUntil < nextMoveInDate
            ) {
              return {
                ok: false,
                error: "Validation failed",
                fields: {
                  availableUntil: [
                    "Available until date cannot be before move-in date",
                  ],
                },
                httpStatus: 400,
              } as const;
            }

            const clearsHostReason =
              lockedListing.statusReason === "HOST_PAUSED" ||
              lockedListing.statusReason === "STALE_AUTO_PAUSE" ||
              lockedListing.statusReason === "FRESHNESS_WARNING";
            const nextStatusReason =
              availabilityPatch.status === "PAUSED"
                ? "HOST_PAUSED"
                : clearsHostReason
                  ? null
                  : lockedListing.statusReason;
            const nextVersion = lockedListing.version + 1;

            const updatedListing = await tx.listing.update({
              where: { id },
              data: {
                status: availabilityPatch.status,
                statusReason: nextStatusReason,
                totalSlots: availabilityPatch.totalSlots,
                openSlots: availabilityPatch.openSlots,
                availableSlots: availabilityPatch.openSlots,
                moveInDate: nextMoveInDate,
                availableUntil: nextAvailableUntil,
                minStayMonths: availabilityPatch.minStayMonths,
                lastConfirmedAt: new Date(),
                freshnessReminderSentAt: null,
                freshnessWarningSentAt: null,
                autoPausedAt: null,
                version: nextVersion,
              },
            });

            if (!listing.location) {
              throw new Error("LISTING_LOCATION_MISSING");
            }
            await syncCanonicalListingInventory(tx, {
              listing: updatedListing,
              address: {
                address: listing.location.address,
                city: listing.location.city,
                state: listing.location.state,
                zip: listing.location.zip,
              },
              actor: { role: "host", id: userId },
            });

            await markListingDirtyInTx(tx, id, "listing_updated");

            return { ok: true, updatedListing } as const;
          }
        );

        if (!availabilityPatchResult.ok) {
          const body =
            "fields" in availabilityPatchResult
              ? {
                  error: availabilityPatchResult.error,
                  fields: availabilityPatchResult.fields,
                }
              : {
                  error: availabilityPatchResult.error,
                  code: availabilityPatchResult.code,
                  ...("lockReason" in availabilityPatchResult
                    ? { lockReason: availabilityPatchResult.lockReason }
                    : {}),
                };
          return NextResponse.json(body, {
            status: availabilityPatchResult.httpStatus,
          });
        }

        result = availabilityPatchResult.updatedListing;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "NOT_FOUND") {
            return NextResponse.json(
              { error: "Listing not found" },
              { status: 404 }
            );
          }
          if (error.message === "LISTING_LOCATION_MISSING") {
            return NextResponse.json(
              { error: "Listing location is missing" },
              { status: 409 }
            );
          }
        }
        throw error;
      }
    } else {
      if (hasRetiredAvailabilityKeys(rawBody)) {
        return NextResponse.json(
          {
            error:
              "Availability is managed by the contact-first inventory editor. Reload and use the availability editor.",
            code: "HOST_MANAGED_WRITE_PATH_REQUIRED",
          },
          { status: 409 }
        );
      }

      const parsed = listingProfilePatchSchema.safeParse(rawBody);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Validation failed",
            fields: parsed.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      const profilePatch: ListingProfilePatch = parsed.data;
      const {
        expectedVersion,
        title,
        description,
        price,
        amenities,
        houseRules,
        address,
        city,
        state,
        zip,
        leaseDuration,
        roomType,
        householdLanguages,
        genderPreference,
        householdGender,
        primaryHomeLanguage,
        images,
      } = profilePatch;

      if (householdLanguages && householdLanguages.length > 0) {
        const langResult =
          householdLanguagesSchema.safeParse(householdLanguages);
        if (!langResult.success) {
          return NextResponse.json(
            { error: "Invalid language codes" },
            { status: 400 }
          );
        }
      }

      if (Array.isArray(images) && images.length > 0) {
        const existingImageSet = new Set(listing.images as string[]);
        const expectedPrefix = `listings/${userId}/`;
        const hasInvalidImage = images.some((url) => {
          if (existingImageSet.has(url)) return false;
          const storagePath = extractStoragePath(url);
          return !storagePath || !storagePath.startsWith(expectedPrefix);
        });
        if (hasInvalidImage) {
          return NextResponse.json(
            { error: "One or more image URLs are invalid" },
            { status: 400 }
          );
        }
      }

      const titleCheck = checkListingLanguageCompliance(title);
      if (!titleCheck.allowed) {
        await logger.warn("Listing title failed compliance check", {
          route: "/api/listings/[id]",
          method: "PATCH",
          userId: userId.slice(0, 8) + "...",
          field: "title",
        });
        return NextResponse.json(
          {
            error: titleCheck.message ?? "Content policy violation",
            field: "title",
          },
          { status: 400 }
        );
      }

      const complianceCheck = checkListingLanguageCompliance(description);
      if (!complianceCheck.allowed) {
        await logger.warn("Listing description failed compliance check", {
          route: "/api/listings/[id]",
          method: "PATCH",
          userId: userId.slice(0, 8) + "...",
          field: "description",
        });
        return NextResponse.json(
          {
            error: complianceCheck.message ?? "Content policy violation",
            field: "description",
          },
          { status: 400 }
        );
      }

      const addressChanged =
        listing.location &&
        (listing.location.address !== address ||
          listing.location.city !== city ||
          listing.location.state !== state ||
          listing.location.zip !== zip);
      const nextNormalizedAddress = normalizeAddress({
        address,
        city,
        state,
        zip,
      });

      let coords: { lat: number; lng: number } | null = null;
      if (addressChanged && listing.location) {
        const fullAddress = `${address}, ${city}, ${state} ${zip}`;
        try {
          const geoResult = await geocodeAddress(fullAddress);
          if (geoResult.status === "not_found") {
            await logger.warn("Geocoding failed for listing update", {
              route: "/api/listings/[id]",
              method: "PATCH",
              userId: userId.slice(0, 8) + "...",
              city,
              state,
            });
            return NextResponse.json(
              {
                error:
                  "Could not find this address. Please check and try again.",
              },
              { status: 400 }
            );
          }
          if (geoResult.status === "error") {
            return NextResponse.json(
              {
                error:
                  "Address verification temporarily unavailable. Please try again.",
              },
              { status: 503, headers: { "Retry-After": "10" } }
            );
          }
          coords = { lat: geoResult.lat, lng: geoResult.lng };
        } catch (geoError) {
          if (isCircuitOpenError(geoError)) {
            return NextResponse.json(
              {
                error:
                  "Address verification service temporarily unavailable. Please try again shortly.",
              },
              { status: 503, headers: { "Retry-After": "30" } }
            );
          }
          throw geoError;
        }
      }

      const normalizedAmenities = normalizeStringList(amenities);
      const normalizedHouseRules = normalizeStringList(houseRules);

      const invalidAmenity = normalizedAmenities.find(
        (item) =>
          !VALID_AMENITIES.some((v) => v.toLowerCase() === item.toLowerCase())
      );
      if (invalidAmenity) {
        return NextResponse.json(
          { error: "Invalid amenity value" },
          { status: 400 }
        );
      }
      const invalidRule = normalizedHouseRules.find(
        (item) =>
          !VALID_HOUSE_RULES.some((v) => v.toLowerCase() === item.toLowerCase())
      );
      if (invalidRule) {
        return NextResponse.json(
          { error: "Invalid house rule value" },
          { status: 400 }
        );
      }

      if (Array.isArray(images) && Array.isArray(listing.images)) {
        const oldSet = new Set(listing.images);
        const newSet = new Set(images);
        removedImageUrls = [...oldSet].filter((url) => !newSet.has(url));
      }

      try {
        const profilePatchResult = await prisma.$transaction(async (tx) => {
          const [lockedListing] = await tx.$queryRaw<LockedListingRow[]>`
            SELECT
              id,
              "ownerId",
              version,
              status,
              "statusReason",
              "normalizedAddress",
              "physicalUnitId",
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
            WHERE "id" = ${id}
            FOR UPDATE
          `;

          if (!lockedListing || lockedListing.ownerId !== userId) {
            throw new Error("NOT_FOUND");
          }

          const writeLock = getHostModerationWriteLockResult({
            statusReason: lockedListing.statusReason,
            moderationWriteLocksEnabled: features.moderationWriteLocks,
          });

          if (writeLock) {
            return {
              ok: false,
              error: writeLock.error,
              code: writeLock.code,
              lockReason: writeLock.lockReason,
              httpStatus: writeLock.httpStatus,
            } as const;
          }

          if (lockedListing.version !== expectedVersion) {
            return {
              ok: false,
              error:
                "This listing changed while you were editing it. Refresh and try again.",
              code: "VERSION_CONFLICT",
              httpStatus: 409,
            } as const;
          }

          const updatedListing = await tx.listing.update({
            where: { id },
            data: {
              title,
              description,
              price,
              amenities: normalizedAmenities,
              houseRules: normalizedHouseRules,
              householdLanguages: Array.isArray(householdLanguages)
                ? householdLanguages
                    .map((l: string) => l.trim().toLowerCase())
                    .filter(isValidLanguageCode)
                : [],
              genderPreference: genderPreference || null,
              householdGender: householdGender || null,
              ...(primaryHomeLanguage !== undefined && {
                primaryHomeLanguage: primaryHomeLanguage || null,
              }),
              leaseDuration: leaseDuration || null,
              roomType: roomType || null,
              ...(addressChanged && {
                normalizedAddress: nextNormalizedAddress,
              }),
              ...(Array.isArray(images) && { images }),
              version: lockedListing.version + 1,
            },
          });

          if (addressChanged && listing.location && coords) {
            await tx.location.update({
              where: { id: listing.location.id },
              data: {
                address,
                city,
                state,
                zip,
              },
            });

            await tx.$executeRaw`
              UPDATE "Location"
              SET coords = ST_SetSRID(ST_MakePoint(${coords.lng}::float8, ${coords.lat}::float8), 4326)
              WHERE id = ${listing.location.id}
            `;
          }

          await markListingDirtyInTx(tx, id, "listing_updated");

          const canonicalSync = await syncCanonicalListingInventory(tx, {
            listing: updatedListing,
            address: { address, city, state, zip },
            actor: { role: "host", id: userId },
          });

          return {
            ok: true,
            updatedListing: {
              ...updatedListing,
              physicalUnitId: canonicalSync.unitId,
            },
          } as const;
        });

        if (!profilePatchResult.ok) {
          return NextResponse.json(
            {
              error: profilePatchResult.error,
              code: profilePatchResult.code,
              ...("lockReason" in profilePatchResult
                ? { lockReason: profilePatchResult.lockReason }
                : {}),
            },
            { status: profilePatchResult.httpStatus }
          );
        }

        result = profilePatchResult.updatedListing;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "NOT_FOUND") {
            return NextResponse.json(
              { error: "Listing not found" },
              { status: 404 }
            );
          }
          if (error.message === "LISTING_LOCATION_MISSING") {
            return NextResponse.json(
              { error: "Listing location is missing" },
              { status: 409 }
            );
          }
        }
        throw error;
      }
    }

    // Clean up removed images from storage (outside transaction — best-effort)
    if (removedImageUrls.length > 0 && supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const paths = removedImageUrls
          .map(extractStoragePath)
          .filter((p): p is string => p !== null);
        if (paths.length > 0) {
          await supabase.storage.from("images").remove(paths);
        }
      } catch (storageError) {
        logger.sync.warn("Failed to clean up removed images on edit", {
          error:
            storageError instanceof Error ? storageError.message : "Unknown",
          route: "/api/listings/[id]",
          method: "PATCH",
        });
      }
    }

    // markListingDirty is now called in-transaction alongside the listing
    // update (CFM-405b) so the dirty flag and the source write commit or roll
    // back atomically. See src/lib/search/search-doc-dirty.ts.

    if (features.semanticSearch) {
      syncListingEmbedding(id).catch((err) => {
        logger.sync.warn("syncListingEmbedding failed", {
          route: "/api/listings/[id]",
          method: "PATCH",
          listingId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return captureApiError(error, {
      route: "/api/listings/[id]",
      method: "PATCH",
    });
  }
}
