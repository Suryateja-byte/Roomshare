'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { ListingStatus, ReportStatus } from '@prisma/client';
import { logAdminAction } from '@/lib/audit';

// Helper to check admin status
async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED', isAdmin: false, userId: null };
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true }
    });

    if (!user?.isAdmin) {
        return { error: 'Unauthorized', code: 'NOT_ADMIN', isAdmin: false, userId: session.user.id };
    }

    return { error: null, code: null, isAdmin: true, userId: session.user.id };
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
        // P1-8 FIX: Use proper Prisma type instead of any
        const where: Prisma.UserWhereInput = {};

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
            select: { isAdmin: true, name: true, email: true }
        });

        if (!user) {
            return { error: 'User not found' };
        }

        await prisma.user.update({
            where: { id: userId },
            data: { isAdmin: !user.isAdmin }
        });

        // Audit log
        await logAdminAction({
            adminId: adminCheck.userId!,
            action: user.isAdmin ? 'ADMIN_REVOKED' : 'ADMIN_GRANTED',
            targetType: 'User',
            targetId: userId,
            details: {
                previousState: user.isAdmin,
                newState: !user.isAdmin,
                userName: user.name,
                userEmail: user.email
            }
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
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { isSuspended: true, name: true, email: true }
        });

        if (!user) {
            return { error: 'User not found' };
        }

        await prisma.user.update({
            where: { id: userId },
            data: { isSuspended: suspend }
        });

        // Audit log
        await logAdminAction({
            adminId: adminCheck.userId!,
            action: suspend ? 'USER_SUSPENDED' : 'USER_UNSUSPENDED',
            targetType: 'User',
            targetId: userId,
            details: {
                previousState: user.isSuspended,
                newState: suspend,
                userName: user.name,
                userEmail: user.email
            }
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
        // P1-8 FIX: Use proper Prisma type instead of any
        const where: Prisma.ListingWhereInput = {};

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
        const listing = await prisma.listing.findUnique({
            where: { id: listingId },
            select: { status: true, title: true, ownerId: true }
        });

        if (!listing) {
            return { error: 'Listing not found' };
        }

        await prisma.listing.update({
            where: { id: listingId },
            data: { status }
        });

        // Audit log
        await logAdminAction({
            adminId: adminCheck.userId!,
            action: status === 'PAUSED' ? 'LISTING_HIDDEN' : 'LISTING_RESTORED',
            targetType: 'Listing',
            targetId: listingId,
            details: {
                previousStatus: listing.status,
                newStatus: status,
                listingTitle: listing.title,
                ownerId: listing.ownerId
            }
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
        // Get listing info before deletion for audit
        const listing = await prisma.listing.findUnique({
            where: { id: listingId },
            select: { title: true, ownerId: true, status: true }
        });

        if (!listing) {
            return { error: 'Listing not found' };
        }

        // Check for active ACCEPTED bookings - block deletion if any exist
        const activeAcceptedBookings = await prisma.booking.count({
            where: {
                listingId,
                status: 'ACCEPTED',
                endDate: { gte: new Date() }
            }
        });

        if (activeAcceptedBookings > 0) {
            return {
                error: 'Cannot delete listing with active bookings',
                message: `This listing has ${activeAcceptedBookings} active booking(s). The owner must cancel them first.`,
                activeBookings: activeAcceptedBookings
            };
        }

        // Get all pending bookings to notify tenants before deletion
        const pendingBookings = await prisma.booking.findMany({
            where: {
                listingId,
                status: 'PENDING'
            },
            select: {
                id: true,
                tenantId: true
            }
        });

        // Create notifications for tenants with pending bookings
        const notificationPromises = pendingBookings.map(booking =>
            prisma.notification.create({
                data: {
                    userId: booking.tenantId,
                    type: 'BOOKING_CANCELLED',
                    title: 'Booking Request Cancelled',
                    message: `Your pending booking request for "${listing.title}" has been cancelled because the listing was removed by an administrator.`,
                    link: '/bookings'
                }
            })
        );

        // Delete listing and send notifications in transaction
        await prisma.$transaction([
            ...notificationPromises,
            prisma.listing.delete({
                where: { id: listingId }
            })
        ]);

        // Audit log
        await logAdminAction({
            adminId: adminCheck.userId!,
            action: 'LISTING_DELETED',
            targetType: 'Listing',
            targetId: listingId,
            details: {
                listingTitle: listing.title,
                ownerId: listing.ownerId,
                previousStatus: listing.status,
                pendingBookingsNotified: pendingBookings.length
            }
        });

        revalidatePath('/admin/listings');
        return { success: true, notifiedTenants: pendingBookings.length };
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
        // P1-8 FIX: Use proper Prisma type instead of any
        const where: Prisma.ReportWhereInput = {};

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
        const report = await prisma.report.findUnique({
            where: { id: reportId },
            select: { status: true, reason: true, listingId: true, reporterId: true }
        });

        if (!report) {
            return { error: 'Report not found' };
        }

        await prisma.report.update({
            where: { id: reportId },
            data: {
                status: action,
                adminNotes: notes,
                reviewedBy: adminCheck.userId,
                resolvedAt: new Date()
            }
        });

        // Audit log
        await logAdminAction({
            adminId: adminCheck.userId!,
            action: action === 'RESOLVED' ? 'REPORT_RESOLVED' : 'REPORT_DISMISSED',
            targetType: 'Report',
            targetId: reportId,
            details: {
                previousStatus: report.status,
                newStatus: action,
                reason: report.reason,
                listingId: report.listingId,
                reporterId: report.reporterId,
                adminNotes: notes
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
            select: {
                listingId: true,
                reason: true,
                reporterId: true,
                status: true
            }
        });

        if (!report) {
            return { error: 'Report not found' };
        }

        // Get listing info before deletion
        const listing = await prisma.listing.findUnique({
            where: { id: report.listingId },
            select: { title: true, ownerId: true }
        });

        // Get affected bookings to notify tenants BEFORE deletion
        const affectedBookings = await prisma.booking.findMany({
            where: {
                listingId: report.listingId,
                status: { in: ['PENDING', 'ACCEPTED'] },
                endDate: { gte: new Date() }
            },
            select: {
                id: true,
                tenantId: true,
                status: true
            }
        });

        // Create notifications for affected tenants
        const notificationPromises = affectedBookings.map(booking =>
            prisma.notification.create({
                data: {
                    userId: booking.tenantId,
                    type: 'BOOKING_CANCELLED',
                    title: 'Booking Cancelled - Listing Removed',
                    message: `Your booking for "${listing?.title || 'a listing'}" has been cancelled because the listing was removed due to a policy violation.`,
                    link: '/bookings'
                }
            })
        );

        // Update report, delete listing, and create notifications in transaction
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
            }),
            ...notificationPromises
        ]);


        // Audit log for report resolution
        await logAdminAction({
            adminId: adminCheck.userId!,
            action: 'REPORT_RESOLVED',
            targetType: 'Report',
            targetId: reportId,
            details: {
                previousStatus: report.status,
                newStatus: 'RESOLVED',
                reason: report.reason,
                listingId: report.listingId,
                reporterId: report.reporterId,
                adminNotes: notes || 'Listing removed due to policy violation',
                listingRemoved: true,
                affectedBookings: affectedBookings.length
            }
        });

        // Audit log for listing deletion
        await logAdminAction({
            adminId: adminCheck.userId!,
            action: 'LISTING_DELETED',
            targetType: 'Listing',
            targetId: report.listingId,
            details: {
                listingTitle: listing?.title,
                ownerId: listing?.ownerId,
                deletedDueToReport: reportId,
                adminNotes: notes || 'Listing removed due to policy violation',
                affectedBookings: affectedBookings.length
            }
        });

        revalidatePath('/admin/reports');
        revalidatePath('/admin/listings');
        return { success: true, affectedBookings: affectedBookings.length };
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
