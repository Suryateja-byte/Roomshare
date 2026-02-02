'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Star, Home, Globe, MapPin } from 'lucide-react';
import FavoriteButton from '../FavoriteButton';
import { ImageCarousel } from './ImageCarousel';
import { cn } from '@/lib/utils';
import { getLanguageName } from '@/lib/languages';
import { useListingFocus, useIsListingFocused } from '@/contexts/ListingFocusContext';
import { TrustBadge } from '@/components/ui/TrustBadge';

export interface Listing {
    id: string;
    title: string;
    price: number;
    description: string;
    location: {
        city: string;
        state: string;
    };
    amenities: string[];
    householdLanguages?: string[];
    availableSlots: number;
    images?: string[];
    avgRating?: number;
    reviewCount?: number;
}

// State abbreviation map
const STATE_ABBREVIATIONS: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
};

// Format location to avoid redundancy (e.g., "Irving, TX" not "Irving, TX, TX")
function formatLocation(city: string, state: string): string {
    // Convert state to abbreviation if it's a full name
    const stateAbbr = state.length === 2 ? state.toUpperCase() : (STATE_ABBREVIATIONS[state] || state);

    // Clean city - remove any trailing state abbreviation if it matches
    let cleanCity = city.trim();

    // Check if city already ends with the state abbreviation (e.g., "Irving, TX")
    const cityParts = cleanCity.split(',').map(p => p.trim());
    if (cityParts.length > 1) {
        const lastPart = cityParts[cityParts.length - 1].toUpperCase();
        // If the last part is the same as state or its abbreviation, remove it
        if (lastPart === stateAbbr || lastPart === state.toUpperCase() || STATE_ABBREVIATIONS[lastPart] === stateAbbr) {
            cleanCity = cityParts.slice(0, -1).join(', ');
        }
    }

    return `${cleanCity}, ${stateAbbr}`;
}

// Placeholder images for when listing has no images
const PLACEHOLDER_IMAGES = [
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1484154218962-a1c002085d2f?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1502005229766-528352261b79?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80"
];

// Format price with thousand separators for better readability
function formatPrice(price: number): string {
    // Handle edge cases
    if (price === 0) return 'Free';
    if (price < 0) return '$0';
    if (!Number.isFinite(price)) return '$0';
    // Use locale string for proper formatting with commas
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

interface ListingCardProps {
    listing: Listing;
    isSaved?: boolean;
    className?: string;
    /** Priority loading for LCP optimization - use for above-fold images */
    priority?: boolean;
    /** When true, show total price (price × estimatedMonths) instead of per-month */
    showTotalPrice?: boolean;
    /** Number of months for total price calculation */
    estimatedMonths?: number;
}

export default function ListingCard({ listing, isSaved, className, priority = false, showTotalPrice = false, estimatedMonths = 1 }: ListingCardProps) {
    const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
    const [isDragging, setIsDragging] = useState(false);
    const { setHovered, setActive, focusSource } = useListingFocus();
    const { isHovered, isActive } = useIsListingFocused(listing.id);

    // Track image errors by index
    const handleImageError = useCallback((index: number) => {
        setImageErrors(prev => new Set(prev).add(index));
    }, []);

    // Get valid images (filter out errored ones)
    const validImages = (listing.images || []).filter((_, i) => !imageErrors.has(i));
    const hasValidImages = validImages.length > 0;

    // Fallback to placeholder if no valid images
    const placeholderIndex = listing.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PLACEHOLDER_IMAGES.length;
    const displayImages = hasValidImages ? validImages : [PLACEHOLDER_IMAGES[placeholderIndex]];
    const showImagePlaceholder = !hasValidImages;

    const isAvailable = listing.availableSlots > 0;
    const avgRating = Number.isFinite(listing.avgRating) ? listing.avgRating : null;
    const hasRating = (listing.reviewCount ?? 0) > 0 && avgRating !== null;

    // Fallback for empty/null titles
    const displayTitle = listing.title?.trim() || 'Untitled Listing';

    // Build screen reader label: Price → Rating → Room Type → Location → Badges
    const srParts: string[] = [];
    srParts.push(listing.price === 0 ? 'Free' : `${formatPrice(listing.price)} per month`);
    if (hasRating) {
        srParts.push(`rated ${avgRating!.toFixed(1)} out of 5`);
    } else {
        srParts.push('new listing');
    }
    srParts.push(isAvailable ? `${listing.availableSlots} spot${listing.availableSlots !== 1 ? 's' : ''} available` : 'currently filled');
    srParts.push(formatLocation(listing.location.city, listing.location.state));
    if (listing.amenities.length > 0) {
        srParts.push(listing.amenities.slice(0, 3).join(', '));
    }
    const ariaLabel = `${displayTitle}: ${srParts.join(', ')}`;

    return (
        <div
            role="article"
            aria-label={ariaLabel}
            data-testid="listing-card"
            data-listing-id={listing.id}
            onMouseEnter={() => {
                if (focusSource === "map") return;
                setHovered(listing.id, "list");
            }}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => {
                if (focusSource === "map") return;
                setHovered(listing.id, "list");
            }}
            onBlur={() => setHovered(null)}
            className={cn(
                "relative rounded-xl transition-shadow",
                isActive && "ring-2 ring-blue-500 ring-offset-2",
                isHovered && !isActive && "shadow-md ring-1 ring-blue-200 dark:ring-blue-800",
                className
            )}
        >
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActive(listing.id);
                    }}
                    className="p-1.5 rounded-full bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm shadow-sm hover:bg-white dark:hover:bg-zinc-700 transition-colors"
                    aria-label="Show on map"
                    title="Show on map"
                >
                    <MapPin className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
                </button>
                <FavoriteButton listingId={listing.id} initialIsSaved={isSaved} />
            </div>
            <Link
                href={`/listings/${listing.id}`}
                onClick={isDragging ? (e) => e.preventDefault() : undefined}
                className={cn(
                    "block group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 rounded-none sm:rounded-xl",
                    isDragging && "pointer-events-none"
                )}
            >
                <div className="relative bg-white dark:bg-zinc-900 flex flex-col rounded-none sm:rounded-xl border border-zinc-200/60 dark:border-zinc-800 overflow-hidden transition-all duration-normal hover:-translate-y-0.5 hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700">
                {/* Image Area */}
                <div className="relative aspect-[16/10] sm:aspect-[4/3] overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    {/* Image Carousel or single image */}
                    <ImageCarousel
                        images={displayImages}
                        alt={displayTitle}
                        priority={priority}
                        className="h-full w-full group-hover:scale-105 transition-transform duration-normal ease-out"
                        onImageError={handleImageError}
                        onDragStateChange={setIsDragging}
                    />

                    {/* Empty state overlay - Intentional waiting state */}
                    {showImagePlaceholder && (
                        <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-150 dark:from-zinc-800 dark:to-zinc-850 flex flex-col items-center justify-center pointer-events-none">
                            <div className="w-14 h-14 rounded-2xl bg-zinc-200/80 dark:bg-zinc-700/80 flex items-center justify-center mb-2">
                                <Home className="w-7 h-7 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} fill="currentColor" fillOpacity={0.1} />
                            </div>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wider">No Photos</span>
                        </div>
                    )}

                    {/* Badges — top-left stack */}
                    <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5">
                        <span className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-md text-2xs font-bold uppercase tracking-wide shadow-sm",
                            isAvailable
                                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-black/5'
                                : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                        )}>
                            {isAvailable ? 'Available' : 'Filled'}
                        </span>
                        <TrustBadge avgRating={listing.avgRating} reviewCount={listing.reviewCount} />
                    </div>
                </div>

                {/* Content Area - min-h-[156px] prevents CLS from conditional languages section */}
                <div className="flex flex-col flex-1 p-3 sm:p-4 min-h-[156px]">
                    {/* Title Row with Rating */}
                    <div className="flex justify-between items-start gap-3 mb-0.5">
                        <h3 className="font-semibold text-sm text-zinc-900 dark:text-white line-clamp-1 leading-snug" title={displayTitle}>
                            {displayTitle}
                        </h3>
                        {hasRating ? (
                            <div className="flex items-center gap-1 flex-shrink-0" aria-label={`Rating ${avgRating!.toFixed(1)} out of 5`}>
                                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">{avgRating!.toFixed(1)}</span>
                            </div>
                        ) : (
                            <span className="text-2xs uppercase font-bold text-zinc-400 dark:text-zinc-500 flex-shrink-0 tracking-wide">New</span>
                        )}
                    </div>

                    {/* Location - Tight spacing with title */}
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
                        {formatLocation(listing.location.city, listing.location.state)}
                    </p>

                    {/* Amenities */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {listing.amenities.slice(0, 3).map((amenity) => (
                            <span key={amenity} className="text-2xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded font-medium border border-zinc-200 dark:border-zinc-700">
                                {amenity}
                            </span>
                        ))}
                    </div>

                    {/* Languages spoken */}
                    {listing.householdLanguages && listing.householdLanguages.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-4">
                            <Globe className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                            {listing.householdLanguages.slice(0, 2).map((code) => (
                                <span key={code} className="text-2xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-medium">
                                    {getLanguageName(code)}
                                </span>
                            ))}
                            {listing.householdLanguages.length > 2 && (
                                <span className="text-2xs text-zinc-400 dark:text-zinc-500">+{listing.householdLanguages.length - 2}</span>
                            )}
                        </div>
                    )}

                    {/* Price Row */}
                    <div className="mt-auto">
                        <div className="flex items-baseline">
                            {showTotalPrice && estimatedMonths > 1 ? (
                                <>
                                    <span className="font-bold text-xl text-zinc-900 dark:text-white tracking-tight">{formatPrice(listing.price * estimatedMonths)}</span>
                                    <span className="text-zinc-400 dark:text-zinc-500 text-sm ml-0.5">total</span>
                                    <span className="text-zinc-400 dark:text-zinc-500 text-xs ml-1.5">({formatPrice(listing.price)}/mo × {estimatedMonths})</span>
                                </>
                            ) : (
                                <>
                                    <span className="font-bold text-xl text-zinc-900 dark:text-white tracking-tight">{formatPrice(listing.price)}</span>
                                    {listing.price > 0 && <span className="text-zinc-400 dark:text-zinc-500 text-sm ml-0.5">/mo</span>}
                                </>
                            )}
                        </div>
                    </div>
                </div>
                </div>
            </Link>
        </div>
    );
}
