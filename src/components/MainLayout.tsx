'use client';

import { usePathname } from 'next/navigation';

export default function MainLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isHomePage = pathname === '/';
    const isSearchPage = pathname === '/search';

    const isAuthPage = pathname === '/login' ||
        pathname === '/signup' ||
        pathname === '/forgot-password' ||
        pathname === '/reset-password' ||
        pathname === '/verify';

    // Search page handles its own padding/layout
    // Home page handles its own hero padding
    // Auth pages are full screen
    const shouldRemovePadding = isHomePage || isSearchPage || isAuthPage;

    return (
        <main
            id="main-content"
            className={`flex-grow ${shouldRemovePadding ? '' : 'pt-16 md:pt-20'}`}
            role="main"
        >
            {children}
        </main>
    );
}
