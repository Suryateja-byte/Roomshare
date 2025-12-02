'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';

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

export async function updateNotificationPreferences(
    preferences: NotificationPreferences
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { notificationPreferences: preferences as any }
        });

        revalidatePath('/settings');
        return { success: true };
    } catch (error) {
        console.error('Error updating notification preferences:', error);
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

    if (newPassword.length < 6) {
        return { success: false, error: 'New password must be at least 6 characters' };
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

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: session.user.id },
            data: { password: hashedPassword }
        });

        return { success: true };
    } catch (error) {
        console.error('Error changing password:', error);
        return { success: false, error: 'Failed to change password' };
    }
}

export async function deleteAccount(): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        // Delete user and all related data (cascading delete is set up in schema)
        await prisma.user.delete({
            where: { id: session.user.id }
        });

        return { success: true };
    } catch (error) {
        console.error('Error deleting account:', error);
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
        ...user,
        hasPassword: !!user.password,
        notificationPreferences: user.notificationPreferences
            ? { ...DEFAULT_PREFERENCES, ...(user.notificationPreferences as Partial<NotificationPreferences>) }
            : DEFAULT_PREFERENCES
    };
}
