'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { FilterSuggestion } from '@/lib/data';

interface ZeroResultsSuggestionsProps {
    suggestions: FilterSuggestion[];
    query?: string;
}

export default function ZeroResultsSuggestions({ suggestions, query }: ZeroResultsSuggestionsProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleRemoveFilter = (filter: string) => {
        const params = new URLSearchParams(searchParams.toString());

        switch (filter) {
            case 'maxPrice':
                params.delete('maxPrice');
                break;
            case 'minPrice':
                params.delete('minPrice');
                break;
            case 'amenities':
                params.delete('amenities');
                break;
            case 'houseRules':
                params.delete('houseRules');
                break;
            case 'roomType':
                params.delete('roomType');
                break;
            case 'leaseDuration':
                params.delete('leaseDuration');
                break;
            case 'location':
                params.delete('lat');
                params.delete('lng');
                params.delete('minLat');
                params.delete('maxLat');
                params.delete('minLng');
                params.delete('maxLng');
                break;
        }

        // Reset to page 1 when modifying filters
        params.delete('page');

        router.push(`/search?${params.toString()}`);
    };

    const handleClearAll = () => {
        router.push('/search');
    };

    if (suggestions.length === 0) {
        return (
            <div className="text-center py-4">
                <p className="text-zinc-500 text-sm">
                    No listings match your criteria{query ? ` for "${query}"` : ''}.
                </p>
                <p className="text-zinc-400 text-sm mt-1">
                    Try a different location or remove all filters.
                </p>
            </div>
        );
    }

    return (
        <div className="mt-4 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
            <p className="text-sm font-medium text-zinc-700 mb-3">
                Try adjusting your filters:
            </p>
            <ul className="space-y-2">
                {suggestions.slice(0, 3).map((item) => (
                    <li key={item.filter}>
                        <button
                            onClick={() => handleRemoveFilter(item.filter)}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-zinc-200 transition-all group"
                        >
                            <span className="text-sm text-zinc-600 group-hover:text-zinc-900">
                                {item.suggestion}
                            </span>
                            <span className="block text-xs text-zinc-400 mt-0.5">
                                Remove: {item.label}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            {suggestions.length > 3 && (
                <p className="text-xs text-zinc-400 mt-3 text-center">
                    +{suggestions.length - 3} more suggestion{suggestions.length - 3 > 1 ? 's' : ''}
                </p>
            )}
            <div className="mt-4 pt-3 border-t border-zinc-200">
                <button
                    onClick={handleClearAll}
                    className="w-full text-center text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                    Clear all filters
                </button>
            </div>
        </div>
    );
}
