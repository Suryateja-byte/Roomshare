'use client';

import { useState } from 'react';
import { Ban, Loader2, ShieldOff } from 'lucide-react';
import { blockUser, unblockUser } from '@/app/actions/block';

interface BlockUserButtonProps {
    userId: string;
    userName: string;
    isBlocked?: boolean;
    variant?: 'button' | 'menu-item';
    onBlockChange?: (isBlocked: boolean) => void;
}

export default function BlockUserButton({
    userId,
    userName,
    isBlocked = false,
    variant = 'button',
    onBlockChange
}: BlockUserButtonProps) {
    const [blocked, setBlocked] = useState(isBlocked);
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleBlock = async () => {
        setIsLoading(true);
        try {
            const result = await blockUser(userId);
            if (result.success) {
                setBlocked(true);
                onBlockChange?.(true);
            }
        } catch (error) {
            console.error('Failed to block user:', error);
        } finally {
            setIsLoading(false);
            setShowConfirm(false);
        }
    };

    const handleUnblock = async () => {
        setIsLoading(true);
        try {
            const result = await unblockUser(userId);
            if (result.success) {
                setBlocked(false);
                onBlockChange?.(false);
            }
        } catch (error) {
            console.error('Failed to unblock user:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (variant === 'menu-item') {
        if (blocked) {
            return (
                <button
                    onClick={handleUnblock}
                    disabled={isLoading}
                    aria-busy={isLoading}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 rounded-sm"
                >
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <ShieldOff className="w-4 h-4" aria-hidden="true" />
                    )}
                    Unblock {userName}
                </button>
            );
        }

        return (
            <button
                onClick={() => setShowConfirm(true)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 rounded-sm"
            >
                <Ban className="w-4 h-4" />
                Block {userName}
            </button>
        );
    }

    // Default button variant
    if (blocked) {
        return (
            <button
                onClick={handleUnblock}
                disabled={isLoading}
                aria-busy={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2"
            >
                {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                    <ShieldOff className="w-4 h-4" aria-hidden="true" />
                )}
                Unblock
            </button>
        );
    }

    return (
        <>
            <button
                onClick={() => setShowConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2"
            >
                <Ban className="w-4 h-4" />
                Block
            </button>

            {/* Confirmation Modal */}
            {showConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setShowConfirm(false)}
                    />
                    <div role="dialog" aria-modal="true" aria-labelledby="block-user-title" className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                        <h3 id="block-user-title" className="text-lg font-semibold text-zinc-900 mb-2">
                            Block {userName}?
                        </h3>
                        <p className="text-sm text-zinc-500 mb-6">
                            {userName} will not be able to message you or book your listings.
                            They will see that you have blocked them.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBlock}
                                disabled={isLoading}
                                aria-busy={isLoading}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                        Blocking...
                                    </>
                                ) : (
                                    'Block User'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
