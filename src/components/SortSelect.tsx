'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SortOption } from '@/lib/data';
import { useSearchTransitionSafe } from '@/contexts/SearchTransitionContext';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'recommended', label: 'Recommended' },
    { value: 'price_asc', label: 'Price: Low to High' },
    { value: 'price_desc', label: 'Price: High to Low' },
    { value: 'newest', label: 'Newest First' },
    { value: 'rating', label: 'Top Rated' },
];

interface SortSelectProps {
    currentSort: SortOption;
}

export default function SortSelect({ currentSort }: SortSelectProps) {
    const [mounted, setMounted] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const transitionContext = useSearchTransitionSafe();

    // Prevent hydration mismatch from Radix UI generating different IDs on server vs client
    useEffect(() => {
        setMounted(true);
    }, []);

    const handleSortChange = (newSort: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (newSort === 'recommended') {
            params.delete('sort');
        } else {
            params.set('sort', newSort);
        }
        // Reset pagination state when sort changes (keyset + offset)
        params.delete('page');
        params.delete('cursor');
        params.delete('cursorStack');
        params.delete('pageNumber');
        const url = `/search?${params.toString()}`;
        if (transitionContext) {
            transitionContext.navigateWithTransition(url);
        } else {
            router.push(url);
        }
    };

    const currentLabel = sortOptions.find(opt => opt.value === currentSort)?.label || 'Recommended';

    // Render placeholder during SSR to prevent hydration mismatch
    if (!mounted) {
        return (
            <div className="hidden md:flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                <span>Sort by:</span>
                <div className="h-9 min-w-[140px] px-3 py-1.5 text-zinc-900 dark:text-white font-semibold text-xs flex items-center">
                    {currentLabel}
                </div>
            </div>
        );
    }

    return (
        <div className="hidden md:flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>Sort by:</span>
            {/* FIX APPLIED: modal={false} 
               This prevents Radix from setting document.body.style.overflow = 'hidden'
               which causes the layout shift/shake.
            */}
            {/* @ts-ignore - modal prop exists on Select but TS might not pick it up correctly */}
            <Select value={currentSort} onValueChange={handleSortChange} modal={false}>
                <SelectTrigger className="h-9 w-auto min-w-[140px] border-none bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-1.5 text-zinc-900 dark:text-white font-semibold text-xs focus:ring-0">
                    <SelectValue placeholder="Recommended">
                        {currentLabel}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {sortOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
