'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { ListingStatus, ReportStatus } from '@prisma/client';

// Helper to check admin status
async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', isAdmin: false, userId: null };
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true }
    });

    if (!user?.isAdmin) {
        return { error: 'Unauthorized', isAdmin: false, userId: session.user.id };
    }

    return { error: null, isAdmin: true, userId: session.user.id };
}

// ==================== USER MANAGEMENT ====================

export async function getUsers(options?: {
    search?: string;
    isVerified?: boolean;
    isAdmin?: boolean;
    isSuspended?: boolean;
    page?: number;
    limit?: number;
}) {
    const adminCheck = await requireAdmin();
    if (adminCheck.error) {
        return { error: adminCheck.error, users: [], total: 0 };
    }

    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    try {
        const where: any = {};

        if (options?.search) {
            where.OR = [
                { name: { contains: options.search, mode: 'insensitive' } },
                { email: { contains: options.search, mode: 'insensitive' } }
            ];
        }

        if (options?.isVerified !== undefined) {
            where.isVerified = options.isVerified;
        }

        if (options?.isAdmin !== undefined) {
            where.isAdmin = options.isAdmin;
        }

        if (options?.isSuspended !== undefined) {
            where.isSuspended = options.isSuspended;
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    isVerified: true,
                    isAdmin: true,
                    isSuspended: true,
                    emailVerified: true,
                    _count: {
                        select: {
                            listings: true,
                            bookings: true,
                            reviewsWritten: true
                        }
                    }
                },
                orderBy: { email: 'asc' },
                skip,
                take: limit
            }),
            prisma.user.count({ where })
        ]);

        return { users, total, page, limit };
    } catch (error) {
        console.error('Error fetching users:', error);
        return { error: 'Failed to fetch users', users: [], total: 0 };
    }
}

export async function toggleUserAdmin(userId: string) {
    const adminCheck = await requireAdmin();
    if (adminCheck.error) {
        return { error: adminCheck.error };
    }

    // Prevent self-demotion
    if (userId === adminCheck.userId) {
        return { error: 'Cannot change your own admin status' };
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { isAdmin: true }
        });

        if (!user) {
            return { error: 'User not found' };
        }

        await prisma.user.update({
            where: { id: userId },
            data: { isAdmin: !user.isAdmin }
        });

        revalidatePath('/admin/users');
        return { success: true, isAdmin: !user.isAdmin };
    } catch (error) {
        console.error('Error toggling admin status:', error);
        return { error: 'Failed to update admin status' };
    }
}

export async function suspendUser(userId: string, suspend: boolean) {
    const adminCheck = await requireAdmin();
    if (adminCheck.error) {
        return { error: adminCheck.error };
    }

    // Prevent self-suspension
    if (userId === adminCheck.userId) {
        return { error: 'Cannot suspend yourself' };
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { isSuspended: suspend }
        });

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        console.error('Error suspending user:', error);
        return { error: 'Failed to update user status' };
    }
}

// ==================== LISTING MANAGEMENT ====================

export async function getListingsForAdmin(options?: {
    search?: string;
    status?: ListingStatus;
    ownerId?: string;
    page?: number;
    limit?: number;
}) {
    const adminCheck = await requireAdmin();
    if (adminCheck.error) {
        return { error: adminCheck.error, listings: [], total: 0 };
    }

    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    try {
        const where: any = {};

        if (options?.search) {
            where.OR = [
                { title: { contains: options.search, mode: 'insensitive' } },
                { description: { contains: options.search, mode: 'insensitive' } }
            ];
        }

        if (options?.status) {
            where.status = options.status;
        }

        if (options?.ownerId) {
            where.ownerId = options.ownerId;
        }

        const [listings, total] = await Promise.all([
            prisma.listing.findMany({
                where,
                select: {
                    id: true,
                    title: true,
                    price: true,
                    status: true,
                    images: true,
                    viewCount: true,
                    createdAt: true,
                    owner: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    },
                    location: {
                        select: {
                            city: true,
                            state: true
                        }
                    },
                    _count: {
                        select: {
                            reports: true,
                            bookings: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.listing.count({ where })
        ]);

        return { listings, total, page, limit };
    } catch (error) {
        console.error('Error fetching listings:', error);
        return { error: 'Failed to fetch listings', listings: [], total: 0 };
    }
}

export async function updateListingStatus(listingId: string, status: ListingStatus) {
    const adminCheck = await requireAdmin();
    if (adminCheck.error) {
        return { error: adminCheck.error };
    }

    try {
        await prisma.listing.update({
            where: { id: listingId },
            data: { status }
        });

        revalidatePath('/admin/listings');
        return { success: true };
    } catch (error) {
        console.error('Error updating listing status:', error);
        return { error: 'Failed to update listing status' };
    }
}

export async function deleteListing(listingId: string) {
    const adminCheck = await requireAdmin();
    if (adminCheck.error) {
        return { error: adminCheck.error };
    }

    try {
        await prisma.listing.delete({
            where: { id: listingId }
        });

        revalidatePath('/admin/listings');
        return { success: true };
    } catch (error) {
        console.error('Error deleting listing:', error);
        return { error: 'Failed to delete listing' };
    }
}

// ==================== REPORT MANAGEMENT ====================

export async function getReports(options?: {
    status?: ReportStatus;
    page?: number;
    limit?: number;
}) {
    const adminCheck = await requireAdmin();
    if (adminCheck.error) {
        return { error: adminCheck.error, reports: [], total: 0 };
    }

    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    try {
        const where: any = {};

        if (options?.status) {
            where.status = options.status;
        }

        const [reports, total] = await Promise.all([
            prisma.report.findMany({
                where,
                include: {
                    listing: {
                        select: {
                            id: true,
                            title: true,
                            images: true,
                            owner: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    },
                    reporter: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    },
                    reviewer: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.report.count({ where })
        ]);

        return { reports, total, page, limit };
    } catch (error) {
        console.error('Error fetching reports:', error);
        return { error: 'Failed to fetch reports', reports: [], total: 0 };
    }
}

export async function resolveReport(
    reportId: string,
    action: 'RESOLVED' | 'DISMISSED',
    notes?: string
) {
    const adminCheck = await requireAdmin();
    if (adminCheck.error) {
        return { error: adminCheck.error };
    }

    try {
        await prisma.report.update({
            where: { id: reportId },
            data: {
                status: action,
                adminNotes: notes,
                reviewedBy: adminCheck.userId,
                resolvedAt: new Date()
            }
        });

        revalidatePath('/admin/reports');
        return { success: true };
    } catch (error) {
        console.error('Error resolving report:', error);
        return { error: 'Failed to resolve report' };
    }
}

export async function resolveReportAndRemoveListing(reportId: string, notes?: string) {
    const adminCheck = await requireAdmin();
    if (adminCheck.error) {
        return { error: adminCheck.error };
    }

    try {
        const report = await prisma.report.findUnique({
            where: { id: reportId },
            select: { listingId: true }
        });

        if (!report) {
            return { error: 'Report not found' };
        }

        // Update report and delete listing in transaction
        await prisma.$transaction([
            prisma.report.update({
                where: { id: reportId },
                data: {
                    status: 'RESOLVED',
                    adminNotes: notes || 'Listing removed due to policy violation',
                    reviewedBy: adminCheck.userId,
                    resolvedAt: new Date()
                }
            }),
            prisma.listing.delete({
                where: { id: report.listingId }
            })
        ]);

        revalidatePath('/admin/reports');
        revalidatePath('/admin/listings');
        return { success: true };
    } catch (error) {
        console.error('Error resolving report with listing removal:', error);
        return { error: 'Failed to resolve report' };
    }
}

// ==================== ADMIN STATS ====================

export async function getAdminStats() {
    const adminCheck = await requireAdmin();
    if (adminCheck.error) {
        return { error: adminCheck.error };
    }

    try {
        const [
            totalUsers,
            verifiedUsers,
            suspendedUsers,
            totalListings,
            activeListings,
            pendingVerifications,
            openReports,
            totalBookings,
            totalMessages
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { isVerified: true } }),
            prisma.user.count({ where: { isSuspended: true } }),
            prisma.listing.count(),
            prisma.listing.count({ where: { status: 'ACTIVE' } }),
            prisma.verificationRequest.count({ where: { status: 'PENDING' } }),
            prisma.report.count({ where: { status: 'OPEN' } }),
            prisma.booking.count(),
            prisma.message.count()
        ]);

        return {
            totalUsers,
            verifiedUsers,
            suspendedUsers,
            totalListings,
            activeListings,
            pendingVerifications,
            openReports,
            totalBookings,
            totalMessages
        };
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        return { error: 'Failed to fetch stats' };
    }
}
