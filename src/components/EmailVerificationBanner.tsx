'use client';

import { useState } from 'react';
import { AlertTriangle, X, Loader2, Mail, CheckCircle } from 'lucide-react';

interface EmailVerificationBannerProps {
    userEmail?: string | null;
}

export default function EmailVerificationBanner({ userEmail }: EmailVerificationBannerProps) {
    const [isVisible, setIsVisible] = useState(true);
    const [isResending, setIsResending] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleResend = async () => {
        setIsResending(true);
        setError(null);

        try {
            const response = await fetch('/api/auth/resend-verification', {
                method: 'POST',
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to send verification email');
            } else {
                setResendSuccess(true);
                setTimeout(() => setResendSuccess(false), 5000);
            }
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setIsResending(false);
        }
    };

    if (!isVisible) return null;

    return (
        <div className="fixed top-16 md:top-20 left-0 right-0 z-sticky bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
            <div className="max-w-7xl mx-auto px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                                <span className="font-medium">Verify your email</span>
                                {' '}to unlock all features like creating listings and sending messages.
                                {userEmail && (
                                    <span className="text-amber-600 dark:text-amber-400 ml-1">
                                        (Sent to {userEmail})
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {resendSuccess ? (
                            <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400 font-medium">
                                <CheckCircle className="w-4 h-4" />
                                Email sent!
                            </span>
                        ) : (
                            <button
                                onClick={handleResend}
                                disabled={isResending}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/50 hover:bg-amber-200 dark:hover:bg-amber-800 rounded-md transition-colors disabled:opacity-50"
                            >
                                {isResending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Mail className="w-4 h-4" />
                                        Resend
                                    </>
                                )}
                            </button>
                        )}

                        <button
                            onClick={() => setIsVisible(false)}
                            className="p-1 text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                            aria-label="Dismiss"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {error && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
                )}
            </div>
        </div>
    );
}
