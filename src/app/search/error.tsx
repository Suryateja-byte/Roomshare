'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SearchError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Search page error:', error);
    }, [error]);

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 pt-20">
            <div className="max-w-lg mx-auto px-4 py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
                </div>

                <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
                    Something went wrong
                </h1>

                <p className="text-zinc-600 dark:text-zinc-400 mb-8">
                    We couldn&apos;t load the search results. This might be a temporary issue with our servers.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button onClick={() => reset()} size="lg" className="gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Try again
                    </Button>

                    <Button asChild variant="outline" size="lg" className="gap-2">
                        <Link href="/">
                            <Home className="w-4 h-4" />
                            Go home
                        </Link>
                    </Button>
                </div>

                {/* Error details for debugging (hidden in production) */}
                {process.env.NODE_ENV === 'development' && (
                    <details className="mt-8 text-left bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                        <summary className="text-sm font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
                            Error details (dev only)
                        </summary>
                        <pre className="mt-2 text-xs text-red-600 dark:text-red-400 overflow-auto">
                            {error.message}
                            {error.digest && `\nDigest: ${error.digest}`}
                        </pre>
                    </details>
                )}
            </div>
        </div>
    );
}
