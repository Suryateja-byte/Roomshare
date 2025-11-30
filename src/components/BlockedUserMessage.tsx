'use client';

import { Ban, ShieldOff } from 'lucide-react';
import type { BlockStatus } from '@/app/actions/block';

interface BlockedUserMessageProps {
    status: BlockStatus;
    userName?: string;
    showUnblockOption?: boolean;
    onUnblock?: () => void;
}

export default function BlockedUserMessage({
    status,
    userName = 'This user',
    showUnblockOption = false,
    onUnblock
}: BlockedUserMessageProps) {
    if (!status) return null;

    if (status === 'blocked') {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                    <Ban className="w-8 h-8 text-zinc-400" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">
                    You've Been Blocked
                </h3>
                <p className="text-sm text-zinc-500 max-w-sm">
                    {userName} has blocked you. You cannot send messages or interact with them.
                </p>
            </div>
        );
    }

    if (status === 'blocker') {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                    <ShieldOff className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">
                    User Blocked
                </h3>
                <p className="text-sm text-zinc-500 max-w-sm mb-4">
                    You have blocked {userName}. Unblock them to resume communication.
                </p>
                {showUnblockOption && onUnblock && (
                    <button
                        onClick={onUnblock}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
                    >
                        <ShieldOff className="w-4 h-4" />
                        Unblock {userName}
                    </button>
                )}
            </div>
        );
    }

    return null;
}
