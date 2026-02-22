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
        if (process.env.NODE_ENV === 'development') {
            console.error('Search page error:', error);
        }
    }, [error]);

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 pt-[80px] sm:pt-[96px]">
            <div className="max-w-lg mx-auto px-4 py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
                </div>

                <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
                    Unable to load search results
                </h1>

                <p className="text-zinc-600 dark:text-zinc-400 mb-2">
                    We&apos;re having trouble finding listings right now. This is usually temporary.
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-4">
                    Try refreshing the page, or adjust your search filters and try again.
                </p>

                {error.digest && (
                    <p className="mt-2 mb-8 text-sm text-zinc-500 dark:text-zinc-400">
                        Reference ID: <code className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded font-mono text-xs">{error.digest}</code>
                    </p>
                )}

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
