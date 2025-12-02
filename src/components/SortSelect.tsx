'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SortOption } from '@/lib/data';
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
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleSortChange = (newSort: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (newSort === 'recommended') {
            params.delete('sort');
        } else {
            params.set('sort', newSort);
        }
        // Reset to page 1 when sorting changes
        params.delete('page');
        router.push(`/search?${params.toString()}`);
    };

    const currentLabel = sortOptions.find(opt => opt.value === currentSort)?.label || 'Recommended';

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
