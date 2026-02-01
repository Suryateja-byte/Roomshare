'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SortOption } from '@/lib/data';
import { useSearchTransitionSafe } from '@/contexts/SearchTransitionContext';
import { ArrowUpDown, Check } from 'lucide-react';
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
    const [mobileOpen, setMobileOpen] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const transitionContext = useSearchTransitionSafe();

    // Prevent hydration mismatch from Radix UI generating different IDs on server vs client
    useEffect(() => {
        setMounted(true);
    }, []);

    // P2-3: Memoize handler to improve INP by preventing function recreation on each render
    const handleSortChange = useCallback((newSort: string) => {
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
        setMobileOpen(false);
    }, [searchParams, transitionContext, router]);

    const currentLabel = sortOptions.find(opt => opt.value === currentSort)?.label || 'Recommended';
    const isNonDefault = currentSort !== 'recommended';

    // Render placeholder during SSR to prevent hydration mismatch
    if (!mounted) {
        return (
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                <button
                    type="button"
                    className="md:hidden flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                    <ArrowUpDown className="w-4 h-4" />
                    <span className="hidden sm:inline">Sort</span>
                </button>
                <div className="hidden md:flex items-center gap-2">
                    <span>Sort by:</span>
                    <div className="h-9 min-w-[140px] px-3 py-1.5 text-zinc-900 dark:text-white font-semibold text-xs flex items-center">
                        {currentLabel}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Mobile sort button */}
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className={`md:hidden flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full border text-sm font-medium transition-colors ${
                    isNonDefault
                        ? 'border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
                aria-label={`Sort: ${currentLabel}`}
            >
                <ArrowUpDown className="w-4 h-4" />
                <span className="hidden sm:inline">Sort</span>
            </button>

            {/* Mobile sort sheet */}
            {mobileOpen && (
                <div className="md:hidden fixed inset-0 z-50">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setMobileOpen(false)}
                        aria-hidden="true"
                    />
                    {/* Sheet */}
                    <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 rounded-t-2xl shadow-xl animate-in slide-in-from-bottom duration-200">
                        <div className="flex justify-center py-3">
                            <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
                        </div>
                        <div className="px-4 pb-2">
                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Sort by</h3>
                        </div>
                        <div className="px-2 pb-6">
                            {sortOptions.map((option) => {
                                const isActive = option.value === currentSort;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => handleSortChange(option.value)}
                                        className={`flex items-center justify-between w-full px-4 py-3.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                                            isActive
                                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                        }`}
                                    >
                                        <span>{option.label}</span>
                                        {isActive && <Check className="w-4 h-4 text-zinc-900 dark:text-white" />}
                                    </button>
                                );
                            })}
                        </div>
                        {/* Safe area spacer for phones with home indicator */}
                        <div className="h-safe-area-inset-bottom" />
                    </div>
                </div>
            )}

            {/* Desktop sort dropdown */}
            <div className="hidden md:flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                <span>Sort by:</span>
                {/* @ts-ignore - modal prop exists on Select but TS might not pick it up correctly */}
                <Select value={currentSort} onValueChange={handleSortChange} modal={false}>
                    <SelectTrigger className={`h-9 w-auto min-w-[140px] border-none bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-1.5 font-semibold text-xs focus:ring-0 ${
                        isNonDefault ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'
                    }`}>
                        <SelectValue placeholder="Recommended">
                            {currentLabel}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {sortOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                <span className="flex items-center gap-2">
                                    {option.label}
                                    {option.value === currentSort && (
                                        <Check className="w-3 h-3" />
                                    )}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </>
    );
}
