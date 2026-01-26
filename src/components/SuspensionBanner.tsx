'use client';

import { AlertOctagon } from 'lucide-react';

/**
 * Banner displayed to suspended users informing them of account restrictions.
 * Unlike email verification banner, this cannot be dismissed.
 * P0-01 / P1-01: UI notification for suspended accounts.
 */
export default function SuspensionBanner() {
    return (
        <div
            className="fixed top-16 md:top-20 left-0 right-0 z-sticky bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800"
            role="alert"
            aria-live="polite"
        >
            <div className="max-w-7xl mx-auto px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                        <AlertOctagon className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-red-800 dark:text-red-200">
                            <span className="font-medium">Your account has been suspended.</span>
                            {' '}You cannot create listings, send messages, or make bookings.
                            {' '}If you believe this is an error, please contact support.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
