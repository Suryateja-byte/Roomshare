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
