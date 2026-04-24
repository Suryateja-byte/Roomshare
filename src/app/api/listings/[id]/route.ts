import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { geocodeAddress } from "@/lib/geocoding";
import { createClient } from "@supabase/supabase-js";
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
import { getModerationWriteLockResult } from "@/lib/listings/moderation-write-lock";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract storage path from Supabase public URL
function extractStoragePath(publicUrl: string): string | null {
  const match = publicUrl.match(/\/storage\/v1\/object\/public\/images\/(.+)$/);
  return match ? match[1] : null;
}

const updateListingSchema = z.object({
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
  totalSlots: z.coerce.number().int().min(1).max(20),
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
  moveInDate: z
    .union([
      z
        .string()
        .trim()
        .refine((value) => !Number.isNaN(Date.parse(value)), {
          message: "Invalid date format",
        }),
      z.null(),
    ])
    .optional(),
  availableUntil: z
    .union([
      z
        .string()
        .trim()
        .refine((value) => !Number.isNaN(Date.parse(value)), {
          message: "Invalid date format",
        }),
      z.null(),
    ])
    .optional(),
  minStayMonths: z.coerce.number().int().min(1).optional(),
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
});

type LockedListingRow = {
  id: string;
  ownerId: string;
  version: number;
  status: string;
  statusReason: string | null;
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

    const { id } = await params;

    // Wrap ownership check + delete in interactive transaction with FOR UPDATE
    // to prevent TOCTOU race between check and delete
    let _listingTitle: string | null = null;
    let listingImages: string[] = [];

    try {
      await prisma.$transaction(async (tx) => {
        // Lock the listing row to prevent concurrent modifications
        const [listing] = await tx.$queryRaw<
          Array<{ ownerId: string; title: string; images: string[] }>
        >`
                    SELECT "ownerId", "title", "images" FROM "Listing"
                    WHERE "id" = ${id}
                    FOR UPDATE
                `;

        if (!listing || listing.ownerId !== session.user.id) {
          throw new Error("NOT_FOUND_OR_UNAUTHORIZED");
        }

        _listingTitle = listing.title;
        listingImages = listing.images || [];

        // Delete listing; contact-first tables are independent projections/ledgers.
        await tx.listing.delete({ where: { id } });
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

    // Search doc cleanup handled by ON DELETE CASCADE FK on listing_search_docs
    // and listing_search_doc_dirty (migration 20260110000000_search_doc).

    // Clean up images from Supabase storage (outside transaction — best-effort)
    if (listingImages.length > 0 && supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const paths = listingImages
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

    let result;
    let removedImageUrls: string[] = [];

    {
      const parsed = updateListingSchema.safeParse(rawBody);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Validation failed",
            fields: parsed.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      const {
        title,
        description,
        price,
        amenities,
        houseRules,
        totalSlots,
        address,
        city,
        state,
        zip,
        moveInDate,
        availableUntil,
        minStayMonths,
        leaseDuration,
        roomType,
        householdLanguages,
        genderPreference,
        householdGender,
        primaryHomeLanguage,
        images,
      } = parsed.data;

      if (householdLanguages && householdLanguages.length > 0) {
        const langResult = householdLanguagesSchema.safeParse(householdLanguages);
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

      if (title) {
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
      }

      if (description) {
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
      }

      const addressChanged =
        listing.location &&
        (listing.location.address !== address ||
          listing.location.city !== city ||
          listing.location.state !== state ||
          listing.location.zip !== zip);

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
                error: "Could not find this address. Please check and try again.",
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
        const genericPatchResult = await prisma.$transaction(async (tx) => {
          const [lockedListing] = await tx.$queryRaw<LockedListingRow[]>`
            SELECT
              id,
              "ownerId",
              version,
              status,
              "statusReason",
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

          const writeLock = features.moderationWriteLocks
            ? getModerationWriteLockResult({
                actor: "host",
                statusReason: lockedListing.statusReason,
              })
            : null;

          if (writeLock) {
            return {
              ok: false,
              error: writeLock.error,
              code: writeLock.code,
              lockReason: writeLock.lockReason,
              httpStatus: writeLock.httpStatus,
            } as const;
          }

          const nextMoveInDate = moveInDate ? new Date(moveInDate) : null;
          const nextAvailableUntil =
            availableUntil === undefined
              ? lockedListing.availableUntil
              : availableUntil
                ? new Date(availableUntil)
                : null;
          const moveInDateChanged =
            (lockedListing.moveInDate?.toISOString().slice(0, 10) ?? null) !==
            (nextMoveInDate?.toISOString().slice(0, 10) ?? null);
          const availableUntilChanged =
            availableUntil !== undefined &&
            (lockedListing.availableUntil?.toISOString().slice(0, 10) ?? null) !==
              (nextAvailableUntil?.toISOString().slice(0, 10) ?? null);
          const minStayMonthsChanged =
            minStayMonths !== undefined &&
            minStayMonths !== lockedListing.minStayMonths;

          if (
            moveInDateChanged ||
            totalSlots !== lockedListing.totalSlots ||
            availableUntilChanged ||
            minStayMonthsChanged
          ) {
            throw new Error("HOST_MANAGED_WRITE_PATH_REQUIRED");
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
              totalSlots,
              availableSlots: totalSlots,
              moveInDate: nextMoveInDate,
              availableUntil: nextAvailableUntil,
              ...(minStayMonths !== undefined && { minStayMonths }),
              ...(Array.isArray(images) && { images }),
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

          return { ok: true, updatedListing } as const;
        });

        if (!genericPatchResult.ok) {
          return NextResponse.json(
            {
              error: genericPatchResult.error,
              code: genericPatchResult.code,
              ...("lockReason" in genericPatchResult
                ? { lockReason: genericPatchResult.lockReason }
                : {}),
            },
            { status: genericPatchResult.httpStatus }
          );
        }

        result = genericPatchResult.updatedListing;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "NOT_FOUND") {
            return NextResponse.json(
              { error: "Listing not found" },
              { status: 404 }
            );
          }
          if (error.message === "HOST_MANAGED_WRITE_PATH_REQUIRED") {
            return NextResponse.json(
              {
                error:
                  "Availability is managed by the contact-first inventory editor. Reload and use the availability editor.",
                code: "HOST_MANAGED_WRITE_PATH_REQUIRED",
              },
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
