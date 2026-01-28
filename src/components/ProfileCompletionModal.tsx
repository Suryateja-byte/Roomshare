'use client';

import { X, AlertCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { FocusTrap } from '@/components/ui/FocusTrap';

interface ProfileCompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    action: string;
    percentage: number;
    required: number;
    missing: string[];
}

export default function ProfileCompletionModal({
    isOpen,
    onClose,
    action,
    percentage,
    required,
    missing
}: ProfileCompletionModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />

            {/* Modal */}
            <FocusTrap active={isOpen}>
            <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl max-w-md w-full p-6">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    aria-label="Close modal"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                        <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                            Complete Your Profile
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            {action} requires {required}% profile completion
                        </p>
                    </div>
                </div>

                {/* Progress */}
                <div className="mb-6">
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-zinc-600 dark:text-zinc-400">Current progress</span>
                        <span className="font-medium text-zinc-900 dark:text-white">{percentage}%</span>
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                        <div
                            className={`h-2 rounded-full transition-all ${
                                percentage >= required ? 'bg-green-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${percentage}%` }}
                        />
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        You need {required - percentage}% more to {action.toLowerCase()}
                    </p>
                </div>

                {/* Missing items */}
                <div className="mb-6">
                    <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                        What's missing:
                    </h3>
                    <ul className="space-y-2">
                        {missing.map((item, index) => (
                            <li
                                key={index}
                                className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"
                            >
                                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <Link
                        href="/profile/edit"
                        className="flex-1 px-4 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                    >
                        Complete Profile
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
            </FocusTrap>
        </div>
    );
}
