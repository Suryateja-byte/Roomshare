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
    languages?: string[];
    genderPreference?: string;
    householdGender?: string;
    lat?: number;
    lng?: number;
    minLat?: number;
    maxLat?: number;
    minLng?: number;
    maxLng?: number;
    sort?: string;
    city?: string;
}

// Build search URL from filters
export function buildSearchUrl(filters: SearchFilters): string {
    const params = new URLSearchParams();

    if (filters.query) params.set('q', filters.query);
    if (filters.minPrice !== undefined) params.set('minPrice', filters.minPrice.toString());
    if (filters.maxPrice !== undefined) params.set('maxPrice', filters.maxPrice.toString());
    if (filters.amenities?.length) filters.amenities.forEach((amenity) => params.append('amenities', amenity));
    if (filters.moveInDate) params.set('moveInDate', filters.moveInDate);
    if (filters.leaseDuration) params.set('leaseDuration', filters.leaseDuration);
    if (filters.houseRules?.length) filters.houseRules.forEach((rule) => params.append('houseRules', rule));
    if (filters.roomType) params.set('roomType', filters.roomType);
    if (filters.languages?.length) filters.languages.forEach((language) => params.append('languages', language));
    if (filters.genderPreference) params.set('genderPreference', filters.genderPreference);
    if (filters.householdGender) params.set('householdGender', filters.householdGender);
    if (filters.sort) params.set('sort', filters.sort);
    if (typeof filters.lat === 'number' && Number.isFinite(filters.lat)) params.set('lat', filters.lat.toString());
    if (typeof filters.lng === 'number' && Number.isFinite(filters.lng)) params.set('lng', filters.lng.toString());
    if (typeof filters.minLat === 'number' && Number.isFinite(filters.minLat)) params.set('minLat', filters.minLat.toString());
    if (typeof filters.maxLat === 'number' && Number.isFinite(filters.maxLat)) params.set('maxLat', filters.maxLat.toString());
    if (typeof filters.minLng === 'number' && Number.isFinite(filters.minLng)) params.set('minLng', filters.minLng.toString());
    if (typeof filters.maxLng === 'number' && Number.isFinite(filters.maxLng)) params.set('maxLng', filters.maxLng.toString());

    return `/search?${params.toString()}`;
}
