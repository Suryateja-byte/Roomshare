'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as Sentry from '@sentry/nextjs';

export default function PrivacyError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error, { tags: { errorBoundary: 'privacy' } });
    }, [error]);

    return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center px-4 py-16 text-center">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
                Unable to load this page
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                Something went wrong. Please try again.
            </p>
            <Button onClick={() => reset()} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Try again
            </Button>
        </div>
    );
}
