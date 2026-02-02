'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
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

    // Provide user-friendly message, avoid exposing technical details
    const getUserFriendlyMessage = () => {
        // Don't show raw error messages to users - they're often technical
        // Instead, provide helpful guidance
        return "We're having trouble loading this page. This is usually temporary — please try again in a moment.";
    };

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                Unable to load this page
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6 max-w-md">
                {getUserFriendlyMessage()}
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
            <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-6 max-w-sm">
                If this keeps happening, try refreshing your browser or checking your internet connection.
            </p>
        </div>
    );
}
