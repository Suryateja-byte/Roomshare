'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import TurnstileWidget, { type TurnstileWidgetRef } from '@/components/auth/TurnstileWidget';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
    const [turnstileToken, setTurnstileToken] = useState<string>('');
    const turnstileRef = useRef<TurnstileWidgetRef>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, turnstileToken })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Something went wrong');
            }

            setSuccess(true);
            // In development, show the reset link
            if (data.resetUrl) {
                setDevResetUrl(data.resetUrl);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            turnstileRef.current?.reset();
            setTurnstileToken('');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
                <div className="w-full max-w-md">
                    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-8 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-8 h-8 text-green-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Check your email</h1>
                        <p className="text-zinc-500 mb-6">
                            If an account exists for <strong>{email}</strong>, you will receive a password reset link shortly.
                        </p>

                        {/* Dev mode: Show reset link */}
                        {devResetUrl && (
                            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-left">
                                <p className="text-xs text-yellow-700 font-medium mb-2">Development Mode - Reset Link:</p>
                                <a
                                    href={devResetUrl}
                                    className="text-xs text-blue-600 hover:underline break-all"
                                >
                                    {devResetUrl}
                                </a>
                            </div>
                        )}

                        <div className="space-y-3">
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                    setSuccess(false);
                                    setEmail('');
                                }}
                            >
                                Try another email
                            </Button>
                            <Link href="/login">
                                <Button className="w-full">
                                    Back to Login
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-8">
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to login
                    </Link>

                    <div className="mb-8">
                        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Forgot password?</h1>
                        <p className="text-zinc-500">
                            No worries, we'll send you reset instructions.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <Label htmlFor="email">Email address</Label>
                            <div className="relative mt-1">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email"
                                    className="pl-10"
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                                {error}
                            </div>
                        )}

                        {/* Turnstile Bot Protection */}
                        <TurnstileWidget
                            ref={turnstileRef}
                            onToken={setTurnstileToken}
                            onExpire={() => setTurnstileToken('')}
                        />

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken)}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                'Reset password'
                            )}
                        </Button>
                    </form>

                    <p className="text-center text-sm text-zinc-500 mt-6">
                        Remember your password?{' '}
                        <Link href="/login" className="text-zinc-900 font-medium hover:underline">
                            Log in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
