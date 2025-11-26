// Search utility functions and types (client-safe)

export interface SearchFilters {
    query?: string;
    minPrice?: number;
    maxPrice?: number;
    amenities?: string[];
    moveInDate?: string;
    leaseDuration?: string;
    houseRules?: string[];
    roomType?: string;
    city?: string;
}

// Build search URL from filters
export function buildSearchUrl(filters: SearchFilters): string {
    const params = new URLSearchParams();

    if (filters.query) params.set('q', filters.query);
    if (filters.minPrice) params.set('minPrice', filters.minPrice.toString());
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice.toString());
    if (filters.amenities?.length) params.set('amenities', filters.amenities.join(','));
    if (filters.moveInDate) params.set('moveInDate', filters.moveInDate);
    if (filters.leaseDuration) params.set('leaseDuration', filters.leaseDuration);
    if (filters.houseRules?.length) params.set('houseRules', filters.houseRules.join(','));
    if (filters.roomType) params.set('roomType', filters.roomType);

    return `/search?${params.toString()}`;
}
