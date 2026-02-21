'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import {
    createInternalNotification,
    type CreateNotificationInput,
} from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { checkRateLimit, getClientIPFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';

export async function createNotification(input: CreateNotificationInput) {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized', code: 'SESSION_EXPIRED' };
    }

    try {
        // Only admins or users creating notifications for themselves can use this public server action.
        // Internal business flows should call createInternalNotification() directly.
        if (!session.user.isAdmin && session.user.id !== input.userId) {
            logger.sync.warn('Blocked unauthorized notification creation attempt', {
                action: 'createNotification',
                actorUserId: session.user.id,
                targetUserId: input.userId,
                type: input.type,
            });
            return { success: false, error: 'Forbidden' };
        }

        return createInternalNotification(input);
    } catch (error: unknown) {
        logger.sync.error('Failed to create notification', {
            action: 'createNotification',
            errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        });
        return { success: false, error: 'Failed to create notification' };
    }
}

export async function getNotifications(limit = 20) {
    const session = await auth();
    if (!session?.user?.id) {
        return { notifications: [], unreadCount: 0, hasMore: false };
    }

    // Rate limiting
    const headersList = await headers();
    const ip = getClientIPFromHeaders(headersList);
    const rl = await checkRateLimit(`${ip}:${session.user.id}`, 'notifications', RATE_LIMITS.notifications);
    if (!rl.success) return { notifications: [], unreadCount: 0, hasMore: false };

    try {
        const [notifications, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: 'desc' },
                take: limit + 1 // Fetch one extra to check if there are more
            }),
            prisma.notification.count({
                where: { userId: session.user.id, read: false }
            }),
        ]);

        const hasMore = notifications.length > limit;
        const paginatedNotifications = hasMore ? notifications.slice(0, limit) : notifications;

        return {
            notifications: paginatedNotifications,
            unreadCount,
            hasMore,
        };
    } catch (error) {
        logger.sync.error('Failed to fetch notifications', {
            action: 'getNotifications',
            userId: session.user.id,
            limit,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { notifications: [], unreadCount: 0, hasMore: false };
    }
}

export async function getMoreNotifications(cursor: string, limit = 20) {
    const session = await auth();
    if (!session?.user?.id) {
        return { notifications: [], hasMore: false };
    }

    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' },
            take: limit + 1,
            cursor: { id: cursor },
            skip: 1 // Skip the cursor item itself
        });

        const hasMore = notifications.length > limit;
        const paginatedNotifications = hasMore ? notifications.slice(0, limit) : notifications;

        return {
            notifications: paginatedNotifications,
            hasMore
        };
    } catch (error) {
        logger.sync.error('Failed to fetch more notifications', {
            action: 'getMoreNotifications',
            userId: session.user.id,
            cursor,
            limit,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { notifications: [], hasMore: false };
    }
}

export async function markNotificationAsRead(notificationId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
    }

    // Rate limiting
    const headersList = await headers();
    const ip = getClientIPFromHeaders(headersList);
    const rl = await checkRateLimit(`${ip}:${session.user.id}`, 'markNotificationRead', RATE_LIMITS.notifications);
    if (!rl.success) return { error: 'Too many attempts. Please wait.' };

    try {
        await prisma.notification.update({
            where: {
                id: notificationId,
                userId: session.user.id // Ensure user owns the notification
            },
            data: { read: true }
        });

        revalidatePath('/notifications');
        return { success: true };
    } catch (error) {
        logger.sync.error('Failed to mark notification as read', {
            action: 'markNotificationAsRead',
            userId: session.user.id,
            notificationId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to mark notification as read' };
    }
}

export async function markAllNotificationsAsRead() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
    }

    try {
        await prisma.notification.updateMany({
            where: { userId: session.user.id, read: false },
            data: { read: true }
        });

        revalidatePath('/notifications');
        return { success: true };
    } catch (error) {
        logger.sync.error('Failed to mark all notifications as read', {
            action: 'markAllNotificationsAsRead',
            userId: session.user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to mark all notifications as read' };
    }
}

export async function deleteNotification(notificationId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
    }

    try {
        await prisma.notification.delete({
            where: {
                id: notificationId,
                userId: session.user.id
            }
        });

        revalidatePath('/notifications');
        return { success: true };
    } catch (error) {
        logger.sync.error('Failed to delete notification', {
            action: 'deleteNotification',
            userId: session.user.id,
            notificationId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to delete notification' };
    }
}

export async function getUnreadNotificationCount() {
    const session = await auth();
    if (!session?.user?.id) {
        return 0;
    }

    try {
        const count = await prisma.notification.count({
            where: { userId: session.user.id, read: false }
        });
        return count;
    } catch (error) {
        logger.sync.error('Failed to get unread notification count', {
            action: 'getUnreadNotificationCount',
            userId: session.user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return 0;
    }
}

export async function deleteAllNotifications() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
    }

    // Rate limiting
    const headersList3 = await headers();
    const ip3 = getClientIPFromHeaders(headersList3);
    const rl3 = await checkRateLimit(`${ip3}:${session.user.id}`, 'deleteAllNotifications', RATE_LIMITS.notifications);
    if (!rl3.success) return { error: 'Too many attempts. Please wait.' };

    try {
        const result = await prisma.notification.deleteMany({
            where: { userId: session.user.id }
        });

        revalidatePath('/notifications');
        return { success: true, count: result.count };
    } catch (error) {
        logger.sync.error('Failed to delete all notifications', {
            action: 'deleteAllNotifications',
            userId: session.user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to delete notifications' };
    }
}
