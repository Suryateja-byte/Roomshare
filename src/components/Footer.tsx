'use client';

import Link from 'next/link';
import { toast } from 'sonner';

export default function Footer() {
    return (
        <footer className="bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 pt-16 pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-10 md:gap-12 mb-16">
                    {/* Brand Section */}
                    <div className="col-span-2 sm:col-span-3 md:col-span-2 mb-4 sm:mb-0">
                        <Link href="/" className="inline-block mb-5">
                            <span className="font-semibold text-lg tracking-tight text-zinc-900 dark:text-white">
                                RoomShare<span className="text-zinc-500 dark:text-zinc-400">.</span>
                            </span>
                        </Link>
                        <p className="text-zinc-500 dark:text-zinc-400 text-xs-plus leading-relaxed max-w-xs">
                            Designed for modern living. <br className="hidden sm:block" />
                            Connect, live, and thrive with people like you.
                        </p>
                    </div>

                    {/* Platform Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white mb-4 text-xs-plus tracking-tight">Platform</h4>
                        <ul className="flex flex-col gap-2.5 text-xs-plus text-zinc-500 dark:text-zinc-400">
                            <li><Link href="/search" className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-block">Browse</Link></li>
                            <li><Link href="/listings/create" className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-block">List a Room</Link></li>
                            <li><button onClick={() => toast.info('Trust & Safety page coming soon!')} className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-block text-left">Trust & Safety</button></li>
                        </ul>
                    </div>

                    {/* Company Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white mb-4 text-xs-plus tracking-tight">Company</h4>
                        <ul className="flex flex-col gap-2.5 text-xs-plus text-zinc-500 dark:text-zinc-400">
                            <li><Link href="/about" className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-block">About</Link></li>
                            <li><button onClick={() => toast.info('Careers page coming soon!')} className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-block text-left">Careers</button></li>
                            <li><button onClick={() => toast.info('Blog coming soon!')} className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-block text-left">Blog</button></li>
                        </ul>
                    </div>

                    {/* Support Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white mb-4 text-xs-plus tracking-tight">Support</h4>
                        <ul className="flex flex-col gap-2.5 text-xs-plus text-zinc-500 dark:text-zinc-400">
                            <li><button onClick={() => toast.info('Help Center coming soon!')} className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-block text-left">Help Center</button></li>
                            <li><button onClick={() => toast.info('Contact support coming soon!')} className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-block text-left">Contact</button></li>
                        </ul>
                    </div>

                    {/* Legal Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white mb-4 text-xs-plus tracking-tight">Legal</h4>
                        <ul className="flex flex-col gap-2.5 text-xs-plus text-zinc-500 dark:text-zinc-400">
                            <li><button onClick={() => toast.info('Privacy Policy coming soon!')} className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-block text-left">Privacy</button></li>
                            <li><button onClick={() => toast.info('Terms of Service coming soon!')} className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-block text-left">Terms</button></li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 order-2 sm:order-1">
                        © {new Date().getFullYear()} RoomShare Inc.
                    </p>
                    <nav className="flex items-center gap-6 text-xs text-zinc-500 dark:text-zinc-400 order-1 sm:order-2" aria-label="Legal links">
                        <button onClick={() => toast.info('Privacy Policy coming soon!')} className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Privacy</button>
                        <button onClick={() => toast.info('Terms of Service coming soon!')} className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Terms</button>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
