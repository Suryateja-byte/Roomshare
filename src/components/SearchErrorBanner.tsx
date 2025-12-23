'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface SearchErrorBannerProps {
    message: string;
    retryable?: boolean;
    onRetry?: () => void;
}

export function SearchErrorBanner({ message, retryable, onRetry }: SearchErrorBannerProps) {
    return (
        <div
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
        >
            <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 text-sm">{message}</span>
            {retryable && onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-900"
                >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Try again
                </button>
            )}
        </div>
    );
}
