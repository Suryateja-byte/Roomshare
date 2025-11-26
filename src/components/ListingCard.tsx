import Link from 'next/link';
import { Heart, Star } from 'lucide-react';
import FavoriteButton from './FavoriteButton';

interface Listing {
    id: string;
    title: string;
    price: number;
    description: string;
    location: {
        city: string;
        state: string;
    };
    amenities: string[];
    availableSlots: number;
}

export default function ListingCard({ listing, isSaved }: { listing: Listing, isSaved?: boolean }) {
    return (
        <Link
            href={`/listings/${listing.id}`}
            className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 rounded-2xl"
        >
            <div className="relative bg-white flex flex-col rounded-2xl border border-zinc-100 hover:shadow-xl hover:shadow-zinc-200/50 hover:border-zinc-200 overflow-hidden transition-all duration-300">
                {/* Placeholder Image Area */}
                <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100 ">
                    <div className="w-full h-full bg-gradient-to-br from-zinc-100 to-zinc-200 group-hover:scale-105 transition-transform duration-700 ease-out" />

                    {/* Overlay Controls */}
                    <div className="absolute top-3 right-3 z-10">
                        <FavoriteButton listingId={listing.id} initialIsSaved={isSaved} />
                    </div>

                    {/* Badge - touch-friendly size */}
                    <div className="absolute bottom-3 left-3">
                        <div className="px-2.5 py-1.5 rounded-lg bg-white/90 backdrop-blur-sm text-xs font-semibold text-zinc-900 shadow-sm">
                            {listing.availableSlots > 0 ? 'Available' : 'Filled'}
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex flex-col flex-1 p-4 sm:p-5">
                    <div className="flex justify-between items-start gap-2 mb-1">
                        <h3 className="font-semibold text-base sm:text-lg text-zinc-900 line-clamp-1" title={listing.title}>
                            {listing.title}
                        </h3>
                        <div className="flex items-center gap-1 flex-shrink-0" aria-label="Rating 4.9 out of 5">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            <span className="text-sm text-zinc-700 font-medium">4.9</span>
                        </div>
                    </div>

                    <p className="mb-3 sm:mb-4 text-sm text-zinc-500 font-light">
                        {listing.location.city}, {listing.location.state}
                    </p>

                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                        {listing.amenities.slice(0, 3).map((amenity, i) => (
                            <span key={i} className="text-xs bg-zinc-50 text-zinc-600 px-2 py-1 rounded-md font-medium">
                                {amenity}
                            </span>
                        ))}
                    </div>

                    <div className="mt-auto flex items-center justify-between">
                        <div className="flex items-baseline gap-1">
                            <span className="font-bold text-lg sm:text-xl text-zinc-900 ">
                                ${listing.price}
                            </span>
                            <span className="text-zinc-400 text-sm font-light">/mo</span>
                        </div>

                        {/* View button - always visible on mobile, hover on desktop */}
                        <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 md:transform md:translate-y-2 md:group-hover:translate-y-0">
                            <span className="inline-flex items-center justify-center h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm bg-zinc-900 text-white rounded-full hover:bg-zinc-800 transition-colors font-medium">
                                View
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
