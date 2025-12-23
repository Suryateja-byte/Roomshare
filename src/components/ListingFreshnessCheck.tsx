'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ListingFreshnessCheckProps {
    listingId: string;
    checkInterval?: number; // in milliseconds, default 30s
}

export default function ListingFreshnessCheck({
    listingId,
    checkInterval = 30000
}: ListingFreshnessCheckProps) {
    const [isDeleted, setIsDeleted] = useState(false);
    const [isUnavailable, setIsUnavailable] = useState(false);
    const router = useRouter();

    useEffect(() => {
        let isMounted = true;

        const checkListingExists = async () => {
            try {
                const response = await fetch(`/api/listings/${listingId}/status`, {
                    method: 'GET',
                    cache: 'no-store'
                });

                if (!isMounted) return;

                // Only process JSON responses - HTML responses indicate routing issues
                const contentType = response.headers.get('content-type');
                if (!contentType?.includes('application/json')) {
                    // Router returned HTML 404 page, not our API response
                    // Silently ignore - don't show misleading "deleted" banner
                    return;
                }

                const data = await response.json();

                if (response.status === 404 && data.error === 'Listing not found') {
                    // Confirmed from our API that listing was deleted
                    setIsDeleted(true);
                } else if (response.ok) {
                    // Check if listing was paused or deactivated
                    if (data.status === 'PAUSED' || data.status === 'RENTED') {
                        setIsUnavailable(true);
                    } else {
                        setIsUnavailable(false);
                        setIsDeleted(false);
                    }
                }
                // Silently ignore 401/403/500 - don't show misleading banners
            } catch (error) {
                // Network or JSON parse error - don't show banner, just log
                console.error('Failed to check listing freshness:', error);
            }
        };

        // Check immediately on mount
        checkListingExists();

        // Set up interval for periodic checks
        const intervalId = setInterval(checkListingExists, checkInterval);

        // Also check when tab becomes visible again
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkListingExists();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [listingId, checkInterval]);

    if (isDeleted) {
        return (
            <div className="fixed top-20 left-0 right-0 z-50 mx-4 sm:mx-auto sm:max-w-lg animate-in slide-in-from-top-4 fade-in duration-300">
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-4 shadow-lg">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-red-900 dark:text-red-100">
                                Listing No Longer Available
                            </h3>
                            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                                This listing has been removed by the host.
                            </p>
                            <button
                                onClick={() => router.push('/search')}
                                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Find Other Listings
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (isUnavailable) {
        return (
            <div className="fixed top-20 left-0 right-0 z-50 mx-4 sm:mx-auto sm:max-w-lg animate-in slide-in-from-top-4 fade-in duration-300">
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 shadow-lg">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                                Listing Currently Unavailable
                            </h3>
                            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                The host has paused or marked this listing as rented.
                            </p>
                            <button
                                onClick={() => router.refresh()}
                                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Refresh Page
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
