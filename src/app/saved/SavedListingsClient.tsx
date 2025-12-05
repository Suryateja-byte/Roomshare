'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Heart, Trash2, Search, MapPin, ArrowUpDown } from 'lucide-react';
import { removeSavedListing } from '@/app/actions/saved-listings';
import { toast } from 'sonner';

type SortOption = 'date_saved_desc' | 'date_saved_asc' | 'price_asc' | 'price_desc';

const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'date_saved_desc', label: 'Recently saved' },
    { value: 'date_saved_asc', label: 'Oldest saved' },
    { value: 'price_asc', label: 'Price: Low to High' },
    { value: 'price_desc', label: 'Price: High to Low' }
];

interface SavedListing {
    id: string;
    title: string;
    description: string;
    price: number;
    images?: string[];
    savedAt: Date;
    location?: {
        city: string;
        state: string;
    } | null;
}

interface SavedListingsClientProps {
    initialListings: SavedListing[];
}

export default function SavedListingsClient({ initialListings }: SavedListingsClientProps) {
    const [listings, setListings] = useState<SavedListing[]>(initialListings);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [sortOption, setSortOption] = useState<SortOption>('date_saved_desc');

    const sortedListings = useMemo(() => {
        return [...listings].sort((a, b) => {
            switch (sortOption) {
                case 'price_asc':
                    return a.price - b.price;
                case 'price_desc':
                    return b.price - a.price;
                case 'date_saved_asc':
                    return new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime();
                case 'date_saved_desc':
                default:
                    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
            }
        });
    }, [listings, sortOption]);

    const handleRemove = async (listingId: string) => {
        setRemovingId(listingId);
        try {
            const result = await removeSavedListing(listingId);
            if (result.error) {
                toast.error('Failed to remove listing', {
                    description: result.error,
                });
            } else {
                setListings(prev => prev.filter(l => l.id !== listingId));
                toast.success('Listing removed from saved');
            }
        } catch (error) {
            toast.error('Failed to remove listing', {
                description: 'Please try again later.',
            });
        } finally {
            setRemovingId(null);
        }
    };

    const formatDate = (date: Date) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    return (
        <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 pt-20 pb-20">
            <div className="container mx-auto max-w-6xl px-6 py-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">Saved Listings</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                            {listings.length} {listings.length === 1 ? 'place' : 'places'} saved
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {listings.length > 1 && (
                            <div className="relative">
                                <select
                                    value={sortOption}
                                    onChange={(e) => setSortOption(e.target.value as SortOption)}
                                    className="appearance-none pl-3 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-full text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white cursor-pointer"
                                >
                                    {sortOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <ArrowUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                            </div>
                        )}
                        <Link
                            href="/search"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-full text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                        >
                            <Search className="w-4 h-4" />
                            Find more
                        </Link>
                    </div>
                </div>

                {listings.length === 0 ? (
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm p-12 text-center">
                        <Heart className="w-16 h-16 text-zinc-200 dark:text-zinc-700 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                            No saved listings yet
                        </h3>
                        <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mb-6">
                            When you find a place you like, tap the heart icon to save it here for later.
                        </p>
                        <Link
                            href="/search"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-full font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                        >
                            <Search className="w-4 h-4" />
                            Start exploring
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sortedListings.map((listing) => (
                            <div
                                key={listing.id}
                                className={`bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden group transition-all ${removingId === listing.id ? 'opacity-50 scale-95' : ''
                                    }`}
                            >
                                {/* Image */}
                                <Link href={`/listings/${listing.id}`}>
                                    <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-800">
                                        {listing.images && listing.images.length > 0 ? (
                                            <img
                                                src={listing.images[0]}
                                                alt={listing.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Heart className="w-12 h-12 text-zinc-200 dark:text-zinc-700" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </Link>

                                {/* Content */}
                                <div className="p-4">
                                    <Link href={`/listings/${listing.id}`}>
                                        <h3 className="font-semibold text-zinc-900 dark:text-white line-clamp-1 hover:underline">
                                            {listing.title}
                                        </h3>
                                    </Link>
                                    {listing.location && (
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mt-1">
                                            <MapPin className="w-3 h-3" />
                                            {listing.location.city}, {listing.location.state}
                                        </p>
                                    )}
                                    <div className="flex items-center justify-between mt-3">
                                        <p className="font-semibold text-zinc-900 dark:text-white">
                                            ${listing.price.toLocaleString()}
                                            <span className="text-zinc-400 font-normal text-sm">/mo</span>
                                        </p>
                                        <p className="text-xs text-zinc-400">
                                            Saved {formatDate(listing.savedAt)}
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                        <Link
                                            href={`/listings/${listing.id}`}
                                            className="flex-1 text-center py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                        >
                                            View details
                                        </Link>
                                        <button
                                            onClick={() => handleRemove(listing.id)}
                                            disabled={removingId === listing.id}
                                            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                                            title="Remove from saved"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
