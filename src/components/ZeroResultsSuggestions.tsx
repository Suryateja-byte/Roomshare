'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, MapPin, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
            <div className="flex flex-col items-center justify-center py-12 px-4">
                {/* Empty state illustration */}
                <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-6">
                    <Search className="w-10 h-10 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
                </div>

                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                    No listings found
                </h3>

                <p className="text-zinc-500 dark:text-zinc-400 text-center max-w-sm mb-6">
                    {query
                        ? `We couldn't find any listings matching "${query}".`
                        : "We couldn't find any listings matching your criteria."
                    }
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                        variant="outline"
                        onClick={handleClearAll}
                        className="gap-2"
                    >
                        <X className="w-4 h-4" />
                        Clear filters
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => router.push('/search')}
                        className="gap-2"
                    >
                        <MapPin className="w-4 h-4" />
                        Browse all
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="py-8 px-4">
            {/* Header with illustration */}
            <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                    <SlidersHorizontal className="w-8 h-8 text-amber-500 dark:text-amber-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">
                    No exact matches
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Try adjusting your filters to see more results
                </p>
            </div>

            {/* Suggestions */}
            <div className="max-w-sm mx-auto space-y-2">
                {suggestions.slice(0, 3).map((item) => (
                    <button
                        key={item.filter}
                        onClick={() => handleRemoveFilter(item.filter)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm transition-all group"
                    >
                        <div className="text-left">
                            <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white block">
                                {item.suggestion}
                            </span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                Remove: {item.label}
                            </span>
                        </div>
                        <X className="w-4 h-4 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 flex-shrink-0" />
                    </button>
                ))}

                {suggestions.length > 3 && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center pt-2">
                        +{suggestions.length - 3} more suggestion{suggestions.length - 3 > 1 ? 's' : ''}
                    </p>
                )}
            </div>

            {/* Clear all button */}
            <div className="flex justify-center mt-6">
                <Button
                    variant="ghost"
                    onClick={handleClearAll}
                    className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                >
                    Clear all filters
                </Button>
            </div>
        </div>
    );
}
