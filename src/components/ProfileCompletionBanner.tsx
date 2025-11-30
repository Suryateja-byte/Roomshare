'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, User, ChevronRight } from 'lucide-react';
import type { ProfileCompletion } from '@/lib/profile-completion';

interface ProfileCompletionBannerProps {
    completion: ProfileCompletion;
}

export default function ProfileCompletionBanner({ completion }: ProfileCompletionBannerProps) {
    const [isDismissed, setIsDismissed] = useState(false);

    // Don't show if complete or dismissed
    if (completion.percentage >= 100 || isDismissed) {
        return null;
    }

    return (
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl p-4 mb-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                        <User className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold mb-1">
                            Complete Your Profile ({completion.percentage}%)
                        </h3>
                        <p className="text-sm text-white/80 mb-3">
                            {completion.percentage < 40
                                ? "Add a bio to start messaging hosts"
                                : completion.percentage < 60
                                ? "Add a photo to create listings"
                                : completion.percentage < 80
                                ? "Verify your identity to book rooms"
                                : "Almost there! Complete your profile for full access"
                            }
                        </p>

                        {/* Progress bar */}
                        <div className="w-full bg-white/20 rounded-full h-2 mb-3">
                            <div
                                className="bg-white rounded-full h-2 transition-all duration-500"
                                style={{ width: `${completion.percentage}%` }}
                            />
                        </div>

                        {/* Missing items */}
                        <div className="flex flex-wrap gap-2">
                            {completion.missing.slice(0, 3).map((item, index) => (
                                <span
                                    key={index}
                                    className="text-xs px-2 py-1 bg-white/20 rounded-full"
                                >
                                    {item}
                                </span>
                            ))}
                            {completion.missing.length > 3 && (
                                <span className="text-xs px-2 py-1 bg-white/20 rounded-full">
                                    +{completion.missing.length - 3} more
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href="/profile/edit"
                        className="flex items-center gap-1 px-3 py-1.5 bg-white text-indigo-600 rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
                    >
                        Complete
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                    <button
                        onClick={() => setIsDismissed(true)}
                        className="p-1 hover:bg-white/20 rounded transition-colors"
                        aria-label="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
