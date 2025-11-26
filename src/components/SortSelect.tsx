'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SortOption } from '@/lib/data';

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

    return (
        <div className="hidden md:flex items-center gap-2 text-xs font-medium text-zinc-500">
            <span>Sort by:</span>
            <select
                value={currentSort}
                onChange={(e) => handleSortChange(e.target.value)}
                className="bg-transparent border-none outline-none text-zinc-900 font-semibold cursor-pointer hover:text-zinc-700 focus:ring-0"
            >
                {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
