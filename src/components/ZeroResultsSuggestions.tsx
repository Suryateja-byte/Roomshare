'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, MapPin, SlidersHorizontal, Navigation } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { FilterSuggestion } from '@/lib/data';
import { LAT_OFFSET_DEGREES } from '@/lib/constants';

/**
 * Nearby area suggestions for zero-result searches.
 * Shown when user searched a specific location that returned nothing.
 */
const NEARBY_SUGGESTIONS: Record<string, string[]> = {
    // Fallback suggestions shown when no location-specific ones match
    _default: ['Austin, TX', 'San Francisco, CA', 'New York, NY', 'Los Angeles, CA'],
};

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
                // Expand current search area instead of dropping location entirely.
                // This keeps query + location valid and avoids bounds-required redirects.
                {
                    const normalizeLng360 = (value: number) => ((value % 360) + 360) % 360;
                    const toSignedLng = (value: number) => (value > 180 ? value - 360 : value);

                    const minLat = parseFloat(params.get('minLat') ?? '');
                    const maxLat = parseFloat(params.get('maxLat') ?? '');
                    const minLng = parseFloat(params.get('minLng') ?? '');
                    const maxLng = parseFloat(params.get('maxLng') ?? '');
                    const hasExplicitBounds =
                        Number.isFinite(minLat) &&
                        Number.isFinite(maxLat) &&
                        Number.isFinite(minLng) &&
                        Number.isFinite(maxLng) &&
                        minLat <= maxLat;

                    if (hasExplicitBounds) {
                        const latCenter = (minLat + maxLat) / 2;
                        const latSpan = Math.max(0.02, maxLat - minLat);
                        const expandedLatSpan = latSpan * 1.75;

                        // Handle both normal bounds and antimeridian-crossing bounds.
                        const crossesAntimeridian = minLng > maxLng;
                        const normalizedMin = normalizeLng360(minLng);
                        let normalizedMax = normalizeLng360(maxLng);
                        if (crossesAntimeridian) {
                            normalizedMax += 360;
                        }
                        const rawLngSpan = Math.max(0.02, normalizedMax - normalizedMin);
                        const expandedLngSpan = Math.min(359.9, rawLngSpan * 1.75);
                        const lngCenterNormalized = normalizedMin + (normalizedMax - normalizedMin) / 2;
                        const lngHalfSpan = expandedLngSpan / 2;
                        const expandedMinLng = toSignedLng(
                            normalizeLng360(lngCenterNormalized - lngHalfSpan)
                        );
                        const expandedMaxLng = toSignedLng(
                            normalizeLng360(lngCenterNormalized + lngHalfSpan)
                        );

                        params.set('minLat', Math.max(-90, latCenter - expandedLatSpan / 2).toString());
                        params.set('maxLat', Math.min(90, latCenter + expandedLatSpan / 2).toString());
                        params.set('minLng', expandedMinLng.toString());
                        params.set('maxLng', expandedMaxLng.toString());
                        params.delete('lat');
                        params.delete('lng');
                        break;
                    }

                    const lat = parseFloat(params.get('lat') ?? '');
                    const lng = parseFloat(params.get('lng') ?? '');
                    const hasPointCoords =
                        Number.isFinite(lat) &&
                        Number.isFinite(lng) &&
                        lat >= -90 &&
                        lat <= 90 &&
                        lng >= -180 &&
                        lng <= 180;

                    if (hasPointCoords) {
                        const expandedLatOffset = LAT_OFFSET_DEGREES * 2;
                        const cosLat = Math.cos((lat * Math.PI) / 180);
                        const lngOffset = cosLat < 0.01 ? 180 : expandedLatOffset / cosLat;

                        params.set('minLat', Math.max(-90, lat - expandedLatOffset).toString());
                        params.set('maxLat', Math.min(90, lat + expandedLatOffset).toString());
                        params.set('minLng', Math.max(-180, lng - lngOffset).toString());
                        params.set('maxLng', Math.min(180, lng + lngOffset).toString());
                        params.delete('lat');
                        params.delete('lng');
                        break;
                    }

                    // Last-resort fallback: avoid invalid q-without-bounds state.
                    params.delete('q');
                    params.delete('lat');
                    params.delete('lng');
                    params.delete('minLat');
                    params.delete('maxLat');
                    params.delete('minLng');
                    params.delete('maxLng');
                }
                break;
        }

        // Reset to page 1 when modifying filters
        params.delete('page');
        params.delete('cursor');
        params.delete('cursorStack');
        params.delete('pageNumber');

        router.push(`/search?${params.toString()}`);
    };

    const handleClearAll = () => {
        const params = new URLSearchParams();
        for (const key of ['q', 'lat', 'lng', 'minLat', 'maxLat', 'minLng', 'maxLng', 'sort'] as const) {
            const value = searchParams.get(key);
            if (value) params.set(key, value);
        }
        const qs = params.toString();
        router.push(`/search${qs ? `?${qs}` : ''}`);
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
                        onClick={handleClearAll}
                        className="gap-2"
                    >
                        <MapPin className="w-4 h-4" />
                        Browse all
                    </Button>
                </div>

                {/* Nearby area suggestions */}
                <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-700 w-full max-w-sm">
                    <div className="flex items-center gap-2 mb-3">
                        <Navigation className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                            Try a different area
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {NEARBY_SUGGESTIONS._default.map((area) => (
                            <Link
                                key={area}
                                href={`/search?q=${encodeURIComponent(area)}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 transition-colors"
                            >
                                <MapPin className="w-3 h-3" />
                                {area}
                            </Link>
                        ))}
                    </div>
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

            {/* Nearby area suggestions */}
            {query && (
                <div className="max-w-sm mx-auto mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-2 mb-2">
                        <Navigation className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                            Try a different area
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {NEARBY_SUGGESTIONS._default
                            .filter((area) => area.toLowerCase() !== query.toLowerCase())
                            .slice(0, 3)
                            .map((area) => (
                                <Link
                                    key={area}
                                    href={`/search?q=${encodeURIComponent(area)}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs text-zinc-500 dark:text-zinc-400 transition-colors"
                                >
                                    <MapPin className="w-3 h-3" />
                                    {area}
                                </Link>
                            ))}
                    </div>
                </div>
            )}

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
