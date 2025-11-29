'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { sendNotificationEmail } from '@/lib/email';

export type DocumentType = 'passport' | 'driver_license' | 'national_id';

interface SubmitVerificationInput {
    documentType: DocumentType;
    documentUrl: string;
    selfieUrl?: string;
}

export async function submitVerificationRequest(input: SubmitVerificationInput) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        // Check if user already has a pending verification request
        const existingRequest = await prisma.verificationRequest.findFirst({
            where: {
                userId: session.user.id,
                status: 'PENDING'
            }
        });

        if (existingRequest) {
            return { error: 'You already have a pending verification request' };
        }

        // Check if user is already verified
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { isVerified: true }
        });

        if (user?.isVerified) {
            return { error: 'You are already verified' };
        }

        // Create verification request
        const request = await prisma.verificationRequest.create({
            data: {
                userId: session.user.id,
                documentType: input.documentType,
                documentUrl: input.documentUrl,
                selfieUrl: input.selfieUrl
            }
        });

        revalidatePath('/profile');
        revalidatePath('/verify');

        return { success: true, requestId: request.id };
    } catch (error) {
        console.error('Error submitting verification request:', error);
        return { error: 'Failed to submit verification request' };
    }
}

export async function getMyVerificationStatus() {
    const session = await auth();
    if (!session?.user?.id) {
        return { status: 'not_logged_in' as const };
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { isVerified: true }
        });

        if (user?.isVerified) {
            return { status: 'verified' as const };
        }

        // Check for pending request
        const pendingRequest = await prisma.verificationRequest.findFirst({
            where: {
                userId: session.user.id,
                status: 'PENDING'
            },
            orderBy: { createdAt: 'desc' }
        });

        if (pendingRequest) {
            return { status: 'pending' as const, requestId: pendingRequest.id };
        }

        // Check for rejected request
        const rejectedRequest = await prisma.verificationRequest.findFirst({
            where: {
                userId: session.user.id,
                status: 'REJECTED'
            },
            orderBy: { createdAt: 'desc' }
        });

        if (rejectedRequest) {
            return {
                status: 'rejected' as const,
                reason: rejectedRequest.adminNotes || 'Your verification was not approved',
                requestId: rejectedRequest.id
            };
        }

        return { status: 'not_started' as const };
    } catch (error) {
        console.error('Error getting verification status:', error);
        return { status: 'error' as const };
    }
}

// Admin functions
export async function getPendingVerifications() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', requests: [] };
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true }
    });

    if (!user?.isAdmin) {
        return { error: 'Unauthorized', requests: [] };
    }

    try {
        const requests = await prisma.verificationRequest.findMany({
            where: { status: 'PENDING' },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        return { requests };
    } catch (error) {
        console.error('Error fetching pending verifications:', error);
        return { error: 'Failed to fetch verifications', requests: [] };
    }
}

export async function approveVerification(requestId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    // Check if user is admin
    const adminUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true }
    });

    if (!adminUser?.isAdmin) {
        return { error: 'Unauthorized' };
    }

    try {
        const request = await prisma.verificationRequest.findUnique({
            where: { id: requestId },
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        if (!request) {
            return { error: 'Request not found' };
        }

        // Update request status
        await prisma.verificationRequest.update({
            where: { id: requestId },
            data: {
                status: 'APPROVED',
                reviewedAt: new Date(),
                reviewedBy: session.user.id
            }
        });

        // Update user verification status
        await prisma.user.update({
            where: { id: request.userId },
            data: { isVerified: true }
        });

        // Send email notification
        if (request.user.email) {
            await sendNotificationEmail('welcomeEmail', request.user.email, {
                userName: request.user.name || 'User'
            });
        }

        revalidatePath('/admin/verifications');

        return { success: true };
    } catch (error) {
        console.error('Error approving verification:', error);
        return { error: 'Failed to approve verification' };
    }
}

export async function rejectVerification(requestId: string, reason: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    // Check if user is admin
    const adminUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true }
    });

    if (!adminUser?.isAdmin) {
        return { error: 'Unauthorized' };
    }

    try {
        const request = await prisma.verificationRequest.findUnique({
            where: { id: requestId }
        });

        if (!request) {
            return { error: 'Request not found' };
        }

        // Update request status
        await prisma.verificationRequest.update({
            where: { id: requestId },
            data: {
                status: 'REJECTED',
                adminNotes: reason,
                reviewedAt: new Date(),
                reviewedBy: session.user.id
            }
        });

        revalidatePath('/admin/verifications');

        return { success: true };
    } catch (error) {
        console.error('Error rejecting verification:', error);
        return { error: 'Failed to reject verification' };
    }
}

export async function cancelVerificationRequest() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        // Delete pending request
        await prisma.verificationRequest.deleteMany({
            where: {
                userId: session.user.id,
                status: 'PENDING'
            }
        });

        revalidatePath('/verify');
        revalidatePath('/profile');

        return { success: true };
    } catch (error) {
        console.error('Error cancelling verification request:', error);
        return { error: 'Failed to cancel verification request' };
    }
}
