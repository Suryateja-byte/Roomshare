'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, Wifi, Bed, Home } from 'lucide-react';

interface ListingCardProps {
    listing: {
        id: string;
        title: string;
        price: number;
        availableSlots: number;
        images?: string[];
        amenities?: string[];
    };
    className?: string;
}

// Placeholder images
const PLACEHOLDER_IMAGES = [
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1484154218962-a1c002085d2f?auto=format&fit=crop&w=800&q=80",
];

export default function ListingCard({ listing, className = '' }: ListingCardProps) {
    const [imageError, setImageError] = useState(false);

    // Use actual listing images or placeholder
    const hasImage = listing.images && listing.images.length > 0 && listing.images[0];
    const placeholderIndex = listing.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PLACEHOLDER_IMAGES.length;
    const imageUrl = hasImage && !imageError ? listing.images![0] : PLACEHOLDER_IMAGES[placeholderIndex];
    const showPlaceholder = !hasImage || imageError;

    const isAvailable = listing.availableSlots > 0;

    return (
        <Link href={`/listings/${listing.id}`} className={`block group focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 rounded-xl ${className}`}>
            <div className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden border border-zinc-200/60 dark:border-zinc-800 h-full flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.4)] hover:border-zinc-300 dark:hover:border-zinc-700">
                {/* Image Container */}
                <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    <img
                        src={imageUrl}
                        alt={listing.title}
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500 ease-out"
                        loading="lazy"
                        onError={() => setImageError(true)}
                    />
                    {/* Empty state overlay - Intentional waiting state */}
                    {showPlaceholder && (
                        <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-150 dark:from-zinc-800 dark:to-zinc-850 flex flex-col items-center justify-center">
                            <div className="w-14 h-14 rounded-2xl bg-zinc-200/80 dark:bg-zinc-700/80 flex items-center justify-center mb-2">
                                <Home className="w-7 h-7 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} fill="currentColor" fillOpacity={0.1} />
                            </div>
                            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wider">No Photos</span>
                        </div>
                    )}
                    {/* Availability Badge - Solid style for contrast */}
                    <div className="absolute top-3 left-3 z-10">
                        <span className={`
                            inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide
                            shadow-sm
                            ${isAvailable
                                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-black/5'
                                : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                            }
                        `}>
                            {listing.availableSlots} {listing.availableSlots === 1 ? 'spot' : 'spots'} left
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                    <div className="flex justify-between items-start gap-3 mb-3">
                        <h3 className="font-semibold text-[15px] leading-snug text-zinc-900 dark:text-white line-clamp-1">
                            {listing.title}
                        </h3>
                        <div className="flex items-baseline gap-0.5 flex-shrink-0">
                            <span className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">${listing.price}</span>
                            <span className="text-zinc-400 text-sm">/mo</span>
                        </div>
                    </div>

                    {/* Amenities / Info */}
                    <div className="mt-auto">
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 text-[12px]">
                                <Users className="w-3.5 h-3.5" />
                                <span>Shared</span>
                            </div>
                            {listing.amenities && listing.amenities.length > 0 && (
                                <>
                                    {listing.amenities.slice(0, 2).map((amenity, i) => (
                                        <div key={i} className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 text-[12px]">
                                            {amenity.toLowerCase().includes('wifi') ? <Wifi className="w-3.5 h-3.5" /> :
                                                amenity.toLowerCase().includes('bed') ? <Bed className="w-3.5 h-3.5" /> :
                                                    <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 mx-0.5"></span>}
                                            <span className="truncate max-w-[60px]">{amenity}</span>
                                        </div>
                                    ))}
                                    {listing.amenities.length > 2 && (
                                        <span className="text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded font-medium">+{listing.amenities.length - 2}</span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
