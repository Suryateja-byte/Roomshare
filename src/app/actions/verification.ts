'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { sendNotificationEmail } from '@/lib/email';
import { logAdminAction } from '@/lib/audit';

export type DocumentType = 'passport' | 'driver_license' | 'national_id';

interface SubmitVerificationInput {
    documentType: DocumentType;
    documentUrl: string;
    selfieUrl?: string;
}

// 24-hour cooldown period after rejection (balances spam prevention with UX)
const COOLDOWN_HOURS = 24;

export async function submitVerificationRequest(input: SubmitVerificationInput) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
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

        // Check for recent rejection (24-hour cooldown - balances spam prevention with UX)
        // Per best practices: focus on clear feedback to help users succeed on retry
        const cooldownTime = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
        const recentRejection = await prisma.verificationRequest.findFirst({
            where: {
                userId: session.user.id,
                status: 'REJECTED',
                updatedAt: { gte: cooldownTime }
            },
            orderBy: { updatedAt: 'desc' }
        });

        if (recentRejection) {
            const cooldownEndTime = new Date(recentRejection.updatedAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
            const hoursRemaining = Math.ceil((cooldownEndTime.getTime() - Date.now()) / (1000 * 60 * 60));
            return {
                error: `Please wait ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''} before resubmitting. Review the rejection reason and ensure your documents are clear, well-lit, and show all corners of the ID.`,
                cooldownRemaining: hoursRemaining
            };
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
            orderBy: { updatedAt: 'desc' }
        });

        if (rejectedRequest) {
            // Calculate cooldown status
            const cooldownTime = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
            const isInCooldown = rejectedRequest.updatedAt >= cooldownTime;
            let cooldownRemaining: number | undefined;
            let canResubmitAt: Date | undefined;

            if (isInCooldown) {
                canResubmitAt = new Date(rejectedRequest.updatedAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
                cooldownRemaining = Math.ceil((canResubmitAt.getTime() - Date.now()) / (1000 * 60 * 60));
            }

            return {
                status: 'rejected' as const,
                reason: rejectedRequest.adminNotes || 'Your verification was not approved',
                requestId: rejectedRequest.id,
                canResubmit: !isInCooldown,
                cooldownRemaining,
                canResubmitAt: canResubmitAt?.toISOString()
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
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED', requests: [] };
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
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
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

        // Audit log
        await logAdminAction({
            adminId: session.user.id,
            action: 'VERIFICATION_APPROVED',
            targetType: 'VerificationRequest',
            targetId: requestId,
            details: {
                userId: request.userId,
                userName: request.user.name,
                userEmail: request.user.email,
                documentType: request.documentType
            }
        });

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
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
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
                status: 'REJECTED',
                adminNotes: reason,
                reviewedAt: new Date(),
                reviewedBy: session.user.id
            }
        });

        // Send rejection email notification to user
        if (request.user.email) {
            await sendNotificationEmail('verificationRejected', request.user.email, {
                userName: request.user.name || 'User',
                reason: reason
            });
        }

        // Audit log
        await logAdminAction({
            adminId: session.user.id,
            action: 'VERIFICATION_REJECTED',
            targetType: 'VerificationRequest',
            targetId: requestId,
            details: {
                userId: request.userId,
                userName: request.user.name,
                userEmail: request.user.email,
                documentType: request.documentType,
                rejectionReason: reason
            }
        });

        revalidatePath('/admin/verifications');
        revalidatePath('/verify');

        return { success: true };
    } catch (error) {
        console.error('Error rejecting verification:', error);
        return { error: 'Failed to reject verification' };
    }
}

export async function cancelVerificationRequest() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
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
