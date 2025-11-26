import Link from 'next/link';

export default function Footer() {
    return (
        <footer className="bg-white border-t border-zinc-100 pt-12 sm:pt-16 md:pt-20 pb-8 sm:pb-10">
            <div className="container mx-auto px-4 sm:px-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-8 sm:gap-10 mb-12 sm:mb-16 md:mb-20">
                    {/* Brand Section - Full width on mobile */}
                    <div className="col-span-2 sm:col-span-3 md:col-span-2 mb-4 sm:mb-0">
                        <Link href="/" className="inline-block mb-4 sm:mb-6">
                            <span className="font-semibold text-lg sm:text-xl tracking-tighter text-zinc-900 ">
                                RoomShare<span className="text-indigo-600 ">.</span>
                            </span>
                        </Link>
                        <p className="text-zinc-500 text-sm leading-relaxed max-w-xs font-light">
                            Designed for modern living. <br className="hidden sm:block" />
                            Connect, live, and thrive with people like you.
                        </p>
                    </div>

                    {/* Platform Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 mb-4 sm:mb-6 text-sm">Platform</h4>
                        <ul className="space-y-3 sm:space-y-4 text-sm text-zinc-500 font-light">
                            <li><Link href="/search" className="hover:text-zinc-900 transition-colors py-1 inline-block">Browse</Link></li>
                            <li><Link href="/listings/create" className="hover:text-zinc-900 transition-colors py-1 inline-block">List a Room</Link></li>
                            <li><Link href="#" className="hover:text-zinc-900 transition-colors py-1 inline-block">Trust & Safety</Link></li>
                        </ul>
                    </div>

                    {/* Company Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 mb-4 sm:mb-6 text-sm">Company</h4>
                        <ul className="space-y-3 sm:space-y-4 text-sm text-zinc-500 font-light">
                            <li><Link href="/about" className="hover:text-zinc-900 transition-colors py-1 inline-block">About</Link></li>
                            <li><Link href="#" className="hover:text-zinc-900 transition-colors py-1 inline-block">Careers</Link></li>
                            <li><Link href="#" className="hover:text-zinc-900 transition-colors py-1 inline-block">Blog</Link></li>
                        </ul>
                    </div>

                    {/* Support Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 mb-4 sm:mb-6 text-sm">Support</h4>
                        <ul className="space-y-3 sm:space-y-4 text-sm text-zinc-500 font-light">
                            <li><Link href="#" className="hover:text-zinc-900 transition-colors py-1 inline-block">Help Center</Link></li>
                            <li><Link href="#" className="hover:text-zinc-900 transition-colors py-1 inline-block">Contact</Link></li>
                        </ul>
                    </div>

                    {/* Legal Links */}
                    <div>
                        <h4 className="font-semibold text-zinc-900 mb-4 sm:mb-6 text-sm">Legal</h4>
                        <ul className="space-y-3 sm:space-y-4 text-sm text-zinc-500 font-light">
                            <li><Link href="#" className="hover:text-zinc-900 transition-colors py-1 inline-block">Privacy</Link></li>
                            <li><Link href="#" className="hover:text-zinc-900 transition-colors py-1 inline-block">Terms</Link></li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="border-t border-zinc-100 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-zinc-400 font-light order-2 sm:order-1">
                        © {new Date().getFullYear()} RoomShare Inc.
                    </p>
                    <nav className="flex items-center gap-6 text-xs text-zinc-400 font-medium order-1 sm:order-2" aria-label="Legal links">
                        <Link href="#" className="hover:text-zinc-900 transition-colors py-1">Privacy</Link>
                        <Link href="#" className="hover:text-zinc-900 transition-colors py-1">Terms</Link>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
