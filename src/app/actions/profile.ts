'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkSuspension } from './suspension';
import { logger } from '@/lib/logger';

const updateProfileSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
    bio: z.string().max(500, 'Bio must be less than 500 characters').optional().nullable(),
    countryOfOrigin: z.string().max(100).optional().nullable(),
    languages: z.array(z.string()).optional(),
    image: z.string().url().optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export async function updateProfile(data: UpdateProfileInput) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    const suspension = await checkSuspension();
    if (suspension.suspended) {
        return { error: suspension.error || 'Account suspended' };
    }

    try {
        const validated = updateProfileSchema.parse(data);

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                name: validated.name,
                bio: validated.bio || null,
                countryOfOrigin: validated.countryOfOrigin || null,
                languages: validated.languages || [],
                image: validated.image || null,
            }
        });

        revalidatePath('/profile');
        revalidatePath(`/users/${session.user.id}`);

        return { success: true };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { error: error.issues[0].message };
        }
        logger.sync.error('Failed to update profile', {
            action: 'updateProfile',
            userId: session.user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to update profile' };
    }
}

export async function getProfile() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', user: null };
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                bio: true,
                countryOfOrigin: true,
                languages: true,
                isVerified: true,
                emailVerified: true,
            }
        });

        return { user, error: null };
    } catch (error) {
        logger.sync.error('Failed to fetch profile', {
            action: 'getProfile',
            userId: session.user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to fetch profile', user: null };
    }
}
