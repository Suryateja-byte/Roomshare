'use client';

import React from 'react';
import {
    MapPin,
    ShieldCheck,
    Flag,
    Edit,
    Trash2,
    Maximize2,
    Eye,
    Users,
    Bed,
    type LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getAmenityIcon } from '@/lib/amenityIcons';

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
import NeighborhoodChat from '@/components/NeighborhoodChat';

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
        languages: string[];
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

// Badge component
function Badge({ icon: Icon, label, color = "zinc" }: { icon?: LucideIcon; label: string; color?: 'zinc' | 'green' }) {
    return (
        <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wide",
            color === 'green'
                ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
        )}>
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
        </div>
    );
}

// Stat item component
function StatItem({ icon: Icon, label, sub }: { icon: LucideIcon; label: string; sub: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full text-primary">
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="font-semibold text-foreground">{label}</p>
                <p className="text-sm text-muted-foreground">{sub}</p>
            </div>
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

            {/* Hero Gallery */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                {hasImages ? (
                    <div className="relative group">
                        <ImageGallery images={listing.images} title={listing.title} />
                        <div className="absolute bottom-6 right-6 px-4 py-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white shadow-lg flex items-center gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                            <Maximize2 className="w-3 h-3" /> Click to enlarge
                        </div>
                    </div>
                ) : (
                    <RoomPlaceholder />
                )}
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col lg:flex-row gap-12">
                    {/* Main Content Column */}
                    <div className="flex-1 max-w-3xl">
                        {/* Title Header */}
                        <div className="border-b border-border/50 pb-8 mb-8">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
                                            {listing.title}
                                        </h1>
                                        {isOwner && (
                                            <ListingStatusToggle
                                                listingId={listing.id}
                                                currentStatus={listing.status as 'ACTIVE' | 'PAUSED' | 'RENTED'}
                                            />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 flex-wrap">
                                        {isOwner && listing.status === 'ACTIVE' && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 uppercase tracking-wide">
                                                Active
                                            </span>
                                        )}
                                        <div className="flex items-center text-muted-foreground font-medium">
                                            <MapPin className="w-4 h-4 mr-1.5" />
                                            <span className="underline decoration-muted-foreground/30 underline-offset-4">
                                                {listing.location?.city}, {listing.location?.state}
                                            </span>
                                        </div>
                                        {isOwner && listing.viewCount > 0 && (
                                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                <Eye className="w-4 h-4" />
                                                <span>{listing.viewCount} views</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2 flex-shrink-0">
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
                        </div>

                        {/* Stats Grid */}
                        <div className="flex flex-wrap gap-6 py-6 border-b border-border/50 mb-8">
                            <StatItem
                                icon={Users}
                                label={`${listing.totalSlots} Slots`}
                                sub={`${listing.availableSlots} available`}
                            />
                            <StatItem
                                icon={Bed}
                                label="Furnished"
                                sub="Ready to move in"
                            />
                            <div className="flex gap-3 flex-wrap">
                                <Badge icon={ShieldCheck} label="Verified" />
                                <Badge icon={ShieldCheck} label="Safe listing" />
                            </div>
                        </div>

                        {/* About */}
                        <div className="mb-10">
                            <h2 className="text-2xl font-bold mb-4 text-foreground">About this place</h2>
                            <p className="text-muted-foreground leading-relaxed text-lg font-light whitespace-pre-line">
                                {listing.description}
                            </p>
                        </div>

                        {/* Amenities */}
                        {listing.amenities.length > 0 && (
                            <div className="mb-10">
                                <h2 className="text-2xl font-bold mb-6 text-foreground">What this place offers</h2>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {listing.amenities.map((amenity, i) => {
                                        const AmenityIcon = getAmenityIcon(amenity);
                                        return (
                                            <div
                                                key={i}
                                                className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:border-primary/50 transition-colors"
                                            >
                                                {AmenityIcon ? (
                                                    <AmenityIcon className="w-5 h-5 text-primary" strokeWidth={1.5} />
                                                ) : (
                                                    <div className="w-5 h-5 rounded-full bg-primary/20" />
                                                )}
                                                <span className="text-foreground">{amenity}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Household Details */}
                        {(listing.languages.length > 0 || listing.genderPreference || listing.householdGender) && (
                            <div className="mb-10">
                                <h2 className="text-2xl font-bold mb-6 text-foreground">Household Details</h2>
                                <div className="space-y-6">
                                    {listing.languages.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">
                                                Languages Spoken
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {listing.languages.map((lang, i) => (
                                                    <span
                                                        key={i}
                                                        className="px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium"
                                                    >
                                                        {lang}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {listing.genderPreference && (
                                            <div className="p-4 rounded-xl border border-border/50">
                                                <p className="text-sm text-muted-foreground mb-1">Open to</p>
                                                <p className="font-semibold text-foreground">
                                                    {formatGenderPreference(listing.genderPreference)}
                                                </p>
                                            </div>
                                        )}
                                        {listing.householdGender && (
                                            <div className="p-4 rounded-xl border border-border/50">
                                                <p className="text-sm text-muted-foreground mb-1">Current Household</p>
                                                <p className="font-semibold text-foreground">
                                                    {formatHouseholdGender(listing.householdGender)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Host Info */}
                        <div className="mb-10 p-6 bg-muted/30 rounded-2xl border border-border/50">
                            <div className="flex items-center gap-4 mb-4">
                                <UserAvatar
                                    image={listing.owner.image}
                                    name={listing.owner.name}
                                    size="xl"
                                />
                                <div>
                                    <h3 className="text-xl font-bold flex items-center gap-2 text-foreground">
                                        Hosted by {listing.owner.name || 'User'}
                                        {listing.owner.isVerified && <VerifiedBadge />}
                                    </h3>
                                    <p className="text-muted-foreground text-sm">
                                        Joined {new Date(listing.owner.createdAt).getFullYear()}
                                    </p>
                                </div>
                            </div>
                            <p className="text-muted-foreground mb-4">
                                {listing.owner.bio || "This host hasn't added a bio yet."}
                            </p>

                            {!isOwner ? (
                                <ContactHostButton listingId={listing.id} />
                            ) : (
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <Link href={`/listings/${listing.id}/edit`} className="flex-1">
                                        <Button variant="primary" className="w-full">
                                            <Edit className="w-4 h-4 mr-2" />
                                            Edit Listing
                                        </Button>
                                    </Link>
                                    <div className="flex-1">
                                        <DeleteListingButton listingId={listing.id} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Reviews Section */}
                        <div className="mb-10">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-foreground">
                                Reviews
                                <span className="text-lg font-normal text-muted-foreground">
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

                    {/* Sidebar / Booking Card - Guest View Only */}
                    {!isOwner && (
                        <div className="lg:w-[400px]">
                            <div className="sticky top-24">
                                <BookingForm
                                    listingId={listing.id}
                                    price={listing.price}
                                    ownerId={listing.ownerId}
                                    isOwner={isOwner}
                                    isLoggedIn={isLoggedIn}
                                    status={listing.status as 'ACTIVE' | 'PAUSED' | 'RENTED'}
                                    bookedDates={bookedDates}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Neighborhood AI Chat Widget */}
            {coordinates && (
                <NeighborhoodChat
                    latitude={coordinates.lat}
                    longitude={coordinates.lng}
                />
            )}
        </div>
    );
}
