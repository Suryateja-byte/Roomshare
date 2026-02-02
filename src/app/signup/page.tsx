'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthErrorAlert } from '@/components/auth/AuthErrorAlert';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';

function SignUpForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlError = searchParams.get('error');

    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // Validate Terms of Service acceptance
        if (!acceptedTerms) {
            setError('You must accept the Terms of Service and Privacy Policy to continue.');
            setLoading(false);
            return;
        }

        // Validate password confirmation
        if (password !== confirmPassword) {
            setError('Passwords do not match. Please try again.');
            setLoading(false);
            return;
        }

        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());
        const email = data.email as string;

        // Validate email format client-side
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError('Please enter a valid email address (e.g., user@example.com)');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const json = await res.json();
                throw new Error(json.error || 'Failed to register');
            }

            router.push('/login?registered=true');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-white dark:bg-zinc-950 font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-black">

            {/* Left Visual (Dark Theme) */}
            <div className="hidden lg:flex w-1/2 bg-zinc-900 relative flex-col justify-between p-8 xl:p-12 text-white">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-50"></div>

                {/* Logo */}
                <div className="relative z-10">
                    <span className="text-xl font-semibold tracking-tighter">
                        RoomShare<span className="text-indigo-500">.</span>
                    </span>
                </div>

                {/* Testimonial / Value Prop */}
                <div className="relative z-10 max-w-md">
                    <h2 className="text-2xl xl:text-3xl font-medium leading-tight">
                        &ldquo;I found a roommate who actually respects my space. The verification badge makes all the difference.&rdquo;
                    </h2>
                    <div className="mt-8 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                            <span className="font-medium text-sm">NK</span>
                        </div>
                        <div>
                            <p className="font-medium text-white">Nina K.</p>
                            <p className="text-sm text-zinc-400">New York City</p>
                        </div>
                    </div>
                </div>

                {/* Copyright */}
                <p className="relative z-10 text-sm text-zinc-400">© {new Date().getFullYear()} RoomShare Inc.</p>
            </div>

            {/* Right Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 pb-20">
                <div className="w-full max-w-sm space-y-6 sm:space-y-8">

                    {/* Header */}
                    <div className="text-center lg:text-left">
                        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 dark:text-white tracking-tight">Create an account</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm sm:text-base">Enter your details to get started.</p>
                    </div>

                    {(error || urlError) && (
                        <AuthErrorAlert
                            errorCode={urlError}
                            customError={error}
                        />
                    )}

                    {/* Google Sign Up */}
                    <button
                        type="button"
                        onClick={async () => {
                            setGoogleLoading(true);
                            setError('');
                            try {
                                await signIn('google', { callbackUrl: '/' });
                            } catch (err) {
                                setError('Failed to initiate Google sign-up. Please try again.');
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
                        {googleLoading ? 'Signing up...' : 'Continue with Google'}
                    </button>

                    {/* Divider */}
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-zinc-200 dark:border-zinc-700"></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase tracking-wider font-medium">
                            <span className="bg-white dark:bg-zinc-950 px-4 text-zinc-600 dark:text-zinc-400">or continue with email</span>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* Name Field */}
                        <div className="space-y-1">
                            <label htmlFor="name" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide ml-0.5">
                                Full Name
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-zinc-400" strokeWidth={1.5} />
                                </div>
                                <input
                                    id="name"
                                    type="text"
                                    name="name"
                                    required
                                    autoComplete="name"
                                    className="block w-full pl-10 pr-3 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent text-sm font-medium transition-shadow duration-200 ease-in-out shadow-sm"
                                    placeholder="John Doe"
                                />
                            </div>
                        </div>

                        {/* Email Field */}
                        <div className="space-y-1">
                            <label htmlFor="email" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide ml-0.5">
                                Email
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-zinc-400" strokeWidth={1.5} />
                                </div>
                                <input
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

                        {/* Password Field */}
                        <div className="space-y-1">
                            <label htmlFor="password" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide ml-0.5">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-zinc-400" strokeWidth={1.5} />
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    required
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-10 pr-10 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent text-sm font-medium transition-shadow duration-200 ease-in-out shadow-sm"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-5 w-5" strokeWidth={1.5} />
                                    ) : (
                                        <Eye className="h-5 w-5" strokeWidth={1.5} />
                                    )}
                                </button>
                            </div>
                            <PasswordStrengthMeter password={password} className="mt-2" />
                        </div>

                        {/* Confirm Password Field */}
                        <div className="space-y-1">
                            <label htmlFor="confirmPassword" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide ml-0.5">
                                Confirm Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-zinc-400" strokeWidth={1.5} />
                                </div>
                                <input
                                    id="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    name="confirmPassword"
                                    required
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={`block w-full pl-10 pr-10 py-2.5 bg-white dark:bg-zinc-800 border rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent text-sm font-medium transition-shadow duration-200 ease-in-out shadow-sm ${confirmPassword && password !== confirmPassword
                                        ? 'border-red-400 dark:border-red-500'
                                        : confirmPassword && password === confirmPassword
                                            ? 'border-green-400 dark:border-green-500'
                                            : 'border-zinc-200 dark:border-zinc-700'
                                        }`}
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                                    tabIndex={-1}
                                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showConfirmPassword ? (
                                        <EyeOff className="h-5 w-5" strokeWidth={1.5} />
                                    ) : (
                                        <Eye className="h-5 w-5" strokeWidth={1.5} />
                                    )}
                                </button>
                            </div>
                            {confirmPassword && password !== confirmPassword && (
                                <p className="text-xs text-red-500 dark:text-red-400 mt-1 ml-0.5">
                                    Passwords do not match
                                </p>
                            )}
                            {confirmPassword && password === confirmPassword && (
                                <p className="text-xs text-green-500 dark:text-green-400 mt-1 ml-0.5">
                                    Passwords match
                                </p>
                            )}
                        </div>

                        {/* Terms of Service Checkbox */}
                        <div className="flex items-start gap-3">
                            <input
                                id="terms"
                                type="checkbox"
                                checked={acceptedTerms}
                                onChange={(e) => setAcceptedTerms(e.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 cursor-pointer"
                            />
                            <label htmlFor="terms" className="text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer">
                                I agree to the{' '}
                                <Link href="/terms" className="font-medium text-zinc-900 dark:text-white hover:underline">
                                    Terms of Service
                                </Link>{' '}
                                and{' '}
                                <Link href="/privacy" className="font-medium text-zinc-900 dark:text-white hover:underline">
                                    Privacy Policy
                                </Link>
                            </label>
                        </div>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 sm:h-12 rounded-lg shadow-sm hover:shadow-md transition-all"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Create account <ArrowRight className="w-4 h-4 ml-2" /></>}
                        </Button>
                    </form>

                    <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                        Already have an account?{' '}
                        <Link href="/login" className="font-semibold text-zinc-900 dark:text-white hover:underline">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function SignUpPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950"><Loader2 className="w-8 h-8 animate-spin text-zinc-900 dark:text-white" /></div>}>
            <SignUpForm />
        </Suspense>
    );
}
