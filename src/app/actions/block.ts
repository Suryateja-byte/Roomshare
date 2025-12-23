'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';

export type BlockStatus = 'blocker' | 'blocked' | null;

export async function blockUser(userId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    if (session.user.id === userId) {
        return { error: 'You cannot block yourself' };
    }

    try {
        // Check if already blocked
        const existing = await prisma.blockedUser.findUnique({
            where: {
                blockerId_blockedId: {
                    blockerId: session.user.id,
                    blockedId: userId
                }
            }
        });

        if (existing) {
            return { error: 'User is already blocked' };
        }

        await prisma.blockedUser.create({
            data: {
                blockerId: session.user.id,
                blockedId: userId
            }
        });

        revalidatePath('/messages');
        revalidatePath('/settings');

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to block user', {
            action: 'blockUser',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to block user' };
    }
}

export async function unblockUser(userId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        await prisma.blockedUser.delete({
            where: {
                blockerId_blockedId: {
                    blockerId: session.user.id,
                    blockedId: userId
                }
            }
        });

        revalidatePath('/messages');
        revalidatePath('/settings');

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to unblock user', {
            action: 'unblockUser',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to unblock user' };
    }
}

export async function getBlockedUsers() {
    const session = await auth();
    if (!session?.user?.id) {
        return [];
    }

    try {
        const blockedRecords = await prisma.blockedUser.findMany({
            where: { blockerId: session.user.id },
            include: {
                blocked: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        email: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return blockedRecords.map(record => ({
            id: record.id,
            user: record.blocked,
            blockedAt: record.createdAt
        }));
    } catch (error: unknown) {
        logger.sync.error('Failed to fetch blocked users', {
            action: 'getBlockedUsers',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return [];
    }
}

export async function isBlocked(userId: string): Promise<boolean> {
    const session = await auth();
    if (!session?.user?.id) {
        return false;
    }

    try {
        // Check if either user has blocked the other
        const block = await prisma.blockedUser.findFirst({
            where: {
                OR: [
                    { blockerId: session.user.id, blockedId: userId },
                    { blockerId: userId, blockedId: session.user.id }
                ]
            }
        });

        return !!block;
    } catch (error: unknown) {
        logger.sync.error('Failed to check block status', {
            action: 'isBlocked',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
    }
}

export async function getBlockStatus(userId: string): Promise<BlockStatus> {
    const session = await auth();
    if (!session?.user?.id) {
        return null;
    }

    try {
        // Check if current user blocked the target
        const blockedByMe = await prisma.blockedUser.findUnique({
            where: {
                blockerId_blockedId: {
                    blockerId: session.user.id,
                    blockedId: userId
                }
            }
        });

        if (blockedByMe) {
            return 'blocker';
        }

        // Check if target blocked current user
        const blockedByThem = await prisma.blockedUser.findUnique({
            where: {
                blockerId_blockedId: {
                    blockerId: userId,
                    blockedId: session.user.id
                }
            }
        });

        if (blockedByThem) {
            return 'blocked';
        }

        return null;
    } catch (error: unknown) {
        logger.sync.error('Failed to get block status', {
            action: 'getBlockStatus',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
    }
}

export async function checkBlockBeforeAction(userId: string): Promise<{ allowed: boolean; message?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { allowed: false, message: 'Unauthorized' };
    }

    const status = await getBlockStatus(userId);

    if (status === 'blocked') {
        return { allowed: false, message: 'This user has blocked you' };
    }

    if (status === 'blocker') {
        return { allowed: false, message: 'You have blocked this user. Unblock them to interact.' };
    }

    return { allowed: true };
}
