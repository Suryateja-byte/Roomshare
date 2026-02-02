'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';

export type NotificationType =
    | 'BOOKING_REQUEST'
    | 'BOOKING_ACCEPTED'
    | 'BOOKING_REJECTED'
    | 'BOOKING_CANCELLED'
    | 'NEW_MESSAGE'
    | 'NEW_REVIEW'
    | 'LISTING_SAVED'
    | 'SEARCH_ALERT';

interface CreateNotificationInput {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
}

export async function createNotification(input: CreateNotificationInput) {
    try {
        await prisma.notification.create({
            data: {
                userId: input.userId,
                type: input.type,
                title: input.title,
                message: input.message,
                link: input.link
            }
        });
        return { success: true };
    } catch (error) {
        logger.sync.error('Failed to create notification', {
            action: 'createNotification',
            userId: input.userId,
            type: input.type,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to create notification' };
    }
}

export async function getNotifications(limit = 20) {
    const session = await auth();
    if (!session?.user?.id) {
        return { notifications: [], unreadCount: 0, hasMore: false };
    }

    try {
        const [notifications, unreadCount, totalCount] = await Promise.all([
            prisma.notification.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: 'desc' },
                take: limit + 1 // Fetch one extra to check if there are more
            }),
            prisma.notification.count({
                where: { userId: session.user.id, read: false }
            }),
            prisma.notification.count({
                where: { userId: session.user.id }
            })
        ]);

        const hasMore = notifications.length > limit;
        const paginatedNotifications = hasMore ? notifications.slice(0, limit) : notifications;

        return {
            notifications: paginatedNotifications,
            unreadCount,
            hasMore,
            totalCount
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
