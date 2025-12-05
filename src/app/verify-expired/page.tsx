'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Clock, Mail, AlertCircle, Loader2, CheckCircle2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function VerifyExpiredPage() {
    const { data: session, status } = useSession();
    const [isResending, setIsResending] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);

    const handleResend = async () => {
        setIsResending(true);
        try {
            const response = await fetch('/api/auth/resend-verification', {
                method: 'POST',
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 429) {
                    toast.error('Too many requests. Please try again later.');
                } else {
                    toast.error(data.error || 'Failed to send verification email');
                }
                return;
            }

            setResendSuccess(true);
            toast.success('Verification email sent! Check your inbox.');
        } catch {
            toast.error('Failed to send verification email. Please try again.');
        } finally {
            setIsResending(false);
        }
    };

    const isLoading = status === 'loading';
    const isLoggedIn = !!session?.user;

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 pt-24">
            <div className="max-w-md mx-auto px-4">
                <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-10 text-white text-center">
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Clock className="w-8 h-8" />
                        </div>
                        <h1 className="text-2xl font-bold">Verification Link Expired</h1>
                        <p className="text-amber-100 mt-2">
                            Your email verification link is no longer valid
                        </p>
                    </div>

                    {/* Content */}
                    <div className="p-8">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                            </div>
                        ) : resendSuccess ? (
                            <div className="text-center py-4">
                                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                                </div>
                                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                                    Check Your Inbox
                                </h2>
                                <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                                    We've sent a new verification link to your email address.
                                    The link will expire in 24 hours.
                                </p>
                                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4">
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                        Didn't receive the email? Check your spam folder or{' '}
                                        <button
                                            onClick={() => setResendSuccess(false)}
                                            className="text-zinc-900 dark:text-white font-medium hover:underline"
                                        >
                                            try again
                                        </button>
                                    </p>
                                </div>
                            </div>
                        ) : isLoggedIn ? (
                            <div className="text-center">
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl p-4 mb-6">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                                        <p className="text-sm text-amber-700 dark:text-amber-300 text-left">
                                            Verification links expire after 24 hours for security reasons.
                                            Click below to receive a new verification email.
                                        </p>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleResend}
                                    disabled={isResending}
                                    className="w-full"
                                    size="lg"
                                >
                                    {isResending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <Mail className="w-4 h-4 mr-2" />
                                            Resend Verification Email
                                        </>
                                    )}
                                </Button>

                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4">
                                    A new link will be sent to {session?.user?.email}
                                </p>
                            </div>
                        ) : (
                            <div className="text-center">
                                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-6 mb-6">
                                    <LogIn className="w-8 h-8 text-zinc-400 mx-auto mb-3" />
                                    <p className="text-zinc-600 dark:text-zinc-400">
                                        Please log in to request a new verification email.
                                    </p>
                                </div>

                                <Link href="/login?callbackUrl=/verify-expired">
                                    <Button className="w-full" size="lg">
                                        <LogIn className="w-4 h-4 mr-2" />
                                        Log In to Continue
                                    </Button>
                                </Link>

                                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-4">
                                    Don't have an account?{' '}
                                    <Link href="/signup" className="text-zinc-900 dark:text-white font-medium hover:underline">
                                        Sign up
                                    </Link>
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Back to Home */}
                <div className="text-center mt-6">
                    <Link
                        href="/"
                        className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                        ← Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
