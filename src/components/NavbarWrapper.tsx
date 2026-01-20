'use client';

import { usePathname } from 'next/navigation';

export default function NavbarWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAuthPage = pathname === '/login' ||
        pathname === '/signup' ||
        pathname === '/forgot-password' ||
        pathname === '/reset-password' ||
        pathname === '/verify';

    // Search page has its own header with search functionality
    const isSearchPage = pathname === '/search';

    if (isAuthPage || isSearchPage) {
        return null;
    }

    return <>{children}</>;
}
