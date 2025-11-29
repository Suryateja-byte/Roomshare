'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

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
        <div className="min-h-screen bg-white pt-20">
            <div className="max-w-lg mx-auto px-4 py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                </div>

                <h1 className="text-2xl font-bold text-zinc-900 mb-3">
                    Something went wrong
                </h1>

                <p className="text-zinc-600 mb-8">
                    We couldn&apos;t load the search results. This might be a temporary issue with our servers.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={() => reset()}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-full font-medium hover:bg-zinc-800 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Try again
                    </button>

                    <Link
                        href="/"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-zinc-200 text-zinc-900 rounded-full font-medium hover:bg-zinc-50 transition-colors"
                    >
                        <Home className="w-4 h-4" />
                        Go home
                    </Link>
                </div>

                {/* Error details for debugging (hidden in production) */}
                {process.env.NODE_ENV === 'development' && (
                    <details className="mt-8 text-left bg-zinc-50 rounded-lg p-4">
                        <summary className="text-sm font-medium text-zinc-700 cursor-pointer">
                            Error details (dev only)
                        </summary>
                        <pre className="mt-2 text-xs text-red-600 overflow-auto">
                            {error.message}
                            {error.digest && `\nDigest: ${error.digest}`}
                        </pre>
                    </details>
                )}
            </div>
        </div>
    );
}
