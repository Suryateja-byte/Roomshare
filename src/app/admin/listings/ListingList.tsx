'use client';

import { useState } from 'react';
import { updateListingStatus, deleteListing } from '@/app/actions/admin';
import {
    Search,
    Loader2,
    Eye,
    MapPin,
    DollarSign,
    Flag,
    Calendar,
    Trash2,
    Play,
    Pause,
    CheckCircle,
    MoreVertical,
    ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

type ListingStatus = 'ACTIVE' | 'PAUSED' | 'RENTED';

interface Listing {
    id: string;
    title: string;
    price: number;
    status: ListingStatus;
    images: string[];
    viewCount: number;
    createdAt: Date;
    owner: {
        id: string;
        name: string | null;
        email: string | null;
    };
    location: {
        city: string;
        state: string;
    } | null;
    _count: {
        reports: number;
        bookings: number;
    };
}

interface ListingListProps {
    initialListings: Listing[];
    totalListings: number;
}

const statusConfig = {
    ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Play },
    PAUSED: { label: 'Paused', color: 'bg-amber-100 text-amber-700', icon: Pause },
    RENTED: { label: 'Rented', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
};

export default function ListingList({ initialListings, totalListings }: ListingListProps) {
    const [listings, setListings] = useState(initialListings);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | ListingStatus>('all');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const handleStatusChange = async (listingId: string, newStatus: ListingStatus) => {
        setProcessingId(listingId);
        try {
            const result = await updateListingStatus(listingId, newStatus);
            if (result.success) {
                setListings(prev =>
                    prev.map(l =>
                        l.id === listingId ? { ...l, status: newStatus } : l
                    )
                );
            } else if (result.error) {
                alert(result.error);
            }
        } catch (error) {
            console.error('Error updating status:', error);
        } finally {
            setProcessingId(null);
            setOpenMenuId(null);
        }
    };

    const handleDelete = async (listingId: string) => {
        setProcessingId(listingId);
        try {
            const result = await deleteListing(listingId);
            if (result.success) {
                setListings(prev => prev.filter(l => l.id !== listingId));
            } else if (result.error) {
                alert(result.error);
            }
        } catch (error) {
            console.error('Error deleting listing:', error);
        } finally {
            setProcessingId(null);
            setDeleteConfirmId(null);
        }
    };

    const filteredListings = listings.filter(listing => {
        // Search filter
        if (search) {
            const searchLower = search.toLowerCase();
            if (
                !listing.title.toLowerCase().includes(searchLower) &&
                !listing.owner.name?.toLowerCase().includes(searchLower) &&
                !listing.owner.email?.toLowerCase().includes(searchLower)
            ) {
                return false;
            }
        }

        // Status filter
        if (statusFilter !== 'all') {
            return listing.status === statusFilter;
        }
        return true;
    });

    return (
        <div>
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by title or owner..."
                        className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                </div>
                <div className="flex gap-2">
                    {(['all', 'ACTIVE', 'PAUSED', 'RENTED'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setStatusFilter(f)}
                            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                                statusFilter === f
                                    ? 'bg-zinc-900 text-white'
                                    : 'bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-200'
                            }`}
                        >
                            {f === 'all' ? 'All' : statusConfig[f].label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats */}
            <div className="mb-4 text-sm text-zinc-500">
                Showing {filteredListings.length} of {totalListings} listings
            </div>

            {/* Listings Grid */}
            {filteredListings.length === 0 ? (
                <div className="bg-white rounded-xl border border-zinc-100 p-12 text-center text-zinc-500">
                    No listings found matching your criteria
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredListings.map((listing) => {
                        const StatusIcon = statusConfig[listing.status].icon;

                        return (
                            <div
                                key={listing.id}
                                className={`bg-white rounded-xl border overflow-hidden ${
                                    listing._count.reports > 0 ? 'border-red-200' : 'border-zinc-100'
                                }`}
                            >
                                <div className="p-4 flex gap-4">
                                    {/* Thumbnail */}
                                    <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-100">
                                        {listing.images[0] ? (
                                            <Image
                                                src={listing.images[0]}
                                                alt={listing.title}
                                                fill
                                                className="object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-400">
                                                No image
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-zinc-900 truncate">
                                                        {listing.title}
                                                    </h3>
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${statusConfig[listing.status].color}`}>
                                                        <StatusIcon className="w-3 h-3" />
                                                        {statusConfig[listing.status].label}
                                                    </span>
                                                    {listing._count.reports > 0 && (
                                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium flex items-center gap-1">
                                                            <Flag className="w-3 h-3" />
                                                            {listing._count.reports} reports
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
                                                    {listing.location && (
                                                        <span className="flex items-center gap-1">
                                                            <MapPin className="w-3 h-3" />
                                                            {listing.location.city}, {listing.location.state}
                                                        </span>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        <DollarSign className="w-3 h-3" />
                                                        ${listing.price}/mo
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Eye className="w-3 h-3" />
                                                        {listing.viewCount} views
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" />
                                                        {listing._count.bookings} bookings
                                                    </span>
                                                </div>
                                                <p className="text-xs text-zinc-400 mt-1">
                                                    Owner: {listing.owner.name || 'Unknown'} ({listing.owner.email})
                                                </p>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={`/listings/${listing.id}`}
                                                    target="_blank"
                                                    className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-zinc-700"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </Link>

                                                <div className="relative">
                                                    <button
                                                        onClick={() => setOpenMenuId(openMenuId === listing.id ? null : listing.id)}
                                                        className="p-2 hover:bg-zinc-100 rounded-lg"
                                                    >
                                                        <MoreVertical className="w-5 h-5 text-zinc-400" />
                                                    </button>

                                                    {openMenuId === listing.id && (
                                                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-10">
                                                            {listing.status !== 'ACTIVE' && (
                                                                <button
                                                                    onClick={() => handleStatusChange(listing.id, 'ACTIVE')}
                                                                    disabled={processingId === listing.id}
                                                                    className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2 disabled:opacity-50"
                                                                >
                                                                    {processingId === listing.id ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                                    ) : (
                                                                        <Play className="w-4 h-4 text-green-500" />
                                                                    )}
                                                                    Set Active
                                                                </button>
                                                            )}
                                                            {listing.status !== 'PAUSED' && (
                                                                <button
                                                                    onClick={() => handleStatusChange(listing.id, 'PAUSED')}
                                                                    disabled={processingId === listing.id}
                                                                    className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2 disabled:opacity-50"
                                                                >
                                                                    {processingId === listing.id ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                                    ) : (
                                                                        <Pause className="w-4 h-4 text-amber-500" />
                                                                    )}
                                                                    Set Paused
                                                                </button>
                                                            )}
                                                            {listing.status !== 'RENTED' && (
                                                                <button
                                                                    onClick={() => handleStatusChange(listing.id, 'RENTED')}
                                                                    disabled={processingId === listing.id}
                                                                    className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2 disabled:opacity-50"
                                                                >
                                                                    {processingId === listing.id ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                                    ) : (
                                                                        <CheckCircle className="w-4 h-4 text-blue-500" />
                                                                    )}
                                                                    Set Rented
                                                                </button>
                                                            )}
                                                            <hr className="my-1" />
                                                            <button
                                                                onClick={() => {
                                                                    setOpenMenuId(null);
                                                                    setDeleteConfirmId(listing.id);
                                                                }}
                                                                className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                                Delete Listing
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Delete Confirmation */}
                                {deleteConfirmId === listing.id && (
                                    <div className="p-4 bg-red-50 border-t border-red-100">
                                        <p className="text-sm text-red-700 mb-3">
                                            Are you sure you want to delete this listing? This action cannot be undone.
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleDelete(listing.id)}
                                                disabled={processingId === listing.id}
                                                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                                            >
                                                {processingId === listing.id && (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                )}
                                                Delete Forever
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirmId(null)}
                                                className="px-4 py-2 bg-white text-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-50 border border-zinc-200"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
