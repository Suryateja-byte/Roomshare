'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import {
    MapPin,
    ShieldCheck,
    Edit,
    Maximize2,
    Eye,
    Users,
    Bed,
    ChevronRight,
    Star,
    Zap,
    Heart,
    Pencil,
    Trash2,
    ExternalLink,
    type LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getAmenityIcon } from '@/lib/amenityIcons';
import { getLanguageName } from '@/lib/languages';

// Import existing functional components
import ImageGallery from '@/components/ImageGallery';
import BookingForm from '@/components/BookingForm';
import ReviewForm from '@/components/ReviewForm';
import ReviewList from '@/components/ReviewList';
import ContactHostButton from '@/components/ContactHostButton';
import DeleteListingButton from '@/components/DeleteListingButton';
import ReportButton from '@/components/ReportButton';
import ShareListingButton from '@/components/ShareListingButton';
import SaveListingButton from '@/components/SaveListingButton';
import ListingStatusToggle from '@/components/ListingStatusToggle';
import ListingFreshnessCheck from '@/components/ListingFreshnessCheck';
import UserAvatar from '@/components/UserAvatar';
import VerifiedBadge from '@/components/verification/VerifiedBadge';
import RoomPlaceholder from '@/components/listings/RoomPlaceholder';

// Lazy-load NeighborhoodChat to avoid loading framer-motion + AI SDK on initial page load
// This defers ~200KB+ of JS until after the page is interactive
const NeighborhoodChat = dynamic(() => import('@/components/NeighborhoodChat'), {
    ssr: false,
    loading: () => null, // Chat widget appears after load, no placeholder needed
});

// Lazy-load NearbyPlacesSection (MapLibre GL + Radar) to avoid loading ~150KB+ on initial page load
const NearbyPlacesSection = dynamic(() => import('@/components/nearby/NearbyPlacesSection'), {
    ssr: false,
    loading: () => (
        <div className="mt-8 pt-8 border-t border-zinc-200">
            <div className="animate-pulse space-y-4">
                <div className="h-6 bg-zinc-200 rounded w-40" />
                <div className="h-[400px] bg-zinc-100 rounded-lg" />
            </div>
        </div>
    ),
});

// Types
interface Review {
    id: string;
    rating: number;
    comment: string;
    createdAt: Date;
    author: {
        id: string;
        name: string | null;
        image: string | null;
    };
}

interface BookedDateRange {
    startDate: string;
    endDate: string;
}

interface ListingPageClientProps {
    listing: {
        id: string;
        title: string;
        description: string;
        price: number;
        images: string[];
        amenities: string[];
        householdLanguages: string[];
        totalSlots: number;
        availableSlots: number;
        status: string;
        viewCount: number;
        genderPreference: string | null;
        householdGender: string | null;
        location: {
            city: string;
            state: string;
        } | null;
        owner: {
            id: string;
            name: string | null;
            image: string | null;
            bio: string | null;
            isVerified: boolean;
            createdAt: Date;
        };
        ownerId: string;
    };
    reviews: Review[];
    isOwner: boolean;
    isLoggedIn: boolean;
    userHasBooking: boolean;
    userExistingReview: {
        id: string;
        rating: number;
        comment: string;
        createdAt: string;
    } | null;
    bookedDates: BookedDateRange[];
    coordinates: { lat: number; lng: number } | null;
}

// Status badge with pulse animation
function StatusBadge({ status }: { status: string }) {
    const config = {
        ACTIVE: {
            bg: 'bg-green-50 dark:bg-green-900/20',
            border: 'border-green-100 dark:border-green-900/30',
            text: 'text-green-700 dark:text-green-400',
            dot: 'bg-green-600 dark:bg-green-500',
            label: 'Active Listing'
        },
        PAUSED: {
            bg: 'bg-yellow-50 dark:bg-yellow-900/20',
            border: 'border-yellow-100 dark:border-yellow-900/30',
            text: 'text-yellow-700 dark:text-yellow-400',
            dot: 'bg-yellow-600 dark:bg-yellow-500',
            label: 'Paused'
        },
        RENTED: {
            bg: 'bg-blue-50 dark:bg-blue-900/20',
            border: 'border-blue-100 dark:border-blue-900/30',
            text: 'text-blue-700 dark:text-blue-400',
            dot: 'bg-blue-600 dark:bg-blue-500',
            label: 'Rented'
        }
    }[status] || {
        bg: 'bg-zinc-50 dark:bg-zinc-800',
        border: 'border-zinc-200 dark:border-zinc-700',
        text: 'text-zinc-600 dark:text-zinc-400',
        dot: 'bg-zinc-500',
        label: status
    };

    return (
        <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border",
            config.bg, config.border, config.text
        )}>
            <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", config.dot)} />
            {config.label}
        </div>
    );
}

// Simple info stat item for the stats bar
function InfoStat({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
    return (
        <div className="flex items-center text-zinc-600 dark:text-zinc-400 font-medium text-sm">
            <Icon className="w-4 h-4 mr-2 text-zinc-400 dark:text-zinc-500" />
            {children}
        </div>
    );
}

// Stat card for management sidebar
function StatCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="bg-zinc-50 dark:bg-zinc-800 p-3 rounded-xl border border-zinc-100 dark:border-zinc-700 text-center">
            <span className="block text-2xl font-bold text-zinc-900 dark:text-white">{value}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{label}</span>
        </div>
    );
}

export default function ListingPageClient({
    listing,
    reviews,
    isOwner,
    isLoggedIn,
    userHasBooking,
    userExistingReview,
    bookedDates,
    coordinates
}: ListingPageClientProps) {
    const hasImages = listing.images && listing.images.length > 0;

    // Format gender preference for display
    const formatGenderPreference = (pref: string | null) => {
        if (!pref) return null;
        switch (pref) {
            case 'MALE_ONLY': return 'Male Identifying Only';
            case 'FEMALE_ONLY': return 'Female Identifying Only';
            case 'NO_PREFERENCE': return 'Any Gender / All Welcome';
            default: return pref;
        }
    };

    // Format household gender for display
    const formatHouseholdGender = (gender: string | null) => {
        if (!gender) return null;
        switch (gender) {
            case 'ALL_MALE': return 'All Male';
            case 'ALL_FEMALE': return 'All Female';
            case 'MIXED': return 'Mixed (Co-ed)';
            default: return gender;
        }
    };

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Real-time freshness check for non-owners */}
            {!isOwner && <ListingFreshnessCheck listingId={listing.id} />}

            <main className="pt-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

                    {/* Breadcrumbs & Title Header */}
                    <div className="flex justify-between items-end mb-6">
                        <div className="flex flex-col gap-1">
                            {/* Breadcrumb */}
                            <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 font-medium mb-1">
                                <span>{listing.location?.city || 'Location'}</span>
                                <ChevronRight className="w-3 h-3" />
                                <span>Listings</span>
                            </div>
                            {/* Title */}
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
                                {listing.title}
                            </h1>
                        </div>
                        {/* Action buttons */}
                        <div className="flex gap-2">
                            <ShareListingButton
                                listingId={listing.id}
                                title={listing.title}
                            />
                            {!isOwner && isLoggedIn && (
                                <SaveListingButton listingId={listing.id} />
                            )}
                            {!isOwner && <ReportButton listingId={listing.id} />}
                        </div>
                    </div>

                    {/* Hero Gallery */}
                    <div className="mb-12">
                        {hasImages ? (
                            <div className="relative group/gallery">
                                <ImageGallery images={listing.images} title={listing.title} />
                                <div className="absolute bottom-6 right-6 px-4 py-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white shadow-lg flex items-center gap-2 pointer-events-none opacity-0 group-hover/gallery:opacity-100 transition-opacity">
                                    <Maximize2 className="w-3 h-3" /> Click to enlarge
                                </div>
                            </div>
                        ) : (
                            <RoomPlaceholder />
                        )}
                    </div>

                    {/* Content Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

                        {/* Left Column: Details */}
                        <div className="lg:col-span-2 space-y-12">

                            {/* Quick Stats Bar */}
                            <div className="flex flex-wrap items-center gap-6 pb-8 border-b border-zinc-100 dark:border-zinc-800">
                                {isOwner && (
                                    <>
                                        <ListingStatusToggle
                                            listingId={listing.id}
                                            currentStatus={listing.status as 'ACTIVE' | 'PAUSED' | 'RENTED'}
                                        />
                                        <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800" />
                                    </>
                                )}
                                {!isOwner && (
                                    <>
                                        <StatusBadge status={listing.status} />
                                        <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800" />
                                    </>
                                )}
                                <InfoStat icon={MapPin}>
                                    {listing.location?.city}, {listing.location?.state}
                                </InfoStat>
                                <InfoStat icon={Users}>
                                    {listing.availableSlots} / {listing.totalSlots} Slots Available
                                </InfoStat>
                                <InfoStat icon={Bed}>
                                    Furnished
                                </InfoStat>
                            </div>

                            {/* About */}
                            <div className="space-y-4">
                                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">About this place</h2>
                                <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed text-lg font-light whitespace-pre-line">
                                    {listing.description}
                                </p>
                            </div>

                            {/* Amenities */}
                            {listing.amenities.length > 0 && (
                                <div className="space-y-6">
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">What this place offers</h2>
                                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                                        {listing.amenities.map((amenity, i) => {
                                            const AmenityIcon = getAmenityIcon(amenity);
                                            return (
                                                <div
                                                    key={i}
                                                    className="flex items-center gap-4 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-white dark:hover:bg-zinc-800 hover:shadow-md hover:border-zinc-200 dark:hover:border-zinc-700 transition-all duration-300"
                                                >
                                                    <div className="p-2 bg-white dark:bg-zinc-800 rounded-lg shadow-sm text-zinc-700 dark:text-zinc-300">
                                                        {AmenityIcon ? (
                                                            <AmenityIcon className="w-5 h-5" strokeWidth={1.5} />
                                                        ) : (
                                                            <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                                                        )}
                                                    </div>
                                                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">{amenity}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Nearby Places Section (Radar + MapLibre) */}
                            {process.env.NEXT_PUBLIC_NEARBY_ENABLED === 'true' && coordinates && (
                                <NearbyPlacesSection
                                    listingLat={coordinates.lat}
                                    listingLng={coordinates.lng}
                                />
                            )}

                            {/* Household Details */}
                            {(listing.householdLanguages.length > 0 || listing.genderPreference || listing.householdGender) && (
                                <div className="space-y-6">
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Household Details</h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        {listing.genderPreference && (
                                            <div className="p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm dark:shadow-none">
                                                <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Gender Preference</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                    <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                                        {formatGenderPreference(listing.genderPreference)}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                        {listing.householdGender && (
                                            <div className="p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm dark:shadow-none">
                                                <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Current Household</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                                                    <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                                        {formatHouseholdGender(listing.householdGender)}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {listing.householdLanguages.length > 0 && (
                                        <div>
                                            <p className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-3">
                                                Languages Spoken
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {listing.householdLanguages.map((lang, i) => (
                                                    <span
                                                        key={i}
                                                        className="px-4 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-full text-sm font-medium border border-zinc-200 dark:border-zinc-700"
                                                    >
                                                        {getLanguageName(lang)}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Host Section */}
                            <div className="pt-8 border-t border-zinc-100 dark:border-zinc-800">
                                <div className="flex items-start gap-4">
                                    <div className="w-14 h-14 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 border-2 border-white dark:border-zinc-700 shadow-lg dark:shadow-none">
                                        <UserAvatar
                                            image={listing.owner.image}
                                            name={listing.owner.name}
                                            size="xl"
                                            className="w-full h-full"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                                            Hosted by {listing.owner.name || 'User'}
                                        </h3>
                                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-2">
                                            Joined in {new Date(listing.owner.createdAt).getFullYear()}
                                            {listing.owner.bio && ` • ${listing.owner.bio.slice(0, 50)}${listing.owner.bio.length > 50 ? '...' : ''}`}
                                        </p>
                                        <div className="flex gap-2 flex-wrap">
                                            {listing.owner.isVerified && (
                                                <div className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                                    <ShieldCheck className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100" />
                                                    Identity verified
                                                </div>
                                            )}
                                            {listing.owner.isVerified && reviews.length >= 5 && (
                                                <>
                                                    <span className="text-zinc-300 dark:text-zinc-600">•</span>
                                                    <div className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                                        <Star className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100" />
                                                        Superhost
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        {!isOwner && (
                                            <div className="mt-4">
                                                <ContactHostButton listingId={listing.id} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Reviews Section */}
                            <div className="space-y-6">
                                <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                                    Reviews
                                    <span className="text-lg font-normal text-zinc-500 dark:text-zinc-400">
                                        ({reviews.length})
                                    </span>
                                </h2>

                                <div className="mb-8">
                                    <ReviewList reviews={reviews} />
                                </div>

                                {!isOwner && (
                                    <ReviewForm
                                        listingId={listing.id}
                                        isLoggedIn={isLoggedIn}
                                        hasExistingReview={!!userExistingReview}
                                        hasBookingHistory={userHasBooking}
                                        existingReview={userExistingReview || undefined}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Right Column: Sticky Sidebar */}
                        <div className="lg:col-span-1">
                            <div className="sticky top-24 space-y-6">

                                {/* Owner Management Card */}
                                {isOwner && (
                                    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl shadow-zinc-200/50 dark:shadow-black/20">
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Manage Listing</h3>
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                                            </span>
                                        </div>

                                        {/* Stats Preview */}
                                        <div className="grid grid-cols-2 gap-4 mb-6">
                                            <StatCard label="Views" value={listing.viewCount} />
                                            <StatCard label="Reviews" value={reviews.length} />
                                        </div>

                                        <div className="space-y-3">
                                            <Link href={`/listings/${listing.id}/edit`} className="block">
                                                <button className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-medium py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-zinc-900/20 dark:shadow-white/5 active:scale-[0.98]">
                                                    <Pencil className="w-4 h-4" />
                                                    Edit Listing
                                                </button>
                                            </Link>
                                            <DeleteListingButton listingId={listing.id} />
                                        </div>

                                        <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 text-center">
                                            <button
                                                onClick={() => window.open(`/listings/${listing.id}?preview=true`, '_blank')}
                                                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline inline-flex items-center gap-1"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                                View listing as guest
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Boost Visibility Card (Owner only) */}
                                {isOwner && (
                                    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/30 dark:to-zinc-900 rounded-2xl p-5 border border-indigo-100/50 dark:border-indigo-900/50">
                                        <div className="flex gap-3">
                                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-lg h-fit">
                                                <Zap className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mb-1">Boost visibility</h4>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mb-3">Get up to 3x more views by promoting this listing.</p>
                                                <button className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
                                                    Promote now &rarr;
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Guest Booking Card */}
                                {!isOwner && (
                                    <BookingForm
                                        listingId={listing.id}
                                        price={listing.price}
                                        ownerId={listing.ownerId}
                                        isOwner={isOwner}
                                        isLoggedIn={isLoggedIn}
                                        status={listing.status as 'ACTIVE' | 'PAUSED' | 'RENTED'}
                                        bookedDates={bookedDates}
                                    />
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </main>

            {/* Neighborhood AI Chat Widget */}
            {coordinates && (
                <NeighborhoodChat
                    listingId={listing.id}
                    latitude={coordinates.lat}
                    longitude={coordinates.lng}
                />
            )}
        </div>
    );
}
