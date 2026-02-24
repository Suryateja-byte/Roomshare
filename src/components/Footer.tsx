'use client';

import Link from 'next/link';
import { toast } from 'sonner';

export default function Footer() {
    return (
        <footer className="bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-white/5 pt-24 pb-12 overflow-hidden">
            <div className="max-w-7xl mx-auto px-6 sm:px-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-12 md:gap-16 mb-20">
                    {/* Brand Section */}
                    <div className="col-span-2 sm:col-span-3 md:col-span-2">
                        <Link href="/" className="inline-flex items-center gap-2.5 mb-6 group">
                            <div className="w-8 h-8 bg-zinc-900 dark:bg-white rounded-lg flex items-center justify-center text-white dark:text-zinc-900 font-bold text-lg group-hover:scale-110 transition-transform shadow-lg shadow-zinc-900/10">
                                R
                            </div>
                            <span className="font-semibold text-lg tracking-[-0.03em] text-zinc-900 dark:text-white">
                                RoomShare<span className="text-indigo-600 dark:text-indigo-400">.</span>
                            </span>
                        </Link>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm font-light leading-relaxed max-w-xs">
                            The modern standard for shared living. Find your perfect home and compatible roommates with ease.
                        </p>
                    </div>

                    {/* Platform Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white mb-6 text-xs uppercase tracking-[0.2em]">Platform</h4>
                        <ul className="flex flex-col gap-4 text-sm text-zinc-500 dark:text-zinc-400 font-light">
                            <li><Link href="/search" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Browse</Link></li>
                            <li><Link href="/listings/create" className="hover:text-zinc-900 dark:hover:text-white transition-colors">List a Room</Link></li>
                            <li><button onClick={() => toast.info('Coming soon')} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-left">Safety</button></li>
                        </ul>
                    </div>

                    {/* Company Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white mb-6 text-xs uppercase tracking-[0.2em]">Company</h4>
                        <ul className="flex flex-col gap-4 text-sm text-zinc-500 dark:text-zinc-400 font-light">
                            <li><Link href="/about" className="hover:text-zinc-900 dark:hover:text-white transition-colors">About</Link></li>
                            <li><button onClick={() => toast.info('Coming soon')} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-left">Careers</button></li>
                            <li><button onClick={() => toast.info('Coming soon')} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-left">Blog</button></li>
                        </ul>
                    </div>

                    {/* Support Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white mb-6 text-xs uppercase tracking-[0.2em]">Support</h4>
                        <ul className="flex flex-col gap-4 text-sm text-zinc-500 dark:text-zinc-400 font-light">
                            <li><button onClick={() => toast.info('Coming soon')} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-left">Help Center</button></li>
                            <li><button onClick={() => toast.info('Coming soon')} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-left">Contact</button></li>
                        </ul>
                    </div>

                    {/* Legal Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white mb-6 text-xs uppercase tracking-[0.2em]">Legal</h4>
                        <ul className="flex flex-col gap-4 text-sm text-zinc-500 dark:text-zinc-400 font-light">
                            <li><button onClick={() => toast.info('Coming soon')} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-left">Privacy</button></li>
                            <li><button onClick={() => toast.info('Coming soon')} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-left">Terms</button></li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="border-t border-zinc-100 dark:border-white/5 pt-10 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] order-2 sm:order-1">
                        © {new Date().getFullYear()} RoomShare Inc.
                    </p>
                    <div className="flex items-center gap-8 order-1 sm:order-2">
                        <button onClick={() => toast.info('Coming soon')} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-white uppercase tracking-[0.2em] transition-colors">Instagram</button>
                        <button onClick={() => toast.info('Coming soon')} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-white uppercase tracking-[0.2em] transition-colors">X</button>
                        <button onClick={() => toast.info('Coming soon')} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-white uppercase tracking-[0.2em] transition-colors">LinkedIn</button>
                    </div>
                </div>
            </div>
        </footer>
    );
}
