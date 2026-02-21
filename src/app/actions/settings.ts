'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { checkRateLimit, getClientIPFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';
import { headers } from 'next/headers';

export interface NotificationPreferences {
    emailBookingRequests: boolean;
    emailBookingUpdates: boolean;
    emailMessages: boolean;
    emailReviews: boolean;
    emailSearchAlerts: boolean;
    emailMarketing: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
    emailBookingRequests: true,
    emailBookingUpdates: true,
    emailMessages: true,
    emailReviews: true,
    emailSearchAlerts: true,
    emailMarketing: false,
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
    const session = await auth();
    if (!session?.user?.id) {
        return DEFAULT_PREFERENCES;
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { notificationPreferences: true }
    });

    if (!user?.notificationPreferences) {
        return DEFAULT_PREFERENCES;
    }

    return {
        ...DEFAULT_PREFERENCES,
        ...(user.notificationPreferences as Partial<NotificationPreferences>)
    };
}

const notificationPreferencesSchema = z.object({
    emailBookingRequests: z.boolean(),
    emailBookingUpdates: z.boolean(),
    emailMessages: z.boolean(),
    emailReviews: z.boolean(),
    emailSearchAlerts: z.boolean(),
    emailMarketing: z.boolean(),
}).strict();

export async function updateNotificationPreferences(
    preferences: NotificationPreferences
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    // Zod validation — replaces `as any` cast
    const parsed = notificationPreferencesSchema.safeParse(preferences);
    if (!parsed.success) {
        return { success: false, error: 'Invalid notification preferences' };
    }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { notificationPreferences: parsed.data as Record<string, boolean> }
        });

        revalidatePath('/settings');
        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to update notification preferences', {
            action: 'updateNotificationPreferences',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { success: false, error: 'Failed to update preferences' };
    }
}

export async function changePassword(
    currentPassword: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    // Rate limiting
    const headersList = await headers();
    const ip = getClientIPFromHeaders(headersList);
    const rl = await checkRateLimit(`${ip}:${session.user.id}`, 'changePassword', RATE_LIMITS.changePassword);
    if (!rl.success) return { success: false, error: 'Too many requests. Please try again later.' };

    if (newPassword.length < 12) {
        return { success: false, error: 'New password must be at least 12 characters' };
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { password: true }
        });

        if (!user?.password) {
            return { success: false, error: 'Password login not available for this account' };
        }

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return { success: false, error: 'Current password is incorrect' };
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({
            where: { id: session.user.id },
            data: { password: hashedPassword }
        });

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to change password', {
            action: 'changePassword',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { success: false, error: 'Failed to change password' };
    }
}

/**
 * Verify user's password for sensitive operations
 * Returns success if password is valid, error otherwise
 */
export async function verifyPassword(
    password: string
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    // Rate limiting
    const headersList = await headers();
    const ip = getClientIPFromHeaders(headersList);
    const rl = await checkRateLimit(`${ip}:${session.user.id}`, 'verifyPassword', RATE_LIMITS.verifyPassword);
    if (!rl.success) return { success: false, error: 'Too many requests. Please try again later.' };

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { password: true }
        });

        if (!user?.password) {
            // OAuth-only account - allow action without password
            // They can only be here if authenticated via OAuth
            return { success: true };
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return { success: false, error: 'Password is incorrect' };
        }

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to verify password', {
            action: 'verifyPassword',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { success: false, error: 'Failed to verify password' };
    }
}

/**
 * Check if user has a password set (vs OAuth-only account)
 */
export async function hasPasswordSet(): Promise<boolean> {
    const session = await auth();
    if (!session?.user?.id) {
        return false;
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { password: true }
    });

    return !!user?.password;
}

export async function deleteAccount(
    password?: string
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    // Rate limiting
    const headersList = await headers();
    const ip = getClientIPFromHeaders(headersList);
    const rl = await checkRateLimit(`${ip}:${session.user.id}`, 'deleteAccount', RATE_LIMITS.deleteAccount);
    if (!rl.success) return { success: false, error: 'Too many requests. Please try again later.' };

    try {
        // Verify password for accounts that have one
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { password: true }
        });

        if (user?.password) {
            if (!password) {
                return { success: false, error: 'Password is required to delete your account' };
            }

            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                return { success: false, error: 'Password is incorrect' };
            }
        }

        // Delete user and all related data (cascading delete is set up in schema)
        await prisma.user.delete({
            where: { id: session.user.id }
        });

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to delete account', {
            action: 'deleteAccount',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { success: false, error: 'Failed to delete account' };
    }
}

export async function getUserSettings() {
    const session = await auth();
    if (!session?.user?.id) {
        return null;
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            name: true,
            email: true,
            password: true, // To check if password login is available
            notificationPreferences: true,
        }
    });

    if (!user) return null;

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        hasPassword: !!user.password,
        notificationPreferences: user.notificationPreferences
            ? { ...DEFAULT_PREFERENCES, ...(user.notificationPreferences as Partial<NotificationPreferences>) }
            : DEFAULT_PREFERENCES
    };
}
