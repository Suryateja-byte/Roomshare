'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as Sentry from '@sentry/nextjs';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Report to Sentry with digest for server-side correlation
        Sentry.withScope((scope) => {
            if (error.digest) {
                scope.setTag('errorDigest', error.digest);
            }
            scope.setTag('errorBoundary', 'nextjs-global');
            Sentry.captureException(error);
        });

        // Log in development for debugging
        if (process.env.NODE_ENV === 'development') {
            console.error('Global error boundary caught:', error);
        }
    }, [error]);

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Something went wrong!</h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6 max-w-md">
                {error.message || 'An unexpected error occurred.'}
            </p>
            <Button onClick={() => reset()} size="lg" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Try again
            </Button>
        </div>
    );
}
