'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useState, Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import TurnstileWidget, { type TurnstileWidgetRef } from '@/components/auth/TurnstileWidget';
import { AuthErrorAlert } from '@/components/auth/AuthErrorAlert';
import { shouldHighlightEmailForm } from '@/lib/auth-errors';

function LoginForm() {
    const searchParams = useSearchParams();
    const { data: existingSession } = useSession();
    const registered = searchParams.get('registered');
    const urlError = searchParams.get('error');
    const emailInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState<string>('');
    const turnstileRef = useRef<TurnstileWidgetRef>(null);

    // Focus email input when OAuth error suggests using email form
    useEffect(() => {
        if (urlError && shouldHighlightEmailForm(urlError)) {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(() => {
                emailInputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [urlError]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const formData = new FormData(e.currentTarget);
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;
        // Use callback state first, then hidden response field as a fallback.
        const resolvedTurnstileToken =
            turnstileToken || (formData.get('cf-turnstile-response') as string | null) || undefined;

        try {
            // Clear any existing session to prevent stale data
            if (existingSession?.user) {
                await signOut({ redirect: false });
            }

            const result = await signIn('credentials', {
                email,
                password,
                redirect: false,
                ...(resolvedTurnstileToken ? { turnstileToken: resolvedTurnstileToken } : {}),
            });

            if (result?.error) {
                setError('Invalid email or password');
                turnstileRef.current?.reset();
                setTurnstileToken('');
                setLoading(false);
            } else {
                // Force full page reload to ensure fresh session from layout
                window.location.href = '/';
            }
        } catch (err) {
            setError('An error occurred');
            turnstileRef.current?.reset();
            setTurnstileToken('');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-white dark:bg-zinc-950 font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-black">
            {/* Left Visual */}
            <div className="hidden lg:flex w-1/2 bg-zinc-900 relative flex-col justify-between p-8 xl:p-12 text-white">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-50"></div>
                <div className="relative z-10">
                    <span className="text-xl font-semibold tracking-tighter">
                        RoomShare<span className="text-indigo-500">.</span>
                    </span>
                </div>
                <div className="relative z-10 max-w-md">
                    <h2 className="text-2xl xl:text-3xl font-medium leading-tight">
                        "The verification process made me feel so much safer finding a roommate."
                    </h2>
                    <div className="mt-8 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                            <span className="font-medium text-sm">SJ</span>
                        </div>
                        <div>
                            <p className="font-medium text-white">Sarah J.</p>
                            <p className="text-sm text-zinc-400">San Francisco</p>
                        </div>
                    </div>
                </div>
                <p className="relative z-10 text-sm text-zinc-400">© {new Date().getFullYear()} RoomShare Inc.</p>
            </div>

            {/* Right Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 pb-20">
                <div className="w-full max-w-sm space-y-6 sm:space-y-8">
                    <div className="text-center lg:text-left">
                        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 dark:text-white tracking-tight">Welcome back</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm sm:text-base">Enter your email to access your account.</p>
                    </div>

                    {registered && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl text-sm text-center">
                            Account created successfully! Please sign in.
                        </div>
                    )}

                    {(error || urlError) && (
                        <AuthErrorAlert
                            errorCode={urlError}
                            customError={error}
                        />
                    )}

                    {/* Google Sign In */}
                    <button
                        onClick={async () => {
                            setGoogleLoading(true);
                            setError('');
                            try {
                                // Clear any existing session to prevent stale data
                                if (existingSession?.user) {
                                    await signOut({ redirect: false });
                                }
                                await signIn('google', { callbackUrl: '/' });
                            } catch (err) {
                                setError('Failed to initiate Google sign-in. Please try again.');
                                setGoogleLoading(false);
                            }
                        }}
                        disabled={googleLoading}
                        className="w-full flex items-center justify-center gap-3 h-11 sm:h-12 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors font-medium text-zinc-700 dark:text-white shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {googleLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path
                                    fill="#4285F4"
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                                <path
                                    fill="#34A853"
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                />
                                <path
                                    fill="#FBBC05"
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                />
                                <path
                                    fill="#EA4335"
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                />
                            </svg>
                        )}
                        {googleLoading ? 'Signing in...' : 'Continue with Google'}
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-zinc-200 dark:border-zinc-700"></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase tracking-wider font-medium">
                            <span className="bg-white dark:bg-zinc-950 px-4 text-zinc-600 dark:text-zinc-400">or continue with email</span>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1">
                            <label htmlFor="email" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide ml-0.5">
                                Email
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-zinc-400" strokeWidth={1.5} />
                                </div>
                                <input
                                    ref={emailInputRef}
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoComplete="email"
                                    className="block w-full pl-10 pr-3 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent text-sm font-medium transition-shadow duration-200 ease-in-out shadow-sm"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between items-baseline">
                                <label htmlFor="password" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide ml-0.5">
                                    Password
                                </label>
                                <Link href="/forgot-password" className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-zinc-400" strokeWidth={1.5} />
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    required
                                    autoComplete="current-password"
                                    className="block w-full pl-10 pr-10 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent text-sm font-medium transition-shadow duration-200 ease-in-out shadow-sm"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                                    tabIndex={-1}
                                    aria-label="Toggle password visibility"
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-5 w-5" strokeWidth={1.5} />
                                    ) : (
                                        <Eye className="h-5 w-5" strokeWidth={1.5} />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Turnstile Bot Protection */}
                        <TurnstileWidget
                            ref={turnstileRef}
                            onToken={setTurnstileToken}
                            onExpire={() => setTurnstileToken('')}
                        />

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 sm:h-12 rounded-lg shadow-sm hover:shadow-md transition-all"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4 ml-2" /></>}
                        </Button>
                    </form>

                    <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                        Don't have an account?{' '}
                        <Link href="/signup" className="font-semibold text-zinc-900 dark:text-white hover:underline">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950"><Loader2 className="w-8 h-8 animate-spin text-zinc-900 dark:text-white" /></div>}>
            <LoginForm />
        </Suspense>
    );
}
