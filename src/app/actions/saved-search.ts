'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import type { SearchFilters } from '@/lib/search-utils';
import type { Prisma } from '@prisma/client';

type AlertFrequency = 'INSTANT' | 'DAILY' | 'WEEKLY';

interface SaveSearchInput {
    name: string;
    filters: SearchFilters;
    alertEnabled?: boolean;
    alertFrequency?: AlertFrequency;
}

export async function saveSearch(input: SaveSearchInput) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        // Check if user already has 10 saved searches (limit)
        const existingCount = await prisma.savedSearch.count({
            where: { userId: session.user.id }
        });

        if (existingCount >= 10) {
            return { error: 'You can only save up to 10 searches. Please delete some to save new ones.' };
        }

        const savedSearch = await prisma.savedSearch.create({
            data: {
                userId: session.user.id,
                name: input.name,
                query: input.filters.query,
                filters: input.filters as Prisma.InputJsonValue,
                alertEnabled: input.alertEnabled ?? true,
                alertFrequency: input.alertFrequency ?? 'DAILY'
            }
        });

        revalidatePath('/saved-searches');

        return { success: true, searchId: savedSearch.id };
    } catch (error) {
        console.error('Error saving search:', error);
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

        return searches;
    } catch (error) {
        console.error('Error fetching saved searches:', error);
        return [];
    }
}

export async function deleteSavedSearch(searchId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        await prisma.savedSearch.delete({
            where: {
                id: searchId,
                userId: session.user.id
            }
        });

        revalidatePath('/saved-searches');

        return { success: true };
    } catch (error) {
        console.error('Error deleting saved search:', error);
        return { error: 'Failed to delete saved search' };
    }
}

export async function toggleSearchAlert(searchId: string, enabled: boolean) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

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
    } catch (error) {
        console.error('Error toggling search alert:', error);
        return { error: 'Failed to update alert setting' };
    }
}

export async function updateSavedSearchName(searchId: string, name: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        await prisma.savedSearch.update({
            where: {
                id: searchId,
                userId: session.user.id
            },
            data: { name }
        });

        revalidatePath('/saved-searches');

        return { success: true };
    } catch (error) {
        console.error('Error updating saved search name:', error);
        return { error: 'Failed to update search name' };
    }
}
