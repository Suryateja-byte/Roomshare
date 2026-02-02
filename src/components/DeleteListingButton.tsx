'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Trash2, AlertTriangle, Loader2, MessageSquare, Calendar } from 'lucide-react';
import { PasswordConfirmationModal } from '@/components/auth/PasswordConfirmationModal';
import { hasPasswordSet } from '@/app/actions/settings';

interface DeletionInfo {
    activeBookings: number;
    pendingBookings: number;
    activeConversations: number;
}

export default function DeleteListingButton({ listingId }: { listingId: string }) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [deletionInfo, setDeletionInfo] = useState<DeletionInfo | null>(null);
    const [isBlocked, setIsBlocked] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [hasPassword, setHasPassword] = useState(false);
    const router = useRouter();

    const handleDeleteClick = async () => {
        setIsChecking(true);
        setDeletionInfo(null);
        setIsBlocked(false);

        try {
            // Check if listing can be deleted
            const checkRes = await fetch(`/api/listings/${listingId}/can-delete`);
            const { canDelete, activeBookings, pendingBookings, activeConversations } = await checkRes.json();

            const info: DeletionInfo = { activeBookings, pendingBookings, activeConversations };
            setDeletionInfo(info);

            if (!canDelete) {
                setIsBlocked(true);
                return;
            }

            // Safe to show confirmation (but may have warnings)
            setShowConfirm(true);
        } catch (error) {
            console.error('Error checking deletability:', error);
            toast.error('Failed to check listing status');
        } finally {
            setIsChecking(false);
        }
    };

    const handleDeleteConfirmClick = async () => {
        // Check if user has password and show password modal
        try {
            const userHasPassword = await hasPasswordSet();
            setHasPassword(userHasPassword);
            setShowPasswordModal(true);
        } catch (error) {
            console.error('Error checking password status:', error);
            // Fallback to showing modal without password requirement
            setHasPassword(false);
            setShowPasswordModal(true);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/listings/${listingId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success('Listing deleted successfully');
                router.push('/search');
                router.refresh();
            } else {
                const data = await response.json();
                toast.error(data.message || data.error || 'Failed to delete listing');
                setIsDeleting(false);
                setShowConfirm(false);
                setShowPasswordModal(false);
            }
        } catch (error) {
            console.error('Error deleting listing:', error);
            toast.error('Failed to delete listing');
            setIsDeleting(false);
            setShowConfirm(false);
            setShowPasswordModal(false);
        }
    };

    const handleCancel = () => {
        setShowConfirm(false);
        setDeletionInfo(null);
        setIsBlocked(false);
        setShowPasswordModal(false);
    };

    // Show blocking message for active bookings
    if (isBlocked && deletionInfo && deletionInfo.activeBookings > 0) {
        return (
            <div className="space-y-3 p-3 border border-destructive/50 rounded-lg bg-destructive/5">
                <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-destructive">
                            Cannot delete listing
                        </p>
                        <p className="text-sm text-muted-foreground">
                            You have {deletionInfo.activeBookings} active booking{deletionInfo.activeBookings > 1 ? 's' : ''} for this listing.
                            Please wait for them to end or cancel them before deleting.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleCancel}
                    >
                        Dismiss
                    </Button>
                    <Button
                        size="sm"
                        className="flex-1"
                        asChild
                    >
                        <Link href="/bookings">Manage Bookings</Link>
                    </Button>
                </div>
            </div>
        );
    }

    // Show confirmation with warnings
    if (showConfirm) {
        const hasWarnings = deletionInfo && (deletionInfo.pendingBookings > 0 || deletionInfo.activeConversations > 0);

        return (
            <div className="space-y-3">
                {hasWarnings && (
                    <div className="p-3 border border-amber-500/50 rounded-lg bg-amber-50 dark:bg-amber-900/20 space-y-2">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                This will affect active users
                            </p>
                        </div>

                        <ul className="text-sm text-amber-600 dark:text-amber-400 space-y-1.5 ml-7">
                            {deletionInfo!.pendingBookings > 0 && (
                                <li className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    <span>
                                        <strong>{deletionInfo!.pendingBookings}</strong> pending booking{deletionInfo!.pendingBookings > 1 ? 's' : ''} will be cancelled
                                    </span>
                                </li>
                            )}
                            {deletionInfo!.activeConversations > 0 && (
                                <li className="flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4" />
                                    <span>
                                        <strong>{deletionInfo!.activeConversations}</strong> conversation{deletionInfo!.activeConversations > 1 ? 's' : ''} will be deleted
                                    </span>
                                </li>
                            )}
                        </ul>
                    </div>
                )}

                <p className="text-sm text-center text-muted-foreground">
                    Are you sure? This action cannot be undone.
                </p>

                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        className="flex-1"
                        onClick={handleCancel}
                        disabled={isDeleting}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={handleDeleteConfirmClick}
                        disabled={isDeleting}
                        aria-busy={isDeleting}
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                                Deleting...
                            </>
                        ) : (
                            'Delete Anyway'
                        )}
                    </Button>
                </div>

                {/* Password Confirmation Modal for Listing Deletion */}
                <PasswordConfirmationModal
                    isOpen={showPasswordModal}
                    onClose={() => setShowPasswordModal(false)}
                    onConfirm={handleDelete}
                    title="Delete Listing"
                    description="This action will permanently delete your listing and all associated data including bookings and conversations."
                    confirmText="Delete Listing"
                    confirmVariant="destructive"
                    hasPassword={hasPassword}
                    isLoading={isDeleting}
                />
            </div>
        );
    }

    // Default state - show delete button
    return (
        <>
            <Button
                variant="destructive"
                className="w-full"
                onClick={handleDeleteClick}
                disabled={isChecking}
                aria-busy={isChecking}
            >
                {isChecking ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                        Checking...
                    </>
                ) : (
                    <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Listing
                    </>
                )}
            </Button>

            {/* Password Confirmation Modal for Listing Deletion */}
            <PasswordConfirmationModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
                onConfirm={handleDelete}
                title="Delete Listing"
                description="This action will permanently delete your listing and all associated data including bookings and conversations."
                confirmText="Delete Listing"
                confirmVariant="destructive"
                hasPassword={hasPassword}
                isLoading={isDeleting}
            />
        </>
    );
}
