import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { geocodeAddress } from '@/lib/geocoding';
import { auth } from '@/auth';
import { getListingsPaginated } from '@/lib/data';
import { buildRawParamsFromSearchParams, parseSearchParams } from '@/lib/search-params';
import { logger } from '@/lib/logger';
import { isDataError } from '@/lib/errors/data-errors';
import { withRateLimit } from '@/lib/with-rate-limit';
import { createListingApiSchema } from '@/lib/schemas';
import { checkListingLanguageCompliance } from '@/lib/listing-language-guard';
import { isValidLanguageCode } from '@/lib/languages';
import { markListingDirty } from '@/lib/search/search-doc-dirty';
import { checkSuspension, checkEmailVerified } from '@/app/actions/suspension';
import { withIdempotency } from '@/lib/idempotency';
import { upsertSearchDocSync } from '@/lib/search/search-doc-sync';
import { triggerInstantAlerts } from '@/lib/search-alerts';
import { captureApiError } from '@/lib/api-error-handler';
import { normalizeStringList } from '@/lib/utils';

export async function GET(request: Request) {
    // P2-3: Add rate limiting to prevent scraping
    const rateLimitResponse = await withRateLimit(request, { type: 'listingsRead' });
    if (rateLimitResponse) return rateLimitResponse;

    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    try {
        const { searchParams } = new URL(request.url);
        const rawParams = buildRawParamsFromSearchParams(searchParams);
        const { filterParams, requestedPage } = parseSearchParams(rawParams);

        const result = await getListingsPaginated({
            ...filterParams,
            page: requestedPage,
            limit: 20,
        });

        await logger.info('Listings fetched', {
            route: '/api/listings',
            method: 'GET',
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
                "Vary": "Accept-Encoding",
            },
        });
    } catch (error) {
        // Detect user-facing validation errors (return 400 instead of 500).
        // getListingsPaginated wraps errors via wrapDatabaseError; original message is in error.cause.message.
        const isUserError = (msg: string) => msg.includes('Unbounded text search');

        if (error instanceof Error) {
            const causeMsg = isDataError(error) && error.cause
                ? error.cause.message
                : '';
            if (isUserError(error.message)) {
                return NextResponse.json({ error: error.message }, {
                    status: 400,
                    headers: { "x-request-id": requestId },
                });
            }
            if (isUserError(causeMsg)) {
                return NextResponse.json({ error: causeMsg }, {
                    status: 400,
                    headers: { "x-request-id": requestId },
                });
            }
        }

        return captureApiError(error, { route: '/api/listings', method: 'GET' });
    }
}

export async function POST(request: Request) {
    // 1. Rate limiting (existing)
    const rateLimitResponse = await withRateLimit(request, { type: 'createListing' });
    if (rateLimitResponse) return rateLimitResponse;

    const startTime = Date.now();
    try {
        // 2. Parse JSON body with error handling (2H)
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        // 3. Auth check
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            await logger.warn('Unauthorized listing creation attempt', {
                route: '/api/listings',
                method: 'POST',
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        // 4. Suspension check (1B)
        const suspension = await checkSuspension();
        if (suspension.suspended) {
            return NextResponse.json({ error: suspension.error || 'Account suspended' }, { status: 403 });
        }

        // 5. Email verification check (1B)
        const emailCheck = await checkEmailVerified();
        if (!emailCheck.verified) {
            return NextResponse.json({ error: emailCheck.error || 'Please verify your email' }, { status: 403 });
        }

        // 6. User existence check (1C)
        const userExists = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        if (!userExists) {
            return NextResponse.json(
                { error: 'User account not found. Please sign out and sign in again.' },
                { status: 401 },
            );
        }

        // Log only non-sensitive metadata, NOT the full request body
        await logger.info('Create listing request received', {
            route: '/api/listings',
            method: 'POST',
            hasTitle: !!body.title,
            hasAddress: !!body.address,
            imageCount: Array.isArray(body.images) ? body.images.length : 0,
            userId: userId.slice(0, 8) + '...',
        });

        // Pre-normalize array inputs to comma-separated strings for Zod schema compatibility.
        // The base createListingSchema expects strings for amenities/houseRules and transforms them to arrays.
        if (Array.isArray(body.amenities)) {
            body.amenities = body.amenities.join(',');
        }
        if (Array.isArray(body.houseRules)) {
            body.houseRules = body.houseRules.join(',');
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
            return NextResponse.json({ error: 'Validation failed', fields: fieldErrors }, { status: 400 });
        }

        const {
            title, description, price, amenities, houseRules, totalSlots,
            address, city, state, zip,
            images, leaseDuration, roomType, genderPreference, householdGender,
            householdLanguages, moveInDate,
        } = validatedFields.data;

        // 8. Language compliance check on title AND description (2G)
        const titleCheck = checkListingLanguageCompliance(title);
        if (!titleCheck.allowed) {
            await logger.warn('Listing title failed compliance check', {
                route: '/api/listings',
                method: 'POST',
            });
            return NextResponse.json({ error: titleCheck.message }, { status: 400 });
        }

        if (description) {
            const descriptionCheck = checkListingLanguageCompliance(description);
            if (!descriptionCheck.allowed) {
                await logger.warn('Listing description failed compliance check', {
                    route: '/api/listings',
                    method: 'POST',
                });
                return NextResponse.json({ error: descriptionCheck.message }, { status: 400 });
            }
        }

        // 9. householdLanguages already validated by createListingApiSchema (includes householdLanguagesSchema)

        // 10. Max listings per user check (2F)
        const activeListingCount = await prisma.listing.count({
            where: {
                ownerId: userId,
                status: { in: ['ACTIVE', 'PAUSED'] },
            },
        });
        if (activeListingCount >= 10) {
            return NextResponse.json({ error: 'Maximum 10 active listings per user' }, { status: 400 });
        }

        // Geocode address (log only city/state, not full address)
        const fullAddress = `${address}, ${city}, ${state} ${zip}`;
        const coords = await geocodeAddress(fullAddress);

        if (!coords) {
            await logger.warn('Geocoding failed for listing', {
                route: '/api/listings',
                method: 'POST',
                city,
                state,
            });
            return NextResponse.json({ error: 'Could not geocode address' }, { status: 400 });
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
            leaseDuration: leaseDuration || null,
            roomType: roomType || null,
            totalSlots,
            availableSlots: totalSlots,
            moveInDate: moveInDate ? new Date(moveInDate) : null,
            ownerId: userId,
        };

        // Transaction logic: create listing + location + PostGIS update
        const createListingInTx = async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
            const listing = await tx.listing.create({ data: listingCreateData });

            const location = await tx.location.create({
                data: {
                    listingId: listing.id,
                    address,
                    city,
                    state,
                    zip,
                },
            });

            // Update with PostGIS geometry
            const point = `POINT(${coords.lng} ${coords.lat})`;
            await tx.$executeRaw`
                UPDATE "Location"
                SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
                WHERE id = ${location.id}
            `;

            return listing;
        };

        // Side effects: search sync + instant alerts + dirty marker (fire AFTER transaction)
        const fireSideEffects = async (listing: { id: string; title: string; description: string | null; price: number; roomType: string | null; leaseDuration: string | null; amenities: string[]; houseRules: string[] }) => {
            // 15. Synchronous upsert search doc for immediate visibility (1D)
            await upsertSearchDocSync(listing.id);

            // 16. Fire-and-forget: trigger instant alerts (1E)
            triggerInstantAlerts({
                id: listing.id,
                title: listing.title,
                description: listing.description || '',
                price: listing.price,
                city,
                state,
                roomType: listing.roomType || null,
                leaseDuration: listing.leaseDuration || null,
                amenities: listing.amenities,
                houseRules: listing.houseRules,
            }).catch((err) => {
                logger.sync.warn('Instant alerts trigger failed', {
                    route: '/api/listings',
                    method: 'POST',
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            });

            // 17. Fire-and-forget: mark listing dirty as backup
            markListingDirty(listing.id, 'listing_created').catch((err) => {
                logger.sync.warn('Failed to mark listing dirty', {
                    route: '/api/listings',
                    method: 'POST',
                    listingId: listing.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        };

        // 11. Check for idempotency key header (1F)
        const idempotencyKey = request.headers.get('X-Idempotency-Key');
        let result: Awaited<ReturnType<typeof createListingInTx>>;
        let cached = false;

        if (idempotencyKey) {
            // 12. Idempotent path: wrap transaction in withIdempotency()
            const idempResult = await withIdempotency(
                idempotencyKey,
                userId,
                'createListing',
                validatedFields.data, // request body for hash
                createListingInTx,
            );

            if (!idempResult.success) {
                return NextResponse.json({ error: idempResult.error }, { status: idempResult.status });
            }

            result = idempResult.result;
            cached = idempResult.cached;

            // Side effects only for non-cached results
            if (!cached) {
                await fireSideEffects({ ...result, price: Number(result.price) });
            }
        } else {
            // 13. Non-idempotent path: regular prisma.$transaction
            result = await prisma.$transaction(createListingInTx);

            // Side effects
            await fireSideEffects({ ...result, price: Number(result.price) });
        }

        await logger.info('Listing created successfully', {
            route: '/api/listings',
            method: 'POST',
            listingId: result.id,
            userId: userId.slice(0, 8) + '...',
            cached,
            durationMs: Date.now() - startTime,
        });

        // 18. Return 201 with no-cache headers
        const response = NextResponse.json({ ...result, price: Number(result.price) }, { status: 201 });
        response.headers.set('Cache-Control', 'no-store');
        if (cached) {
            response.headers.set('X-Idempotency-Replayed', 'true');
        }
        return response;

    } catch (error) {
        return captureApiError(error, { route: '/api/listings', method: 'POST' });
    }
}
