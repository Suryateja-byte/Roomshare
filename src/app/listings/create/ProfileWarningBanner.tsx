'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X, ChevronRight, User } from 'lucide-react';

interface ProfileWarningBannerProps {
    percentage: number;
    missing: string[];
}

export default function ProfileWarningBanner({ percentage, missing }: ProfileWarningBannerProps) {
    const [isDismissed, setIsDismissed] = useState(false);

    if (isDismissed) return null;

    // Only show if profile is less than 60% complete
    if (percentage >= 60) return null;

    return (
        <div className="mb-6 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <User className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                                Complete your profile for better results
                            </h3>
                            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                                Listings from complete profiles get 3x more inquiries.
                            </p>
                        </div>
                        <button
                            onClick={() => setIsDismissed(true)}
                            className="flex-shrink-0 p-1 text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                            aria-label="Dismiss"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-amber-600 dark:text-amber-400">Profile {percentage}% complete</span>
                            <span className="text-amber-500 dark:text-amber-500">{missing.length} items remaining</span>
                        </div>
                        <div className="w-full bg-amber-200 dark:bg-amber-900 rounded-full h-1.5">
                            <div
                                className="h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 transition-all"
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    </div>

                    {/* Quick tips */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {missing.slice(0, 2).map((item, index) => (
                            <span
                                key={index}
                                className="inline-flex items-center text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-full"
                            >
                                {item}
                            </span>
                        ))}
                        {missing.length > 2 && (
                            <span className="text-xs text-amber-500 dark:text-amber-500">
                                +{missing.length - 2} more
                            </span>
                        )}
                    </div>

                    {/* CTA */}
                    <Link
                        href="/profile/edit"
                        className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 transition-colors"
                    >
                        Complete profile
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
