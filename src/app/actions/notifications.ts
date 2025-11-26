'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

export type NotificationType =
    | 'BOOKING_REQUEST'
    | 'BOOKING_ACCEPTED'
    | 'BOOKING_REJECTED'
    | 'BOOKING_CANCELLED'
    | 'NEW_MESSAGE'
    | 'NEW_REVIEW'
    | 'LISTING_SAVED';

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
        console.error('Error creating notification:', error);
        return { error: 'Failed to create notification' };
    }
}

export async function getNotifications(limit = 20) {
    const session = await auth();
    if (!session?.user?.id) {
        return { notifications: [], unreadCount: 0 };
    }

    try {
        const [notifications, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: 'desc' },
                take: limit
            }),
            prisma.notification.count({
                where: { userId: session.user.id, read: false }
            })
        ]);

        return { notifications, unreadCount };
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return { notifications: [], unreadCount: 0 };
    }
}

export async function markNotificationAsRead(notificationId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
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
        console.error('Error marking notification as read:', error);
        return { error: 'Failed to mark notification as read' };
    }
}

export async function markAllNotificationsAsRead() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        await prisma.notification.updateMany({
            where: { userId: session.user.id, read: false },
            data: { read: true }
        });

        revalidatePath('/notifications');
        return { success: true };
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        return { error: 'Failed to mark all notifications as read' };
    }
}

export async function deleteNotification(notificationId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
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
        console.error('Error deleting notification:', error);
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
        console.error('Error getting unread notification count:', error);
        return 0;
    }
}
