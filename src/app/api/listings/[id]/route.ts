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
  listingBookingModeSchema,
} from "@/lib/schemas";
import { VALID_AMENITIES, VALID_HOUSE_RULES } from "@/lib/filter-schema";
import { checkListingLanguageCompliance } from "@/lib/listing-language-guard";
import { isValidLanguageCode } from "@/lib/languages";
import { markListingDirty } from "@/lib/search/search-doc-dirty";
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
import {
  getAvailability,
  getFuturePeakReservedLoad,
  syncFutureInventoryTotalSlots,
} from "@/lib/availability";
import {
  prepareHostManagedListingWrite,
  requiresDedicatedHostManagedWritePath,
  type HostManagedListingWriteCurrent,
} from "@/lib/listings/host-managed-write";

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
  bookingMode: listingBookingModeSchema,
});

const listingStatusSchema = z.enum(["ACTIVE", "PAUSED", "RENTED"]);
const nonEmptyNumberishSchema = z
  .union([z.number(), z.string().trim().min(1)])
  .pipe(z.coerce.number());
const integerLikeSchema = nonEmptyNumberishSchema.pipe(z.number().int());
const nonNegativeIntegerLikeSchema = nonEmptyNumberishSchema.pipe(
  z.number().int().min(0)
);
const optionalHostManagedDateSchema = z
  .union([
    z
      .string()
      .trim()
      .min(1)
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: "Invalid date format",
      })
      .transform((value) => new Date(value)),
    z.null(),
  ])
  .optional();

const hostManagedPatchSchema = z
  .object({
    expectedVersion: nonNegativeIntegerLikeSchema,
    openSlots: z.union([integerLikeSchema, z.null()]).optional(),
    totalSlots: integerLikeSchema.optional(),
    moveInDate: optionalHostManagedDateSchema,
    availableUntil: optionalHostManagedDateSchema,
    minStayMonths: integerLikeSchema.optional(),
    status: listingStatusSchema.optional(),
  })
  .strict();

type LockedListingRow = HostManagedListingWriteCurrent & {
  ownerId: string;
  bookingMode: string;
};

const HOST_MANAGED_PATCH_KEYS = new Set([
  "expectedVersion",
  "openSlots",
  "totalSlots",
  "moveInDate",
  "availableUntil",
  "minStayMonths",
  "status",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPureHostManagedPatchPayload(
  value: unknown
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return (
    keys.includes("expectedVersion") &&
    keys.every((key) => HOST_MANAGED_PATCH_KEYS.has(key))
  );
}

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
    let pendingBookings: { id: string; tenantId: string | null }[] = [];

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

        // Check for active ACCEPTED bookings - block deletion if any exist
        const activeAcceptedBookings = await tx.booking.count({
          where: {
            listingId: id,
            status: "ACCEPTED",
            endDate: { gte: new Date() },
          },
        });

        if (activeAcceptedBookings > 0) {
          throw new Error("ACTIVE_BOOKINGS");
        }

        // Get all PENDING bookings to notify tenants before deletion
        pendingBookings = await tx.booking.findMany({
          where: {
            listingId: id,
            status: "PENDING",
          },
          select: {
            id: true,
            tenantId: true,
          },
        });

        // Batch-create notifications for tenants with pending bookings
        if (pendingBookings.length > 0) {
          await tx.notification.createMany({
            data: pendingBookings
              .filter((booking) => booking.tenantId != null)
              .map((booking) => ({
                userId: booking.tenantId!,
                type: "BOOKING_CANCELLED",
                title: "Booking Request Cancelled",
                message: `Your pending booking request for "${listing.title}" has been cancelled because the host removed the listing.`,
                link: "/bookings",
              })),
          });
        }

        // Phase 4: Notify tenants with active HELD bookings
        const heldBookings = await tx.booking.findMany({
          where: {
            listingId: id,
            status: "HELD",
            heldUntil: { gte: new Date() },
          },
          select: { id: true, tenantId: true },
        });
        if (heldBookings.length > 0) {
          await tx.notification.createMany({
            data: heldBookings
              .filter((booking) => booking.tenantId != null)
              .map((booking) => ({
                userId: booking.tenantId!,
                type: "BOOKING_HOLD_EXPIRED",
                title: "Hold Cancelled",
                message: `Your hold on "${listing.title}" has been cancelled because the host removed the listing.`,
                link: "/bookings",
              })),
          });
        }

        // Delete listing — Location and bookings cascade-deleted automatically
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
        if (error.message === "ACTIVE_BOOKINGS") {
          return NextResponse.json(
            {
              error: "Cannot delete listing with active bookings",
              message:
                "You have active bookings for this listing. Please cancel them before deleting.",
            },
            { status: 400 }
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
        notifiedTenants: pendingBookings.length,
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

    const useDedicatedHostManagedPatch =
      listing.availabilitySource === "HOST_MANAGED" &&
      isPureHostManagedPatchPayload(rawBody);

    let result;
    let removedImageUrls: string[] = [];

    if (useDedicatedHostManagedPatch) {
      const parsedHostManagedPatch = hostManagedPatchSchema.safeParse(rawBody);
      if (!parsedHostManagedPatch.success) {
        return NextResponse.json(
          {
            error: "Validation failed",
            fields: parsedHostManagedPatch.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }
      const hostManagedPatch = parsedHostManagedPatch.data;

      try {
        const hostManagedResult = await prisma.$transaction(async (tx) => {
          const [lockedListing] = await tx.$queryRaw<LockedListingRow[]>`
            SELECT
              id,
              "ownerId",
              version,
              "availabilitySource",
              status,
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
              "autoPausedAt",
              "booking_mode" as "bookingMode"
            FROM "Listing"
            WHERE "id" = ${id}
            FOR UPDATE
          `;

          if (!lockedListing || lockedListing.ownerId !== userId) {
            throw new Error("NOT_FOUND");
          }

          const preparedWrite = prepareHostManagedListingWrite(
            lockedListing,
            hostManagedPatch,
            {
              actor: "host",
              now: new Date(),
            }
          );

          if (!preparedWrite.ok) {
            return {
              ok: false,
              error: preparedWrite.error,
              code: preparedWrite.code,
              httpStatus: preparedWrite.httpStatus,
            } as const;
          }

          const updatedListing = await tx.listing.update({
            where: { id },
            data: preparedWrite.data,
          });

          return { ok: true, updatedListing } as const;
        });

        if (!hostManagedResult.ok) {
          return NextResponse.json(
            {
              error: hostManagedResult.error,
              code: hostManagedResult.code,
            },
            { status: hostManagedResult.httpStatus }
          );
        }

        result = hostManagedResult.updatedListing;
      } catch (error) {
        if (error instanceof Error && error.message === "NOT_FOUND") {
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        }
        throw error;
      }
    } else {
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
        bookingMode,
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

      if (bookingMode === "WHOLE_UNIT") {
        const { features } = await import("@/lib/env");
        if (!features.wholeUnitMode) {
          return NextResponse.json(
            { error: "Whole-unit booking mode is not currently available." },
            { status: 400 }
          );
        }
      }

      if (Array.isArray(images) && Array.isArray(listing.images)) {
        const oldSet = new Set(listing.images);
        const newSet = new Set(images);
        removedImageUrls = [...oldSet].filter((url) => !newSet.has(url));
      }

      try {
        result = await prisma.$transaction(async (tx) => {
          const [lockedListing] = await tx.$queryRaw<LockedListingRow[]>`
            SELECT
              id,
              "ownerId",
              version,
              "availabilitySource",
              status,
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
              "autoPausedAt",
              "booking_mode" as "bookingMode"
            FROM "Listing"
            WHERE "id" = ${id}
            FOR UPDATE
          `;

          if (!lockedListing || lockedListing.ownerId !== userId) {
            throw new Error("NOT_FOUND");
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
          const bookingModeChanged =
            bookingMode !== undefined &&
            bookingMode !== null &&
            bookingMode !== lockedListing.bookingMode;
          const totalSlotsChanged = totalSlots !== lockedListing.totalSlots;
          const availableUntilChanged =
            availableUntil !== undefined &&
            (lockedListing.availableUntil?.toISOString().slice(0, 10) ?? null) !==
              (nextAvailableUntil?.toISOString().slice(0, 10) ?? null);
          const minStayMonthsChanged =
            minStayMonths !== undefined &&
            minStayMonths !== lockedListing.minStayMonths;
          const hostManagedInventoryMutation =
            requiresDedicatedHostManagedWritePath({
              availabilitySource: lockedListing.availabilitySource,
              moveInDateChanged,
              bookingModeChanged,
              totalSlotsChanged,
              availableUntilChanged,
              minStayMonthsChanged,
            });

          if (hostManagedInventoryMutation) {
            throw new Error("HOST_MANAGED_WRITE_PATH_REQUIRED");
          }

          if (bookingModeChanged) {
            const futureAccepted = await tx.booking.count({
              where: {
                listingId: id,
                status: "ACCEPTED",
                endDate: { gte: new Date() },
              },
            });
            if (futureAccepted > 0) {
              throw new Error("BOOKING_MODE_CONFLICT");
            }
          }

          if (
            lockedListing.availabilitySource === "LEGACY_BOOKING" &&
            totalSlots !== undefined &&
            totalSlots !== null &&
            totalSlots < lockedListing.totalSlots
          ) {
            const peakReservedLoad = await getFuturePeakReservedLoad(tx, id);
            if (totalSlots < peakReservedLoad) {
              throw new Error("SLOTS_REDUCTION_BLOCKED");
            }
          }

          const currentAvailability =
            lockedListing.availabilitySource === "LEGACY_BOOKING"
              ? await getAvailability(id, { tx })
              : null;
          if (
            lockedListing.availabilitySource === "LEGACY_BOOKING" &&
            !currentAvailability
          ) {
            throw new Error("LISTING_AVAILABILITY_NOT_FOUND");
          }

          const reservedSlotsToday = currentAvailability
            ? currentAvailability.acceptedSlots + currentAvailability.heldSlots
            : 0;

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
              ...(lockedListing.availabilitySource === "LEGACY_BOOKING" && {
                availableSlots: Math.max(0, totalSlots - reservedSlotsToday),
              }),
              moveInDate: nextMoveInDate,
              availableUntil: nextAvailableUntil,
              ...(minStayMonths !== undefined && { minStayMonths }),
              ...(Array.isArray(images) && { images }),
              ...(bookingMode !== undefined &&
                bookingMode !== null && { bookingMode }),
            },
          });

          if (
            lockedListing.availabilitySource === "LEGACY_BOOKING" &&
            totalSlots !== undefined &&
            totalSlots !== null &&
            totalSlots !== lockedListing.totalSlots
          ) {
            await syncFutureInventoryTotalSlots(tx, id, totalSlots);
          }

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

          return updatedListing;
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "NOT_FOUND") {
            return NextResponse.json(
              { error: "Listing not found" },
              { status: 404 }
            );
          }
          if (error.message === "BOOKING_MODE_CONFLICT") {
            return NextResponse.json(
              {
                error:
                  "Cannot change booking mode while active bookings exist. Cancel conflicting bookings first.",
              },
              { status: 400 }
            );
          }
          if (error.message === "SLOTS_REDUCTION_BLOCKED") {
            return NextResponse.json(
              {
                error:
                  "Cannot reduce total slots below the number committed by accepted bookings and active holds.",
              },
              { status: 400 }
            );
          }
          if (error.message === "HOST_MANAGED_WRITE_PATH_REQUIRED") {
            return NextResponse.json(
              {
                error:
                  "This listing now uses host-managed availability. Reload and use the new availability editor.",
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

    // Fire-and-forget: mark listing dirty for search doc refresh
    markListingDirty(id, "listing_updated").catch((err) => {
      logger.sync.warn("markListingDirty failed", {
        route: "/api/listings/[id]",
        method: "PATCH",
        listingId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

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
