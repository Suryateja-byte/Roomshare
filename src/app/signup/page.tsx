'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, Lock, User, CheckCircle2, ArrowRight } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());

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
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-white font-sans selection:bg-zinc-900 selection:text-white ">
            {/* Left Visual */}
            <div className="hidden lg:flex w-1/2 bg-zinc-100 relative flex-col justify-between p-8 xl:p-12 text-zinc-900 ">
                <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]"></div>
                <div className="relative z-10">
                    <span className="text-xl font-semibold tracking-tighter">
                        RoomShare<span className="text-indigo-500">.</span>
                    </span>
                </div>
                <div className="relative z-10">
                    <h2 className="text-3xl xl:text-4xl font-bold mb-6">Join the community redefining modern living.</h2>
                    <ul className="space-y-4 text-zinc-600 ">
                        <li className="flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-600 " />
                            <span>Verified profiles only</span>
                        </li>
                        <li className="flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-600 " />
                            <span>Secure messaging & payments</span>
                        </li>
                        <li className="flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-600 " />
                            <span>Smart compatibility matching</span>
                        </li>
                    </ul>
                </div>
                <p className="relative z-10 text-sm text-zinc-500">Join 50,000+ members today.</p>
            </div>

            {/* Right Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-sm space-y-6 sm:space-y-8">
                    <div className="text-center lg:text-left">
                        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 tracking-tight">Create an account</h1>
                        <p className="text-zinc-500 mt-2 text-sm sm:text-base">Enter your details to get started.</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm text-center">
                            {error}
                        </div>
                    )}

                    {/* Google Sign Up */}
                    <button
                        onClick={() => signIn('google', { callbackUrl: '/' })}
                        className="w-full flex items-center justify-center gap-3 h-11 sm:h-12 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors font-medium text-zinc-700 "
                    >
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
                        Continue with Google
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-zinc-200 "></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-4 text-zinc-500 ">or continue with email</span>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label htmlFor="name" className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ">
                                Full Name
                            </label>
                            <div className="relative">
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
                                <input
                                    id="name"
                                    type="text"
                                    name="name"
                                    required
                                    autoComplete="name"
                                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-10 sm:pl-11 pr-4 text-zinc-900 placeholder:text-zinc-400 outline-none focus:bg-white focus:border-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 transition-colors"
                                    placeholder="John Doe"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="email" className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
                                <input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoComplete="email"
                                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-10 sm:pl-11 pr-4 text-zinc-900 placeholder:text-zinc-400 outline-none focus:bg-white focus:border-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 transition-colors"
                                    placeholder="name@example.com"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="password" className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
                                <input
                                    id="password"
                                    type="password"
                                    name="password"
                                    required
                                    autoComplete="new-password"
                                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-10 sm:pl-11 pr-4 text-zinc-900 placeholder:text-zinc-400 outline-none focus:bg-white focus:border-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 transition-colors"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 sm:h-12 rounded-xl"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Create Account <ArrowRight className="w-4 h-4 ml-2" /></>}
                        </Button>
                    </form>

                    <p className="text-center text-sm text-zinc-500 ">
                        Already have an account?{' '}
                        <Link href="/login" className="font-semibold text-zinc-900 hover:underline">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
