'use client';

import { useEffect, useState } from 'react';

function pathShouldRemovePadding(pathname: string): boolean {
    if (!pathname) return false;

    const isHomePage = pathname === '/';
    const isSearchPage = pathname === '/search' || pathname.startsWith('/search/');
    const isAuthPage = pathname === '/login' ||
        pathname === '/signup' ||
        pathname === '/forgot-password' ||
        pathname === '/reset-password' ||
        pathname === '/verify';

    return isHomePage || isSearchPage || isAuthPage;
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
    // Start with a deterministic server/client value to avoid hydration mismatch.
    const [pathname, setPathname] = useState('');

    useEffect(() => {
        const updatePathname = () => setPathname(window.location.pathname);
        updatePathname();

        const originalPushState = window.history.pushState;
        const originalReplaceState = window.history.replaceState;

        window.history.pushState = function (...args) {
            const result = originalPushState.apply(this, args);
            updatePathname();
            return result;
        };

        window.history.replaceState = function (...args) {
            const result = originalReplaceState.apply(this, args);
            updatePathname();
            return result;
        };

        window.addEventListener('popstate', updatePathname);

        return () => {
            window.history.pushState = originalPushState;
            window.history.replaceState = originalReplaceState;
            window.removeEventListener('popstate', updatePathname);
        };
    }, []);

    // Search page handles its own padding/layout.
    // Home page handles its own hero padding.
    // Auth pages are full screen.
    const shouldRemovePadding = pathShouldRemovePadding(pathname);

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
