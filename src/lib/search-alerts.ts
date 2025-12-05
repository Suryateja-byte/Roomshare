import { prisma } from './prisma';
import { sendNotificationEmail } from './email';
import { Prisma } from '@prisma/client';

interface SearchFilters {
    query?: string;
    minPrice?: number;
    maxPrice?: number;
    amenities?: string[];
    moveInDate?: string;
    leaseDuration?: string;
    houseRules?: string[];
    roomType?: string;
    city?: string;
}

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
}

interface ProcessResult {
    processed: number;
    alertsSent: number;
    errors: number;
    details: string[];
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

        // Find saved searches that need alerts
        const savedSearches = await prisma.savedSearch.findMany({
            where: {
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
            }
        });

        result.details.push(`Found ${savedSearches.length} saved searches to process`);

        for (const savedSearch of savedSearches) {
            result.processed++;

            try {
                // Check user notification preferences
                const prefs = savedSearch.user.notificationPreferences as { emailSearchAlerts?: boolean } | null;
                if (prefs?.emailSearchAlerts === false) {
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
                    whereClause.price = { ...whereClause.price as any, gte: filters.minPrice };
                }
                if (filters.maxPrice !== undefined) {
                    whereClause.price = { ...whereClause.price as any, lte: filters.maxPrice };
                }
                if (filters.roomType) {
                    whereClause.roomType = filters.roomType;
                }
                if (filters.leaseDuration) {
                    whereClause.leaseDuration = filters.leaseDuration;
                }
                if (filters.amenities && filters.amenities.length > 0) {
                    whereClause.amenities = { hasEvery: filters.amenities };
                }
                if (filters.houseRules && filters.houseRules.length > 0) {
                    whereClause.houseRules = { hasEvery: filters.houseRules };
                }
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

                    // Create in-app notification
                    await prisma.notification.create({
                        data: {
                            userId: savedSearch.user.id,
                            type: 'SEARCH_ALERT',
                            title: 'New listings match your search!',
                            message: `${newListingsCount} new listing${newListingsCount > 1 ? 's' : ''} match your saved search "${savedSearch.name}"`,
                            link: `/search?${buildSearchParams(filters)}`
                        }
                    });
                }

                // Update lastAlertAt
                await prisma.savedSearch.update({
                    where: { id: savedSearch.id },
                    data: { lastAlertAt: now }
                });

            } catch (error) {
                result.errors++;
                result.details.push(`Error processing ${savedSearch.id}: ${error}`);
            }
        }

        return result;

    } catch (error) {
        result.errors++;
        result.details.push(`Fatal error: ${error}`);
        return result;
    }
}

function buildSearchParams(filters: SearchFilters): string {
    const params = new URLSearchParams();

    if (filters.query) params.set('q', filters.query);
    if (filters.minPrice) params.set('minPrice', filters.minPrice.toString());
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice.toString());
    if (filters.roomType) params.set('roomType', filters.roomType);
    if (filters.leaseDuration) params.set('leaseDuration', filters.leaseDuration);
    if (filters.city) params.set('city', filters.city);
    if (filters.amenities) params.set('amenities', filters.amenities.join(','));
    if (filters.houseRules) params.set('houseRules', filters.houseRules.join(','));

    return params.toString();
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

    // Amenities filter (all required amenities must be present)
    if (filters.amenities && filters.amenities.length > 0) {
        const hasAllAmenities = filters.amenities.every(
            amenity => listing.amenities.some(
                listingAmenity => listingAmenity.toLowerCase().includes(amenity.toLowerCase())
            )
        );
        if (!hasAllAmenities) return false;
    }

    // House rules filter (all required rules must be present)
    if (filters.houseRules && filters.houseRules.length > 0) {
        const hasAllRules = filters.houseRules.every(
            rule => listing.houseRules.some(
                listingRule => listingRule.toLowerCase().includes(rule.toLowerCase())
            )
        );
        if (!hasAllRules) return false;
    }

    // Query filter (search in title and description)
    if (filters.query) {
        const query = filters.query.toLowerCase();
        const matchesTitle = listing.title.toLowerCase().includes(query);
        const matchesDescription = listing.description.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDescription) return false;
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
        // Find all saved searches with INSTANT frequency and alerts enabled
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
            }
        });

        console.log(`[INSTANT ALERTS] Found ${instantSearches.length} instant alert subscriptions`);

        for (const savedSearch of instantSearches) {
            try {
                // Check user notification preferences
                const prefs = savedSearch.user.notificationPreferences as { emailSearchAlerts?: boolean } | null;
                if (prefs?.emailSearchAlerts === false) {
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

                console.log(`[INSTANT ALERTS] Listing matches search "${savedSearch.name}" for user ${savedSearch.user.id}`);

                // Send email notification
                const emailResult = await sendNotificationEmail('searchAlert', savedSearch.user.email, {
                    userName: savedSearch.user.name || 'User',
                    searchQuery: savedSearch.name,
                    newListingsCount: 1,
                    searchId: savedSearch.id
                });

                if (!emailResult.success) {
                    console.error(`[INSTANT ALERTS] Email failed for ${savedSearch.id}: ${emailResult.error}`);
                    errors++;
                    continue;
                }

                // Create in-app notification
                await prisma.notification.create({
                    data: {
                        userId: savedSearch.user.id,
                        type: 'SEARCH_ALERT',
                        title: 'New listing matches your search!',
                        message: `"${newListing.title}" in ${newListing.city} - $${newListing.price}/mo`,
                        link: `/listings/${newListing.id}`
                    }
                });

                // Update lastAlertAt
                await prisma.savedSearch.update({
                    where: { id: savedSearch.id },
                    data: { lastAlertAt: new Date() }
                });

                sent++;
                console.log(`[INSTANT ALERTS] Alert sent for search "${savedSearch.name}"`);

            } catch (error) {
                console.error(`[INSTANT ALERTS] Error processing search ${savedSearch.id}:`, error);
                errors++;
            }
        }

    } catch (error) {
        console.error('[INSTANT ALERTS] Fatal error:', error);
        errors++;
    }

    console.log(`[INSTANT ALERTS] Complete: ${sent} sent, ${errors} errors`);
    return { sent, errors };
}
