'use client';

import { useState } from 'react';
import { approveVerification, rejectVerification } from '@/app/actions/verification';
import UserAvatar from '@/components/UserAvatar';
import {
    Check,
    X,
    Clock,
    FileText,
    CreditCard,
    Fingerprint,
    ExternalLink,
    Loader2,
    CheckCircle2,
    XCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface VerificationRequest {
    id: string;
    userId: string;
    documentType: string;
    documentUrl: string;
    selfieUrl: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    adminNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
    reviewedAt: Date | null;
    reviewedBy: string | null;
    user: {
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
    };
}

interface VerificationListProps {
    initialRequests: VerificationRequest[];
}

const documentTypeIcons: Record<string, React.ReactNode> = {
    passport: <FileText className="w-4 h-4" />,
    driver_license: <CreditCard className="w-4 h-4" />,
    national_id: <Fingerprint className="w-4 h-4" />,
};

const documentTypeLabels: Record<string, string> = {
    passport: 'Passport',
    driver_license: "Driver's License",
    national_id: 'National ID',
};

export default function VerificationList({ initialRequests }: VerificationListProps) {
    const [requests, setRequests] = useState(initialRequests);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [filter, setFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('all');
    const router = useRouter();

    const handleApprove = async (requestId: string) => {
        setProcessingId(requestId);
        try {
            const result = await approveVerification(requestId);
            if (result.success) {
                setRequests(prev =>
                    prev.map(r =>
                        r.id === requestId
                            ? { ...r, status: 'APPROVED' as const, reviewedAt: new Date() }
                            : r
                    )
                );
            }
        } catch (error) {
            console.error('Error approving:', error);
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (requestId: string) => {
        if (!rejectReason.trim()) {
            alert('Please provide a reason for rejection');
            return;
        }

        setProcessingId(requestId);
        try {
            const result = await rejectVerification(requestId, rejectReason);
            if (result.success) {
                setRequests(prev =>
                    prev.map(r =>
                        r.id === requestId
                            ? { ...r, status: 'REJECTED' as const, adminNotes: rejectReason, reviewedAt: new Date() }
                            : r
                    )
                );
                setRejectingId(null);
                setRejectReason('');
            }
        } catch (error) {
            console.error('Error rejecting:', error);
        } finally {
            setProcessingId(null);
        }
    };

    const filteredRequests = filter === 'all'
        ? requests
        : requests.filter(r => r.status === filter);

    return (
        <div>
            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6">
                {(['all', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${filter === f
                                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                                : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700'
                            }`}
                    >
                        {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                        {f !== 'all' && (
                            <span className="ml-2 text-xs opacity-70">
                                ({requests.filter(r => r.status === f).length})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Requests List */}
            <div className="space-y-4">
                {filteredRequests.length === 0 ? (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-12 text-center">
                        <p className="text-zinc-500 dark:text-zinc-400">No verification requests found</p>
                    </div>
                ) : (
                    filteredRequests.map((request) => (
                        <div
                            key={request.id}
                            className={`bg-white dark:bg-zinc-900 rounded-xl border overflow-hidden ${request.status === 'PENDING'
                                    ? 'border-amber-200 dark:border-amber-800'
                                    : 'border-zinc-100 dark:border-zinc-800'
                                }`}
                        >
                            <div className="p-6">
                                <div className="flex items-start justify-between gap-4">
                                    {/* User Info */}
                                    <div className="flex items-start gap-4">
                                        <UserAvatar
                                            image={request.user.image}
                                            name={request.user.name}
                                            size="lg"
                                        />
                                        <div>
                                            <h3 className="font-semibold text-zinc-900 dark:text-white">
                                                {request.user.name || 'Unknown User'}
                                            </h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">{request.user.email}</p>
                                        </div>
                                    </div>

                                    {/* Status Badge */}
                                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${request.status === 'PENDING'
                                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                            : request.status === 'APPROVED'
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                        }`}>
                                        {request.status === 'PENDING' && <Clock className="w-3 h-3 inline mr-1" />}
                                        {request.status === 'APPROVED' && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                                        {request.status === 'REJECTED' && <XCircle className="w-3 h-3 inline mr-1" />}
                                        {request.status}
                                    </div>
                                </div>

                                {/* Document Info */}
                                <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                                    <div className="flex items-center gap-2 mb-2">
                                        {documentTypeIcons[request.documentType]}
                                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                            {documentTypeLabels[request.documentType] || request.documentType}
                                        </span>
                                    </div>
                                    <div className="flex gap-4 text-sm">
                                        <a
                                            href={request.documentUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            View Document <ExternalLink className="w-3 h-3" />
                                        </a>
                                        {request.selfieUrl && (
                                            <a
                                                href={request.selfieUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                View Selfie <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                                        Submitted {new Date(request.createdAt).toLocaleString()}
                                    </p>
                                </div>

                                {/* Admin Notes (for rejected) */}
                                {request.status === 'REJECTED' && request.adminNotes && (
                                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-100 dark:border-red-800">
                                        <p className="text-sm text-red-700 dark:text-red-400">
                                            <strong>Rejection reason:</strong> {request.adminNotes}
                                        </p>
                                    </div>
                                )}

                                {/* Actions */}
                                {request.status === 'PENDING' && (
                                    <div className="mt-4 flex items-center gap-3">
                                        {rejectingId === request.id ? (
                                            <div className="flex-1 flex gap-2">
                                                <input
                                                    type="text"
                                                    value={rejectReason}
                                                    onChange={(e) => setRejectReason(e.target.value)}
                                                    placeholder="Reason for rejection..."
                                                    className="flex-1 px-3 py-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-600"
                                                />
                                                <button
                                                    onClick={() => handleReject(request.id)}
                                                    disabled={processingId === request.id}
                                                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                                                >
                                                    {processingId === request.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        'Confirm Reject'
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setRejectingId(null);
                                                        setRejectReason('');
                                                    }}
                                                    className="px-4 py-2 bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-600"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleApprove(request.id)}
                                                    disabled={processingId === request.id}
                                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                                                >
                                                    {processingId === request.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Check className="w-4 h-4" />
                                                            Approve
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => setRejectingId(request.id)}
                                                    className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50"
                                                >
                                                    <X className="w-4 h-4" />
                                                    Reject
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
