import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Admin action types for audit logging
 */
export type AdminAction =
    // User management
    | 'USER_SUSPENDED'
    | 'USER_UNSUSPENDED'
    | 'USER_DELETED'
    | 'USER_VERIFIED'
    | 'USER_UNVERIFIED'
    // Listing management
    | 'LISTING_DELETED'
    | 'LISTING_HIDDEN'
    | 'LISTING_RESTORED'
    // Report management
    | 'REPORT_RESOLVED'
    | 'REPORT_DISMISSED'
    // Verification management
    | 'VERIFICATION_APPROVED'
    | 'VERIFICATION_REJECTED'
    // Other admin actions
    | 'ADMIN_GRANTED'
    | 'ADMIN_REVOKED';

export type TargetType = 'User' | 'Listing' | 'Report' | 'VerificationRequest';

interface LogAdminActionParams {
    adminId: string;
    action: AdminAction;
    targetType: TargetType;
    targetId: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
}

/**
 * Log an admin action to the audit trail
 * This creates an immutable record of admin actions for security/compliance
 */
export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                adminId: params.adminId,
                action: params.action,
                targetType: params.targetType,
                targetId: params.targetId,
                details: (params.details || {}) as any,
                ipAddress: params.ipAddress
            }
        });
    } catch (error) {
        // Log error but don't throw - audit logging should not break admin operations
        logger.sync.error('Failed to log admin action', {
            action: 'logAdminAction',
            adminId: params.adminId,
            targetType: params.targetType,
            targetId: params.targetId,
            auditAction: params.action,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

interface GetAuditLogsParams {
    adminId?: string;
    action?: AdminAction;
    targetType?: TargetType;
    targetId?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
}

/**
 * Fetch audit logs with optional filtering
 */
export async function getAuditLogs(params: GetAuditLogsParams = {}) {
    const {
        adminId,
        action,
        targetType,
        targetId,
        startDate,
        endDate,
        page = 1,
        limit = 50
    } = params;

    const where: Record<string, unknown> = {};

    if (adminId) where.adminId = adminId;
    if (action) where.action = action;
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;

    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
        if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
    }

    const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            include: {
                admin: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit
        }),
        prisma.auditLog.count({ where })
    ]);

    return {
        logs,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
}

/**
 * Get audit logs for a specific target (e.g., all actions taken on a user)
 */
export async function getTargetAuditHistory(targetType: TargetType, targetId: string, limit = 100) {
    return prisma.auditLog.findMany({
        where: {
            targetType,
            targetId
        },
        include: {
            admin: {
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
    });
}

/**
 * Get recent actions by a specific admin
 */
export async function getAdminActionHistory(adminId: string, limit = 20) {
    return prisma.auditLog.findMany({
        where: { adminId },
        orderBy: { createdAt: 'desc' },
        take: limit
    });
}
