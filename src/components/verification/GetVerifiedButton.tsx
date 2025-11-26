'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

interface GetVerifiedButtonProps {
    className?: string;
    variant?: 'primary' | 'secondary';
}

export default function GetVerifiedButton({
    className = '',
    variant = 'primary'
}: GetVerifiedButtonProps) {
    const baseStyles = "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors";
    const variantStyles = variant === 'primary'
        ? "bg-green-600 text-white hover:bg-green-700"
        : "bg-green-50 text-green-700 hover:bg-green-100";

    return (
        <Link
            href="/verify"
            className={`${baseStyles} ${variantStyles} ${className}`}
        >
            <ShieldCheck className="w-5 h-5" />
            Get Verified
        </Link>
    );
}
