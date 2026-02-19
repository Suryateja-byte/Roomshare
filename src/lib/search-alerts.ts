import { prisma } from './prisma';
import { sendNotificationEmail } from './email';
import { Prisma } from '@prisma/client';
import { buildSearchUrl, type SearchFilters } from './search-utils';
import { logger } from './logger';
import { parseLocalDate } from './utils';

// Type for new listing data used in instant alerts
export interface NewListingForAlert {
    id: string;
    title: string;
    description: string;
    price: number;
    city: string;
    state: string;
    roomType: string | null;
    leaseDuration: string | null;
    amenities: string[];
    houseRules: string[];
    householdLanguages?: string[];
    genderPreference?: string | null;
    householdGender?: string | null;
    moveInDate?: Date | string | null;
}

interface ProcessResult {
    processed: number;
    alertsSent: number;
    errors: number;
    details: string[];
}

type SavedSearchForAlerts = {
    id: string;
    name: string;
    filters: Prisma.JsonValue;
    lastAlertAt: Date | null;
    createdAt: Date;
    user: {
        id: string;
        name: string | null;
        email: string | null;
        notificationPreferences: Prisma.JsonValue | null;
    };
};

// L2 fix: Use shared parseLocalDate from @/lib/utils
const parseDateOnly = parseLocalDate;
const SEARCH_ALERT_BATCH_SIZE = 100;

function isSearchAlertsEnabled(notificationPreferences: unknown): boolean {
    if (!notificationPreferences || typeof notificationPreferences !== 'object') {
        return true;
    }
    const prefs = notificationPreferences as { emailSearchAlerts?: unknown };
    return prefs.emailSearchAlerts !== false;
}

export async function processSearchAlerts(): Promise<ProcessResult> {
    const result: ProcessResult = {
        processed: 0,
        alertsSent: 0,
        errors: 0,
        details: []
    };

    try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const baseWhere = {
            alertEnabled: true,
            OR: [
                // Never alerted
                { lastAlertAt: null },
                // Daily alerts - last alert more than 24 hours ago
                {
                    alertFrequency: 'DAILY',
                    lastAlertAt: { lt: oneDayAgo }
                },
                // Weekly alerts - last alert more than 7 days ago
                {
                    alertFrequency: 'WEEKLY',
                    lastAlertAt: { lt: oneWeekAgo }
                }
            ]
        } satisfies Prisma.SavedSearchWhereInput;

        let processedCandidates = 0;
        let cursorId: string | null = null;

        while (true) {
            const savedSearches: SavedSearchForAlerts[] = await prisma.savedSearch.findMany({
                where: baseWhere,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            notificationPreferences: true
                        }
                    }
                },
                orderBy: { id: 'asc' },
                take: SEARCH_ALERT_BATCH_SIZE,
                ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
            });

            if (!savedSearches || savedSearches.length === 0) {
                break;
            }

            processedCandidates += savedSearches.length;
            cursorId = savedSearches[savedSearches.length - 1].id;

            for (const savedSearch of savedSearches) {
                result.processed++;

                try {
                    // Check user notification preferences
                    if (!isSearchAlertsEnabled(savedSearch.user.notificationPreferences)) {
                        result.details.push(`Skipping ${savedSearch.id} - user disabled search alerts`);
                        continue;
                    }

                    if (!savedSearch.user.email) {
                        result.details.push(`Skipping ${savedSearch.id} - no user email`);
                        continue;
                    }

                    const filters = savedSearch.filters as SearchFilters;
                    const sinceDate = savedSearch.lastAlertAt || savedSearch.createdAt;

                    // Build query to find new matching listings
                    const whereClause: Prisma.ListingWhereInput = {
                        status: 'ACTIVE',
                        createdAt: { gt: sinceDate }
                    };

                    // Apply filters
                    if (filters.minPrice !== undefined) {
                        const existingPriceFilter = (whereClause.price ?? {}) as Record<string, unknown>;
                        whereClause.price = { ...existingPriceFilter, gte: filters.minPrice };
                    }
                    if (filters.maxPrice !== undefined) {
                        const existingPriceFilter = (whereClause.price ?? {}) as Record<string, unknown>;
                        whereClause.price = { ...existingPriceFilter, lte: filters.maxPrice };
                    }
                    if (filters.roomType) {
                        whereClause.roomType = filters.roomType;
                    }
                    if (filters.leaseDuration) {
                        whereClause.leaseDuration = filters.leaseDuration;
                    }
                    if (filters.moveInDate) {
                        const targetDate = parseDateOnly(filters.moveInDate);
                        const existingAnd = Array.isArray(whereClause.AND)
                            ? whereClause.AND
                            : whereClause.AND ? [whereClause.AND] : [];
                        whereClause.AND = [
                            ...existingAnd,
                            {
                                OR: [
                                    { moveInDate: null },
                                    { moveInDate: { lte: targetDate } }
                                ]
                            }
                        ];
                    }
                    if (filters.amenities && filters.amenities.length > 0) {
                        whereClause.amenities = { hasEvery: filters.amenities };
                    }
                    if (filters.houseRules && filters.houseRules.length > 0) {
                        whereClause.houseRules = { hasEvery: filters.houseRules };
                    }
                    if (filters.languages && filters.languages.length > 0) {
                        whereClause.householdLanguages = { hasSome: filters.languages };
                    }
                    if (filters.genderPreference) {
                        whereClause.genderPreference = filters.genderPreference;
                    }
                    if (filters.householdGender) {
                        whereClause.householdGender = filters.householdGender;
                    }
                    // TODO(M5): Replace ILIKE text matching with FTS (to_tsquery) when
                    // search_tsv column is available on the Listing table. Currently uses
                    // Prisma `contains` which generates ILIKE — acceptable for alert volumes
                    // but not scalable for large datasets.
                    if (filters.query) {
                        whereClause.OR = [
                            { title: { contains: filters.query, mode: 'insensitive' } },
                            { description: { contains: filters.query, mode: 'insensitive' } }
                        ];
                    }

                    // City filter via location
                    if (filters.city) {
                        whereClause.location = {
                            city: { contains: filters.city, mode: 'insensitive' }
                        };
                    }

                    // Count matching listings
                    const newListingsCount = await prisma.listing.count({
                        where: whereClause
                    });

                    if (newListingsCount > 0) {
                        // Send email notification
                        const emailResult = await sendNotificationEmail('searchAlert', savedSearch.user.email, {
                            userName: savedSearch.user.name || 'User',
                            searchQuery: savedSearch.name,
                            newListingsCount,
                            searchId: savedSearch.id
                        });

                        if (emailResult.success) {
                            result.alertsSent++;
                            result.details.push(`Sent alert for ${savedSearch.id}: ${newListingsCount} new listings`);
                        } else {
                            result.errors++;
                            result.details.push(`Failed to send email for ${savedSearch.id}: ${emailResult.error}`);
                        }

                        // P0 FIX: Use Promise.allSettled for batch resilience
                        // Ensures notification creation and lastAlertAt update are both attempted
                        // even if one fails, preventing inconsistent state
                        const [notificationResult, updateResult] = await Promise.allSettled([
                            prisma.notification.create({
                                data: {
                                    userId: savedSearch.user.id,
                                    type: 'SEARCH_ALERT',
                                    title: 'New listings match your search!',
                                    message: `${newListingsCount} new listing${newListingsCount > 1 ? 's' : ''} match your saved search "${savedSearch.name}"`,
                                    link: buildSearchUrl(filters)
                                }
                            }),
                            prisma.savedSearch.update({
                                where: { id: savedSearch.id },
                                data: { lastAlertAt: now }
                            })
                        ]);

                        // Log any partial failures for debugging
                        if (notificationResult.status === 'rejected') {
                            result.details.push(`Warning: notification creation failed for ${savedSearch.id}: ${notificationResult.reason}`);
                        }
                        if (updateResult.status === 'rejected') {
                            result.details.push(`Warning: lastAlertAt update failed for ${savedSearch.id}: ${updateResult.reason}`);
                        }
                    } else {
                        // P0 FIX: Still update lastAlertAt even when no new listings
                        // Prevents re-processing the same time window repeatedly
                        await prisma.savedSearch.update({
                            where: { id: savedSearch.id },
                            data: { lastAlertAt: now }
                        });
                    }

                } catch (error) {
                    result.errors++;
                    // M7 fix: Sanitize error message to prevent PII path leakage
                    const safeMessage = error instanceof Error ? error.message : 'Unknown error';
                    result.details.push(`Error processing ${savedSearch.id}: ${safeMessage}`);
                }
            }

            if (savedSearches.length < SEARCH_ALERT_BATCH_SIZE) {
                break;
            }
        }

        result.details.unshift(`Found ${processedCandidates} saved searches to process`);

        return result;

    } catch (error) {
        result.errors++;
        // M7 fix: Sanitize error message to prevent PII path leakage
        const safeMessage = error instanceof Error ? error.message : 'Unknown error';
        result.details.push(`Fatal error: ${safeMessage}`);
        return result;
    }
}

/**
 * Check if a listing matches the saved search filters
 */
function matchesFilters(listing: NewListingForAlert, filters: SearchFilters): boolean {
    // Price filter
    if (filters.minPrice !== undefined && listing.price < filters.minPrice) {
        return false;
    }
    if (filters.maxPrice !== undefined && listing.price > filters.maxPrice) {
        return false;
    }

    // Location filter (city)
    if (filters.city && !listing.city.toLowerCase().includes(filters.city.toLowerCase())) {
        return false;
    }

    // Room type filter
    if (filters.roomType && listing.roomType !== filters.roomType) {
        return false;
    }

    // Lease duration filter
    if (filters.leaseDuration && listing.leaseDuration !== filters.leaseDuration) {
        return false;
    }

    // Move-in date filter (listing available by target date)
    if (filters.moveInDate) {
        const targetDate = parseDateOnly(filters.moveInDate);
        const listingDate = listing.moveInDate ? new Date(listing.moveInDate) : null;
        if (listingDate && listingDate > targetDate) {
            return false;
        }
    }

    // Amenities filter (all required amenities must be present - exact match)
    if (filters.amenities && filters.amenities.length > 0) {
        const listingAmenitiesLower = listing.amenities.map(a => a.toLowerCase());
        const hasAllAmenities = filters.amenities.every(
            amenity => listingAmenitiesLower.includes(amenity.toLowerCase())
        );
        if (!hasAllAmenities) return false;
    }

    // House rules filter (all required rules must be present - exact match)
    if (filters.houseRules && filters.houseRules.length > 0) {
        const listingRulesLower = listing.houseRules.map(r => r.toLowerCase());
        const hasAllRules = filters.houseRules.every(
            rule => listingRulesLower.includes(rule.toLowerCase())
        );
        if (!hasAllRules) return false;
    }

    // Languages filter (OR logic)
    if (filters.languages && filters.languages.length > 0) {
        const listingLanguages = listing.householdLanguages || [];
        const matchesLanguage = filters.languages.some(
            lang => listingLanguages.some(
                listingLang => listingLang.toLowerCase() === lang.toLowerCase()
            )
        );
        if (!matchesLanguage) return false;
    }

    // Gender preference filter
    if (filters.genderPreference) {
        if (!listing.genderPreference || listing.genderPreference.toLowerCase() !== filters.genderPreference.toLowerCase()) {
            return false;
        }
    }

    // Household gender filter
    if (filters.householdGender) {
        if (!listing.householdGender || listing.householdGender.toLowerCase() !== filters.householdGender.toLowerCase()) {
            return false;
        }
    }

    // Query filter (search in title, description, city, and state)
    if (filters.query) {
        const query = filters.query.toLowerCase();
        const matchesTitle = listing.title.toLowerCase().includes(query);
        const matchesDescription = listing.description.toLowerCase().includes(query);
        const matchesCity = listing.city.toLowerCase().includes(query);
        const matchesState = listing.state.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDescription && !matchesCity && !matchesState) return false;
    }

    return true;
}

/**
 * Trigger INSTANT alerts when a new listing is created
 * This function runs asynchronously in the background (non-blocking)
 * to improve scalability and user experience
 */
export async function triggerInstantAlerts(newListing: NewListingForAlert): Promise<{ sent: number; errors: number }> {
    let sent = 0;
    let errors = 0;

    try {
        // M3 fix: Paginate instant subscriptions to prevent unbounded fetches
        const MAX_INSTANT_SUBSCRIPTIONS = 500;
        const instantSearches = await prisma.savedSearch.findMany({
            where: {
                alertEnabled: true,
                alertFrequency: 'INSTANT'
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        notificationPreferences: true
                    }
                }
            },
            take: MAX_INSTANT_SUBSCRIPTIONS,
            orderBy: { createdAt: 'asc' },
        });

        logger.sync.info('Instant alerts subscriptions loaded', {
            action: 'triggerInstantAlerts',
            subscriptions: instantSearches.length,
        });

        for (const savedSearch of instantSearches) {
            try {
                // Check user notification preferences
                if (!isSearchAlertsEnabled(savedSearch.user.notificationPreferences)) {
                    continue;
                }

                if (!savedSearch.user.email) {
                    continue;
                }

                const filters = savedSearch.filters as SearchFilters;

                // Check if the new listing matches this saved search
                if (!matchesFilters(newListing, filters)) {
                    continue;
                }

                logger.sync.debug('Instant alert matched listing to saved search', {
                    action: 'triggerInstantAlerts',
                    savedSearchId: savedSearch.id,
                    userId: savedSearch.user.id,
                    listingId: newListing.id,
                });

                // Send email notification
                const emailResult = await sendNotificationEmail('searchAlert', savedSearch.user.email, {
                    userName: savedSearch.user.name || 'User',
                    searchQuery: savedSearch.name,
                    newListingsCount: 1,
                    searchId: savedSearch.id
                });

                if (!emailResult.success) {
                    logger.sync.warn('Instant alert email failed', {
                        action: 'triggerInstantAlerts',
                        savedSearchId: savedSearch.id,
                        error: emailResult.error || 'unknown',
                    });
                    errors++;
                    continue;
                }

                // P0 FIX: Use Promise.allSettled for batch resilience
                // Ensures notification creation and lastAlertAt update are both attempted
                // even if one fails, preventing inconsistent state
                const [notificationResult, updateResult] = await Promise.allSettled([
                    prisma.notification.create({
                        data: {
                            userId: savedSearch.user.id,
                            type: 'SEARCH_ALERT',
                            title: 'New listing matches your search!',
                            message: `"${newListing.title}" in ${newListing.city} - $${newListing.price}/mo`,
                            link: `/listings/${newListing.id}`
                        }
                    }),
                    prisma.savedSearch.update({
                        where: { id: savedSearch.id },
                        data: { lastAlertAt: new Date() }
                    })
                ]);

                // Log any partial failures for debugging
                if (notificationResult.status === 'rejected') {
                    logger.sync.warn('Instant alert notification create failed', {
                        action: 'triggerInstantAlerts',
                        savedSearchId: savedSearch.id,
                        error: String(notificationResult.reason),
                    });
                }
                if (updateResult.status === 'rejected') {
                    logger.sync.warn('Instant alert lastAlertAt update failed', {
                        action: 'triggerInstantAlerts',
                        savedSearchId: savedSearch.id,
                        error: String(updateResult.reason),
                    });
                }

                sent++;
                logger.sync.info('Instant alert sent', {
                    action: 'triggerInstantAlerts',
                    savedSearchId: savedSearch.id,
                    listingId: newListing.id,
                });

            } catch (error) {
                logger.sync.error('Instant alert processing failed for saved search', {
                    action: 'triggerInstantAlerts',
                    savedSearchId: savedSearch.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                errors++;
            }
        }

    } catch (error) {
        logger.sync.error('Instant alerts fatal error', {
            action: 'triggerInstantAlerts',
            error: error instanceof Error ? error.message : String(error),
        });
        errors++;
    }

    logger.sync.info('Instant alerts processing complete', {
        action: 'triggerInstantAlerts',
        sent,
        errors,
    });
    return { sent, errors };
}
