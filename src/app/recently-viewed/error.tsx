'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import * as Sentry from '@sentry/nextjs';

export default function RecentlyViewedError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.withScope((scope) => {
            if (error.digest) {
                scope.setTag('errorDigest', error.digest);
            }
            scope.setTag('errorBoundary', 'recently-viewed');
            Sentry.captureException(error);
        });
    }, [error]);

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                Unable to load recently viewed
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6 max-w-md">
                We had trouble loading your recently viewed listings. This is usually temporary — please try again.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={() => reset()} size="lg" className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Try again
                </Button>
                <Button asChild variant="outline" size="lg" className="gap-2">
                    <Link href="/">
                        <Home className="w-4 h-4" />
                        Go to homepage
                    </Link>
                </Button>
            </div>
        </div>
    );
}
