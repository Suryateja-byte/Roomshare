'use client';

import { usePathname } from 'next/navigation';

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

function PaddingOverride() {
    const pathname = usePathname();
    if (!pathShouldRemovePadding(pathname)) return null;
    // Specificity: main#main-content (0-1-1) > Tailwind .pt-16 (0-1-0, layered)
    return <style>{`main#main-content{padding-top:0}`}</style>;
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
    return (
        <main
            id="main-content"
            className="flex-grow pt-16 md:pt-20"
            role="main"
        >
            <PaddingOverride />
            {children}
        </main>
    );
}
