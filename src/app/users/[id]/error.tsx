'use client';

import { useEffect } from 'react';
import { RefreshCw, User } from 'lucide-react';
import Link from 'next/link';

export default function UserProfileError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('User profile error:', error);
    }, [error]);

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
                <User className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                Unable to load user profile
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6 max-w-md">
                {error.message || 'We encountered an error while loading this user profile. Please try again.'}
            </p>
            <div className="flex gap-3">
                <button
                    onClick={() => reset()}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Try again
                </button>
                <Link
                    href="/search"
                    className="inline-flex items-center gap-2 px-6 py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                    Browse listings
                </Link>
            </div>
        </div>
    );
}
