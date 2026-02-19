import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuditLogs } from '@/lib/audit';
import {
    Shield,
    User,
    Home,
    Flag,
    FileCheck,
    Clock,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

// Action icons and labels
const actionConfig: Record<string, { icon: typeof Shield; label: string; color: string }> = {
    USER_SUSPENDED: { icon: User, label: 'User Suspended', color: 'text-red-500 bg-red-100 dark:bg-red-900/30' },
    USER_UNSUSPENDED: { icon: User, label: 'User Unsuspended', color: 'text-green-500 bg-green-100 dark:bg-green-900/30' },
    USER_DELETED: { icon: User, label: 'User Deleted', color: 'text-red-500 bg-red-100 dark:bg-red-900/30' },
    USER_VERIFIED: { icon: Shield, label: 'User Verified', color: 'text-green-500 bg-green-100 dark:bg-green-900/30' },
    USER_UNVERIFIED: { icon: Shield, label: 'Verification Removed', color: 'text-amber-500 bg-amber-100 dark:bg-amber-900/30' },
    LISTING_DELETED: { icon: Home, label: 'Listing Deleted', color: 'text-red-500 bg-red-100 dark:bg-red-900/30' },
    LISTING_HIDDEN: { icon: Home, label: 'Listing Hidden', color: 'text-amber-500 bg-amber-100 dark:bg-amber-900/30' },
    LISTING_RESTORED: { icon: Home, label: 'Listing Restored', color: 'text-green-500 bg-green-100 dark:bg-green-900/30' },
    REPORT_RESOLVED: { icon: Flag, label: 'Report Resolved', color: 'text-green-500 bg-green-100 dark:bg-green-900/30' },
    REPORT_DISMISSED: { icon: Flag, label: 'Report Dismissed', color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-900/30' },
    VERIFICATION_APPROVED: { icon: FileCheck, label: 'Verification Approved', color: 'text-green-500 bg-green-100 dark:bg-green-900/30' },
    VERIFICATION_REJECTED: { icon: FileCheck, label: 'Verification Rejected', color: 'text-red-500 bg-red-100 dark:bg-red-900/30' },
    ADMIN_GRANTED: { icon: Shield, label: 'Admin Access Granted', color: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30' },
    ADMIN_REVOKED: { icon: Shield, label: 'Admin Access Revoked', color: 'text-amber-500 bg-amber-100 dark:bg-amber-900/30' },
};

interface PageProps {
    searchParams: Promise<{ page?: string; action?: string }>;
}

export default async function AuditLogPage({ searchParams }: PageProps) {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login?callbackUrl=/admin/audit');
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true }
    });

    if (!user?.isAdmin) {
        redirect('/');
    }

    const params = await searchParams;
    const page = parseInt(params.page || '1', 10);
    const actionFilter = params.action;

    const result = await getAuditLogs({
        page,
        limit: 25,
        action: actionFilter as any
    });

    const formatDate = (date: Date) => {
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDetails = (details: unknown): string => {
        if (!details || typeof details !== 'object') return '';
        const d = details as Record<string, unknown>;
        const parts: string[] = [];

        if (d.userName) parts.push(`User: ${d.userName}`);
        if (d.listingTitle) parts.push(`Listing: ${d.listingTitle}`);
        if (d.reason) parts.push(`Reason: ${d.reason}`);
        if (d.rejectionReason) parts.push(`Reason: ${d.rejectionReason}`);
        if (d.adminNotes) parts.push(`Notes: ${d.adminNotes}`);

        return parts.join(' | ');
    };

    // Get unique action types for filter
    const actionTypes = Object.keys(actionConfig);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                            <Link href="/admin" className="hover:text-zinc-700 dark:hover:text-zinc-300">
                                Admin
                            </Link>
                            <span>/</span>
                            <span>Audit Log</span>
                        </div>
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Audit Log</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                            Track all administrative actions taken on the platform
                        </p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4 mb-6">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Filter by action:</span>
                        <Link
                            href="/admin/audit"
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!actionFilter
                                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                        >
                            All
                        </Link>
                        {actionTypes.map((action) => (
                            <Link
                                key={action}
                                href={`/admin/audit?action=${action}`}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${actionFilter === action
                                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }`}
                            >
                                {actionConfig[action]?.label || action}
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Audit Log Table */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Action
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Admin
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Target
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Details
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5" />
                                            Time
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {result.logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 dark:text-zinc-400">
                                            No audit logs found
                                        </td>
                                    </tr>
                                ) : (
                                    result.logs.map((log) => {
                                        const config = actionConfig[log.action] || {
                                            icon: Shield,
                                            label: log.action,
                                            color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800'
                                        };
                                        const ActionIcon = config.icon;

                                        return (
                                            <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>
                                                            <ActionIcon className="w-4 h-4" />
                                                        </div>
                                                        <span className="font-medium text-zinc-900 dark:text-white text-sm">
                                                            {config.label}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {log.admin.image ? (
                                                            <Image
                                                                src={log.admin.image}
                                                                alt={log.admin.name || 'Admin user'}
                                                                width={24}
                                                                height={24}
                                                                className="rounded-full"
                                                            />
                                                        ) : (
                                                            <div className="w-6 h-6 bg-zinc-200 dark:bg-zinc-700 rounded-full flex items-center justify-center">
                                                                <User className="w-3 h-3 text-zinc-500" />
                                                            </div>
                                                        )}
                                                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                                                            {log.admin.name || log.admin.email}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm">
                                                        <span className="text-zinc-500 dark:text-zinc-400">
                                                            {log.targetType}:
                                                        </span>{' '}
                                                        <span className="text-zinc-700 dark:text-zinc-300 font-mono text-xs">
                                                            {log.targetId.substring(0, 8)}...
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs truncate">
                                                        {formatDetails(log.details) || '-'}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                                        {formatDate(log.createdAt)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {result.pagination.totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                Showing {((page - 1) * result.pagination.limit) + 1} to{' '}
                                {Math.min(page * result.pagination.limit, result.pagination.total)} of{' '}
                                {result.pagination.total} entries
                            </p>
                            <div className="flex items-center gap-2">
                                <Link
                                    href={`/admin/audit?page=${page - 1}${actionFilter ? `&action=${actionFilter}` : ''}`}
                                    className={`p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 ${page <= 1
                                        ? 'opacity-50 pointer-events-none'
                                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                        }`}
                                >
                                    <ChevronLeft className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                                </Link>
                                <span className="px-3 py-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                    Page {page} of {result.pagination.totalPages}
                                </span>
                                <Link
                                    href={`/admin/audit?page=${page + 1}${actionFilter ? `&action=${actionFilter}` : ''}`}
                                    className={`p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 ${page >= result.pagination.totalPages
                                        ? 'opacity-50 pointer-events-none'
                                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                        }`}
                                >
                                    <ChevronRight className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
