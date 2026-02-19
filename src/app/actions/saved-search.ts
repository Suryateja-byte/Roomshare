'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import type { SearchFilters } from '@/lib/search-utils';
import { validateSearchFilters } from '@/lib/search-params';
import type { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { headers } from 'next/headers';
import { checkServerComponentRateLimit } from '@/lib/with-rate-limit';

type AlertFrequency = 'INSTANT' | 'DAILY' | 'WEEKLY';

interface SaveSearchInput {
    name: string;
    filters: SearchFilters;
    alertEnabled?: boolean;
    alertFrequency?: AlertFrequency;
}

const savedSearchNameSchema = z.string().trim().min(1).max(100);

/**
 * Zod schema for validating SavedSearch.filters JSON field on read.
 * Uses .passthrough() to allow future fields without breaking existing data.
 */
const savedSearchFiltersSchema = z.object({
    query: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    roomType: z.string().optional(),
    amenities: z.array(z.string()).optional(),
    houseRules: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    moveInDate: z.string().optional(),
    leaseDuration: z.string().optional(),
    genderPreference: z.string().optional(),
    householdGender: z.string().optional(),
    sort: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    minLat: z.number().optional(),
    maxLat: z.number().optional(),
    minLng: z.number().optional(),
    maxLng: z.number().optional(),
    city: z.string().optional(),
}).passthrough();

/** Safely parse filters JSON from DB, falling back to empty object on invalid data. */
export function parseSavedSearchFilters(raw: unknown): SearchFilters {
    const result = savedSearchFiltersSchema.safeParse(raw);
    if (result.success) {
        return result.data as SearchFilters;
    }
    logger.sync.warn('Invalid saved search filters in DB, falling back to empty', {
        action: 'parseSavedSearchFilters',
        error: result.error.message,
    });
    return {};
}

async function enforceSavedSearchMutationRateLimit(action: string) {
    const headersList = await headers();
    const rateLimit = await checkServerComponentRateLimit(
        headersList,
        'savedSearchMutations',
        `/actions/saved-search/${action}`,
    );

    if (!rateLimit.allowed) {
        return { error: 'Too many requests. Please wait before trying again.' };
    }

    return null;
}

export async function saveSearch(input: SaveSearchInput) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    const rateLimited = await enforceSavedSearchMutationRateLimit('save');
    if (rateLimited) return rateLimited;

    try {
        const nameValidation = savedSearchNameSchema.safeParse(input.name);
        if (!nameValidation.success) {
            return { error: 'Invalid search name' };
        }

        // Check if user already has 10 saved searches (limit)
        const existingCount = await prisma.savedSearch.count({
            where: { userId: session.user.id }
        });

        if (existingCount >= 10) {
            return { error: 'You can only save up to 10 searches. Please delete some to save new ones.' };
        }

        // Validate filters before storing (prevents malicious/malformed data)
        const validatedFilters = validateSearchFilters(input.filters);

        const savedSearch = await prisma.savedSearch.create({
            data: {
                userId: session.user.id,
                name: nameValidation.data,
                query: validatedFilters.query,
                filters: validatedFilters as Prisma.InputJsonValue,
                alertEnabled: input.alertEnabled ?? true,
                alertFrequency: input.alertFrequency ?? 'DAILY'
            }
        });

        revalidatePath('/saved-searches');

        return { success: true, searchId: savedSearch.id };
    } catch (error: unknown) {
        logger.sync.error('Failed to save search', {
            action: 'saveSearch',
            searchName: input.name,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to save search' };
    }
}

export async function getMySavedSearches() {
    const session = await auth();
    if (!session?.user?.id) {
        return [];
    }

    try {
        const searches = await prisma.savedSearch.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' }
        });

        // Validate filters JSON on read to prevent malformed data from reaching the client
        return searches.map(search => ({
            ...search,
            filters: parseSavedSearchFilters(search.filters) as Prisma.JsonValue,
        }));
    } catch (error: unknown) {
        logger.sync.error('Failed to fetch saved searches', {
            action: 'getMySavedSearches',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return [];
    }
}

export async function deleteSavedSearch(searchId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    const rateLimited = await enforceSavedSearchMutationRateLimit('delete');
    if (rateLimited) return rateLimited;

    try {
        await prisma.savedSearch.delete({
            where: {
                id: searchId,
                userId: session.user.id
            }
        });

        revalidatePath('/saved-searches');

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to delete saved search', {
            action: 'deleteSavedSearch',
            searchId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to delete saved search' };
    }
}

export async function toggleSearchAlert(searchId: string, enabled: boolean) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    const rateLimited = await enforceSavedSearchMutationRateLimit('toggle-alert');
    if (rateLimited) return rateLimited;

    try {
        await prisma.savedSearch.update({
            where: {
                id: searchId,
                userId: session.user.id
            },
            data: { alertEnabled: enabled }
        });

        revalidatePath('/saved-searches');

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to toggle search alert', {
            action: 'toggleSearchAlert',
            searchId,
            alertEnabled: enabled,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to update alert setting' };
    }
}

export async function updateSavedSearchName(searchId: string, name: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    const rateLimited = await enforceSavedSearchMutationRateLimit('rename');
    if (rateLimited) return rateLimited;

    try {
        const nameValidation = savedSearchNameSchema.safeParse(name);
        if (!nameValidation.success) {
            return { error: 'Invalid search name' };
        }

        await prisma.savedSearch.update({
            where: {
                id: searchId,
                userId: session.user.id
            },
            data: { name: nameValidation.data }
        });

        revalidatePath('/saved-searches');

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to update saved search name', {
            action: 'updateSavedSearchName',
            searchId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to update search name' };
    }
}
