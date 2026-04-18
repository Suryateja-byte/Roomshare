import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/geocoding";
import { auth } from "@/auth";
import { getListingsPaginated } from "@/lib/data";
import {
  buildRawParamsFromSearchParams,
  parseSearchParams,
} from "@/lib/search-params";
import { logger } from "@/lib/logger";
import { isDataError } from "@/lib/errors/data-errors";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import { createListingApiSchema } from "@/lib/schemas";
import { checkListingLanguageCompliance } from "@/lib/listing-language-guard";
import { isValidLanguageCode } from "@/lib/languages";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import { checkSuspension, checkEmailVerified } from "@/app/actions/suspension";
import { withIdempotency } from "@/lib/idempotency";
import { upsertSearchDocSync } from "@/lib/search/search-doc-sync";
import { triggerInstantAlerts } from "@/lib/search-alerts";
import { captureApiError } from "@/lib/api-error-handler";
import { isCircuitOpenError } from "@/lib/circuit-breaker";
import { validateCsrf } from "@/lib/csrf";
import {
  calculateProfileCompletion,
  PROFILE_REQUIREMENTS,
} from "@/lib/profile-completion";
import { features } from "@/lib/env";
import { syncListingEmbedding } from "@/lib/embeddings/sync";
import { normalizeAddress } from "@/lib/search/normalize-address";
import {
  checkCollisionRateLimit,
  findCollisions,
  type CollisionSibling,
} from "@/lib/listings/collision-detector";
import {
  getOwnerHashPrefix8,
  recordListingCreateCollisionDetected,
  recordListingCreateCollisionModerationGated,
  recordListingCreateCollisionResolved,
} from "@/lib/search/search-telemetry";

class ListingCollisionCandidatesError extends Error {
  readonly siblings: CollisionSibling[];

  constructor(siblings: CollisionSibling[]) {
    super("COLLISION_CANDIDATES");
    this.name = "ListingCollisionCandidatesError";
    this.siblings = siblings;
  }
}

export async function GET(request: Request) {
  // Use Redis-backed limiter for high-volume read path consistency.
  const rateLimitResponse = await withRateLimitRedis(request, {
    type: "listings-read",
  });
  if (rateLimitResponse) return rateLimitResponse;

  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(request.url);
    const rawParams = buildRawParamsFromSearchParams(searchParams);
    const { filterParams, requestedPage, boundsRequired } =
      parseSearchParams(rawParams);

    // Block unbounded text searches before hitting DB (defense-in-depth).
    // getListingsPaginated also rejects these, but checking here avoids the DB round-trip.
    if (boundsRequired) {
      return NextResponse.json(
        { error: "Location required for text search" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const result = await getListingsPaginated({
      ...filterParams,
      page: requestedPage,
      limit: 20,
    });

    await logger.info("Listings fetched", {
      route: "/api/listings",
      method: "GET",
      query: filterParams.query,
      count: result.items.length,
      total: result.total,
      durationMs: Date.now() - startTime,
      requestId,
    });

    // Private, no-store: prevent caching of user-generated listing data
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, no-store",
        "x-request-id": requestId,
        Vary: "Accept-Encoding",
      },
    });
  } catch (error) {
    // Detect user-facing validation errors (return 400 instead of 500).
    // getListingsPaginated wraps errors via wrapDatabaseError; original message is in error.cause.message.
    const isUserError = (msg: string) => msg.includes("Unbounded text search");

    if (error instanceof Error) {
      const causeMsg =
        isDataError(error) && error.cause ? error.cause.message : "";
      if (isUserError(error.message)) {
        return NextResponse.json(
          { error: error.message },
          {
            status: 400,
            headers: { "x-request-id": requestId },
          }
        );
      }
      if (isUserError(causeMsg)) {
        return NextResponse.json(
          { error: causeMsg },
          {
            status: 400,
            headers: { "x-request-id": requestId },
          }
        );
      }
    }

    return captureApiError(error, { route: "/api/listings", method: "GET" });
  }
}

export async function POST(request: Request) {
  // CSRF protection
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  // 1. Rate limiting (existing)
  const rateLimitResponse = await withRateLimit(request, {
    type: "createListing",
  });
  if (rateLimitResponse) return rateLimitResponse;

  const startTime = Date.now();
  try {
    // 2. Auth check — BEFORE parsing body (M-S4)
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      await logger.warn("Unauthorized listing creation attempt", {
        route: "/api/listings",
        method: "POST",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // 2b. Per-user rate limit (supplements IP-based limit at line 89)
    const userRateLimitResponse = await withRateLimit(request, {
      type: "createListing",
      getIdentifier: () => `user:${userId}`,
      endpoint: "/api/listings/user",
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    // 3. Parse JSON body with error handling (only for authenticated users)
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 4. Suspension check — pass userId to avoid redundant auth() call (M-S1)
    const suspension = await checkSuspension(userId);
    if (suspension.suspended) {
      await logger.warn("Listing create blocked: account suspended", {
        route: "/api/listings",
        method: "POST",
        userId: userId.slice(0, 8) + "...",
      });
      return NextResponse.json(
        { error: suspension.error || "Account suspended" },
        { status: 403 }
      );
    }

    // 5. Email verification check — pass userId to avoid redundant auth() call (M-S1)
    const emailCheck = await checkEmailVerified(userId);
    if (!emailCheck.verified) {
      await logger.warn("Listing create blocked: email unverified", {
        route: "/api/listings",
        method: "POST",
        userId: userId.slice(0, 8) + "...",
      });
      return NextResponse.json(
        { error: emailCheck.error || "Please verify your email" },
        { status: 403 }
      );
    }

    // 6. User existence check (1C)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        bio: true,
        image: true,
        countryOfOrigin: true,
        languages: true,
        isVerified: true,
      },
    });
    if (!user) {
      return NextResponse.json(
        { error: "User account not found. Please sign out and sign in again." },
        { status: 401 }
      );
    }

    // 6b. Profile completion check (BE-M2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma select subset doesn't match full User type expected by calculateProfileCompletion
    const completion = calculateProfileCompletion(user as any);
    if (completion.percentage < PROFILE_REQUIREMENTS.createListing) {
      await logger.warn("Listing create blocked: incomplete profile", {
        route: "/api/listings",
        method: "POST",
        userId: userId.slice(0, 8) + "...",
        completionPct: completion.percentage,
      });
      return NextResponse.json(
        {
          error: `Profile must be at least ${PROFILE_REQUIREMENTS.createListing}% complete to create a listing. Current: ${completion.percentage}%. Missing: ${completion.missing.join(", ")}.`,
        },
        { status: 403 }
      );
    }

    // Log only non-sensitive metadata, NOT the full request body
    await logger.info("Create listing request received", {
      route: "/api/listings",
      method: "POST",
      hasTitle: !!body.title,
      hasAddress: !!body.address,
      imageCount: Array.isArray(body.images) ? body.images.length : 0,
      userId: userId.slice(0, 8) + "...",
    });

    // Pre-normalize array inputs to comma-separated strings for Zod schema compatibility.
    // The base createListingSchema expects strings for amenities/houseRules and transforms them to arrays.
    if (Array.isArray(body.amenities)) {
      body.amenities = body.amenities.join(",");
    }
    if (Array.isArray(body.houseRules)) {
      body.houseRules = body.houseRules.join(",");
    }

    // 7. Zod validation (1A) — replaces manual field checks
    const validatedFields = createListingApiSchema.safeParse(body);
    if (!validatedFields.success) {
      const fieldErrors: Record<string, string> = {};
      validatedFields.error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      return NextResponse.json(
        { error: "Validation failed", fields: fieldErrors },
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
      images,
      leaseDuration,
      roomType,
      genderPreference,
      householdGender,
      householdLanguages,
      primaryHomeLanguage,
      moveInDate,
      bookingMode,
    } = validatedFields.data;

    // 8. Language compliance check on title AND description (2G)
    const titleCheck = checkListingLanguageCompliance(title);
    if (!titleCheck.allowed) {
      await logger.warn("Listing title failed compliance check", {
        route: "/api/listings",
        method: "POST",
      });
      return NextResponse.json(
        {
          error: titleCheck.message ?? "Content policy violation",
          fields: { title: titleCheck.message ?? "Content policy violation" },
        },
        { status: 400 }
      );
    }

    if (description) {
      const descriptionCheck = checkListingLanguageCompliance(description);
      if (!descriptionCheck.allowed) {
        await logger.warn("Listing description failed compliance check", {
          route: "/api/listings",
          method: "POST",
        });
        return NextResponse.json(
          {
            error: descriptionCheck.message ?? "Content policy violation",
            fields: {
              description:
                descriptionCheck.message ?? "Content policy violation",
            },
          },
          { status: 400 }
        );
      }
    }

    // 9. householdLanguages already validated by createListingApiSchema (includes householdLanguagesSchema)

    // Geocode address (log only city/state, not full address)
    const fullAddress = `${address}, ${city}, ${state} ${zip}`;
    let coords: { lat: number; lng: number };
    try {
      const geoResult = await geocodeAddress(fullAddress);
      if (geoResult.status === "not_found") {
        await logger.warn("Geocoding failed for listing", {
          route: "/api/listings",
          method: "POST",
          city,
          state,
        });
        return NextResponse.json(
          { error: "Could not find this address. Please check and try again." },
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

    // Validate image URL ownership (prevent cross-user URL injection)
    if (images && images.length > 0) {
      const expectedPrefix = `listings/${userId}/`;
      const hasInvalidImage = images.some((url) => {
        const match = url.match(/\/storage\/v1\/object\/public\/images\/(.+)$/);
        const storagePath = match ? match[1] : null;
        return !storagePath || !storagePath.startsWith(expectedPrefix);
      });
      if (hasInvalidImage) {
        return NextResponse.json(
          { error: "One or more image URLs are invalid" },
          { status: 400 }
        );
      }
    }

    // Phase 3: Feature flag gate for WHOLE_UNIT booking mode
    if (bookingMode === "WHOLE_UNIT") {
      const { features } = await import("@/lib/env");
      if (!features.wholeUnitMode) {
        return NextResponse.json(
          { error: "Whole-unit booking mode is not currently available." },
          { status: 400 }
        );
      }
    }

    // Build listing create data from validated fields
    const listingCreateData = {
      title,
      description,
      price,
      images: images || [],
      amenities,
      houseRules,
      householdLanguages: (householdLanguages || [])
        .map((l: string) => l.trim().toLowerCase())
        .filter(isValidLanguageCode),
      genderPreference: genderPreference || null,
      householdGender: householdGender || null,
      primaryHomeLanguage: primaryHomeLanguage || null,
      leaseDuration: leaseDuration || null,
      roomType: roomType || null,
      totalSlots,
      availableSlots: totalSlots,
      moveInDate: moveInDate ? new Date(moveInDate) : null,
      bookingMode: bookingMode || "SHARED",
      ownerId: userId,
    };

    // Transaction logic: count check (FOR UPDATE) + create listing + location + PostGIS update
    const createListingInTx = async (
      tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
    ) => {
      // Serialize concurrent listing creates for same user (prevents TOCTOU on empty result set)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

      // 10. Max listings per user check inside tx
      const countResult = await tx.$queryRaw<[{ count: number }]>`
                SELECT COUNT(*)::int as count FROM "Listing"
                WHERE "ownerId" = ${userId} AND status IN ('ACTIVE', 'PAUSED')
            `;
      if (countResult[0].count >= 10) {
        throw new Error("MAX_LISTINGS_EXCEEDED");
      }

      let needsMigrationReview = false;
      let normalizedAddressForCreate: string | undefined;

      if (features.listingCreateCollisionWarn) {
        normalizedAddressForCreate = normalizeAddress({
          address,
          city,
          state,
          zip,
        });

        const collisionAckHeader = request.headers.get("x-collision-ack");
        const ownerHashPrefix8 = getOwnerHashPrefix8(userId);

        if (collisionAckHeader !== "1") {
          const siblings = await findCollisions({
            ownerId: userId,
            normalizedAddress: normalizedAddressForCreate,
            moveInDate: listingCreateData.moveInDate,
            availableUntil: null,
            tx,
          });

          if (siblings.length > 0) {
            recordListingCreateCollisionDetected({
              ownerHashPrefix8,
              siblingCount: siblings.length,
            });
            throw new ListingCollisionCandidatesError(siblings);
          }
        } else {
          const rateLimit = await checkCollisionRateLimit({
            ownerId: userId,
            normalizedAddress: normalizedAddressForCreate ?? "",
            tx,
          });

          if (rateLimit.needsModeration) {
            needsMigrationReview = true;
            recordListingCreateCollisionModerationGated({
              ownerHashPrefix8,
              windowCount24h: rateLimit.windowCount,
            });
          }

          recordListingCreateCollisionResolved({
            ownerHashPrefix8,
            action: rateLimit.needsModeration ? "moderation_gated" : "proceed",
          });
        }
      }

      const listing = await tx.listing.create({
        data: {
          ...listingCreateData,
          ...(normalizedAddressForCreate !== undefined
            ? { normalizedAddress: normalizedAddressForCreate }
            : {}),
          ...(needsMigrationReview ? { needsMigrationReview: true } : {}),
        },
      });

      const location = await tx.location.create({
        data: {
          listingId: listing.id,
          address,
          city,
          state,
          zip,
        },
      });

      // Update with PostGIS geometry (use ST_MakePoint to avoid string interpolation)
      await tx.$executeRaw`
                UPDATE "Location"
                SET coords = ST_SetSRID(ST_MakePoint(${coords.lng}::float8, ${coords.lat}::float8), 4326)
                WHERE id = ${location.id}
            `;

      await markListingDirtyInTx(tx, listing.id, "listing_created");

      return listing;
    };

    // Side effects: search sync + instant alerts + dirty marker (fire AFTER transaction)
    const fireSideEffects = async (listing: {
      id: string;
      title: string;
      description: string | null;
      price: number;
      roomType: string | null;
      leaseDuration: string | null;
      amenities: string[];
      houseRules: string[];
    }) => {
      // 15. Synchronous upsert search doc for immediate visibility (1D)
      // Isolated: sync failure must not bubble up and mask a successful listing creation
      try {
        const synced = await upsertSearchDocSync(listing.id);
        if (!synced) {
          logger.sync.warn("Search sync returned false — cron will pick up", {
            listingId: listing.id,
          });
        }
      } catch (syncErr) {
        logger.sync.error("upsertSearchDocSync failed unexpectedly", {
          listingId: listing.id,
          error: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
      }

      // 15b. Fire-and-forget: semantic search embedding generation
      if (features.semanticSearch) {
        syncListingEmbedding(listing.id).catch((err) => {
          logger.sync.warn("Embedding sync failed", {
            listingId: listing.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      // 16. Fire-and-forget: trigger instant alerts (1E)
      triggerInstantAlerts({
        id: listing.id,
        title: listing.title,
        description: listing.description || "",
        price: listing.price,
        city,
        state,
        roomType: listing.roomType || null,
        leaseDuration: listing.leaseDuration || null,
        amenities: listing.amenities,
        houseRules: listing.houseRules,
      }).catch((err) => {
        logger.sync.warn("Instant alerts trigger failed", {
          route: "/api/listings",
          method: "POST",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      });

      // markListingDirty is now committed atomically inside createListingInTx
      // (CFM-405c) so a crash between tx commit and mark cannot leave the
      // search doc stale.
    };

    // 11. Check for idempotency key header (1F) — validate format (M-S6)
    const idempotencyKey = request.headers.get("X-Idempotency-Key");
    if (
      idempotencyKey &&
      (idempotencyKey.length > 128 || !/^[\w-]+$/.test(idempotencyKey))
    ) {
      return NextResponse.json(
        { error: "Invalid idempotency key format" },
        { status: 400 }
      );
    }
    let result: Awaited<ReturnType<typeof createListingInTx>>;
    let cached = false;

    try {
      if (idempotencyKey) {
        // 12. Idempotent path: wrap transaction in withIdempotency()
        const idempResult = await withIdempotency(
          idempotencyKey,
          userId,
          "createListing",
          validatedFields.data, // request body for hash
          createListingInTx
        );

        if (!idempResult.success) {
          return NextResponse.json(
            { error: idempResult.error },
            { status: idempResult.status }
          );
        }

        result = idempResult.result;
        cached = idempResult.cached;

        // Side effects only for non-cached results
        if (!cached) {
          await fireSideEffects({ ...result, price: Number(result.price) });
        }
      } else {
        // 13. Non-idempotent path: regular prisma.$transaction
        result = await prisma.$transaction(createListingInTx, {
          timeout: 15000,
        });

        // Side effects
        await fireSideEffects({ ...result, price: Number(result.price) });
      }
    } catch (txError) {
      if (txError instanceof ListingCollisionCandidatesError) {
        return NextResponse.json(
          {
            error: "COLLISION_CANDIDATES",
            siblings: txError.siblings,
          },
          { status: 409 }
        );
      }
      if (
        txError instanceof Error &&
        txError.message === "MAX_LISTINGS_EXCEEDED"
      ) {
        await logger.warn("Listing create blocked: max listings exceeded", {
          route: "/api/listings",
          method: "POST",
          userId: userId.slice(0, 8) + "...",
        });
        return NextResponse.json(
          { error: "Maximum 10 active listings per user" },
          { status: 400 }
        );
      }
      throw txError;
    }

    await logger.info("Listing created successfully", {
      route: "/api/listings",
      method: "POST",
      listingId: result.id,
      userId: userId.slice(0, 8) + "...",
      cached,
      durationMs: Date.now() - startTime,
    });

    // 18. Return 201 with only the fields the client needs (M-S5)
    const response = NextResponse.json({ id: result.id }, { status: 201 });
    response.headers.set("Cache-Control", "no-store");
    if (cached) {
      response.headers.set("X-Idempotency-Replayed", "true");
    }
    return response;
  } catch (error) {
    return captureApiError(error, { route: "/api/listings", method: "POST" });
  }
}
