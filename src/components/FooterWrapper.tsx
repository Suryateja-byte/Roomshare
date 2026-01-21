'use client';

import { usePathname } from 'next/navigation';

export default function FooterWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    // Hide footer on auth pages and search pages (split-view needs full height)
    const shouldHideFooter =
        pathname === '/login' ||
        pathname === '/signup' ||
        pathname === '/search' ||
        pathname.startsWith('/search/');

    if (shouldHideFooter) {
        return null;
    }

    return <>{children}</>;
}
