'use client';

import { useEffect } from 'react';
import { RefreshCw, Settings } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function SettingsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Settings error:', error);
    }, [error]);

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
                <Settings className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                Unable to load your settings
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-2 max-w-md">
                We&apos;re having trouble loading your settings right now. This is usually temporary.
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-6 max-w-md">
                Your settings are safe — try refreshing the page in a moment.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={() => reset()} size="lg" className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Try again
                </Button>
                <Button asChild variant="outline" size="lg" className="gap-2">
                    <Link href="/profile">Go to profile</Link>
                </Button>
            </div>
        </div>
    );
}
