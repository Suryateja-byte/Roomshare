'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface FooterNavLinkProps {
    href: string;
    children: React.ReactNode;
    className?: string;
}

export default function FooterNavLink({ href, children, className = '' }: FooterNavLinkProps) {
    const pathname = usePathname();
    const isActive = pathname === href;

    return (
        <Link
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`${className}${isActive ? ' text-zinc-900 dark:text-white' : ''}`}
        >
            {children}
        </Link>
    );
}
