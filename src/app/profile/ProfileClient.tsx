'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
    Star,
    ShieldCheck,
    CheckCircle2,
    Settings,
    LogOut,
    Edit2,
    Briefcase,
    GraduationCap,
    Languages,
    ArrowLeft,
    Share2,
    MapPin,
    MessageSquare,
    ChevronRight,
    Loader2,
    ImageOff
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import UserAvatar from '@/components/UserAvatar';

// --- Types ---
type UserWithListings = {
    id: string;
    name: string | null;
    email: string | null;
    emailVerified: Date | null;
    image: string | null;
    bio: string | null;
    countryOfOrigin: string | null;
    languages: string[];
    isVerified: boolean;
    createdAt: Date;
    listings: Array<{
        id: string;
        title: string;
        description: string;
        price: number;
        availableSlots: number;
        images: string[];
        location: {
            city: string;
            state: string;
        } | null;
    }>;
};

// --- Components ---
const Badge = ({ icon: Icon, text, variant = "default" }: any) => {
    const styles = variant === "verified"
        ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
        : "bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700";

    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${styles}`}>
            {Icon && <Icon className="w-3 h-3 flex-shrink-0" />}
            {text}
        </div>
    );
};

const ListingCard = ({ listing }: any) => {
    const hasImages = listing.images && listing.images.length > 0;
    const imageUrl = hasImages ? listing.images[0] : null;
    const locationText = listing.location
        ? `${listing.location.city}, ${listing.location.state}`
        : 'Location not specified';

    return (
        <Link href={`/listings/${listing.id}`}>
            <div className="group relative flex flex-col gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700 shadow-sm hover:shadow-md transition-all cursor-pointer">
                <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={listing.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500">
                            <ImageOff className="w-8 h-8 mb-2" />
                            <span className="text-xs">No image</span>
                        </div>
                    )}
                    <div className="absolute top-2 right-2 px-2 py-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-md text-2xs font-bold uppercase tracking-wide text-green-600 dark:text-green-400">
                        {listing.availableSlots > 0 ? 'Active' : 'Full'}
                    </div>
                </div>
                <div className="px-1">
                    <h4 className="font-semibold text-zinc-900 dark:text-white leading-tight mb-1">{listing.title}</h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {locationText}
                    </p>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white mt-2">
                        ${listing.price}<span className="text-zinc-400 dark:text-zinc-500 font-normal">/mo</span>
                    </p>
                </div>
            </div>
        </Link>
    );
};

// --- Main Component ---
export default function ProfileClient({ user }: { user: UserWithListings }) {
    const [isEditing, setIsEditing] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleEdit = () => {
        window.location.href = '/profile/edit';
    };

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        await signOut({ callbackUrl: '/' });
    };

    // Loading skeleton when user data is incomplete
    if (!user || !user.id) {
        return (
            <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 font-sans pb-20 pt-20">
                <main className="container mx-auto max-w-5xl px-4 sm:px-6 py-10">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-8 md:p-12 shadow-sm border border-zinc-100 dark:border-zinc-800 mb-8">
                        <div className="flex flex-col md:flex-row gap-6 md:gap-8 md:items-start animate-pulse">
                            {/* Avatar skeleton */}
                            <div className="w-28 h-28 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-zinc-200 dark:bg-zinc-700 mx-auto md:mx-0" />
                            {/* Info skeleton */}
                            <div className="flex-1 pt-0 md:pt-2 text-center md:text-left space-y-4">
                                <div className="h-8 bg-zinc-200 dark:bg-zinc-700 rounded-lg w-48 mx-auto md:mx-0" />
                                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-32 mx-auto md:mx-0" />
                                <div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded-full w-36 mx-auto md:mx-0" />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 space-y-8">
                            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-800 animate-pulse">
                                <div className="h-6 bg-zinc-200 dark:bg-zinc-700 rounded w-24 mb-6" />
                                <div className="space-y-4">
                                    <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-full" />
                                    <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-full" />
                                    <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-3/4" />
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-2 space-y-8">
                            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-800 animate-pulse">
                                <div className="h-6 bg-zinc-200 dark:bg-zinc-700 rounded w-32 mb-4" />
                                <div className="space-y-2">
                                    <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-full" />
                                    <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-5/6" />
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    // Format join date
    const joinedDate = new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-black pb-20 pt-16">
            <main className="container mx-auto max-w-5xl px-4 sm:px-6 py-6">

                {/* Profile Header */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-8 md:p-12 shadow-sm border border-zinc-100 dark:border-zinc-800 mb-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-zinc-50 dark:bg-zinc-800 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col md:flex-row gap-6 md:gap-8 md:items-start">
                        {/* Avatar */}
                        <div className="relative shrink-0 mx-auto md:mx-0">
                            <div className="w-28 h-28 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full p-1 bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 shadow-xl">
                                <UserAvatar image={user.image} name={user.name} className="w-full h-full" />
                            </div>
                            {user.isVerified && (
                                <div className="absolute bottom-2 right-2 bg-green-500 w-6 h-6 rounded-full border-4 border-white flex items-center justify-center shadow-sm">
                                    <CheckCircle2 className="w-3 h-3 text-white" />
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 pt-0 md:pt-2 text-center md:text-left">
                            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                                <div>
                                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white tracking-tight mb-2">
                                        {user.name || 'User'}
                                    </h1>
                                    <p className="text-zinc-500 dark:text-zinc-400 font-medium mb-4">
                                        {user.listings.length > 0 ? 'Host' : 'Tenant'}
                                        {user.countryOfOrigin && ` • ${user.countryOfOrigin}`}
                                    </p>

                                    <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                                        {user.isVerified ? (
                                            <Badge icon={ShieldCheck} text="Identity Verified" variant="verified" />
                                        ) : (
                                            <Badge icon={ShieldCheck} text="Not Verified" />
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-3 justify-center md:justify-start">
                                    <button
                                        onClick={handleEdit}
                                        disabled={isEditing}
                                        className="h-10 px-6 rounded-full border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Edit2 className="w-4 h-4" /> Edit Profile
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Sidebar - Info */}
                    <div className="lg:col-span-1 space-y-8">

                        {/* Trust & Verification */}
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-sm border border-zinc-100 dark:border-zinc-800">
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 flex-shrink-0" /> Trust
                            </h3>
                            <ul className="space-y-4">
                                <li className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-500 dark:text-zinc-400">Identity</span>
                                    {user.isVerified ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    ) : (
                                        <span className="text-zinc-300 dark:text-zinc-600">Pending</span>
                                    )}
                                </li>
                                <li className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-500 dark:text-zinc-400">Email address</span>
                                    {user.emailVerified ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    ) : (
                                        <span className="text-zinc-300 dark:text-zinc-600">Pending</span>
                                    )}
                                </li>
                                <hr className="border-zinc-100 dark:border-zinc-800" />
                                <li className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-900 dark:text-white font-medium">Joined</span>
                                    <span className="text-zinc-500 dark:text-zinc-400">{joinedDate}</span>
                                </li>
                            </ul>
                        </div>

                        {/* Details */}
                        {(user.countryOfOrigin || user.languages.length > 0) && (
                            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-sm border border-zinc-100 dark:border-zinc-800">
                                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6">About</h3>
                                <ul className="space-y-5">
                                    {user.countryOfOrigin && (
                                        <li className="flex items-start gap-3 text-sm">
                                            <MapPin className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <span className="block text-zinc-900 dark:text-white font-medium">Country</span>
                                                <span className="text-zinc-500 dark:text-zinc-400">{user.countryOfOrigin}</span>
                                            </div>
                                        </li>
                                    )}
                                    {user.languages.length > 0 && (
                                        <li className="flex items-start gap-3 text-sm">
                                            <Languages className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <span className="block text-zinc-900 dark:text-white font-medium">Languages</span>
                                                <span className="text-zinc-500 dark:text-zinc-400">{user.languages.join(", ")}</span>
                                            </div>
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}

                        {/* Reviews About You */}
                        <Link
                            href={`/users/${user.id}#reviews`}
                            className="block bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-sm border border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700 hover:shadow-md transition-all group"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                        <Star className="w-5 h-5 text-amber-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-zinc-900 dark:text-white">Reviews About You</h3>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400">See what others are saying</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 group-hover:translate-x-1 transition-all" />
                            </div>
                        </Link>

                        <button
                            onClick={handleLogout}
                            disabled={isLoggingOut}
                            className="w-full py-4 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoggingOut ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <LogOut className="w-4 h-4" />
                            )}
                            {isLoggingOut ? 'Logging out...' : 'Log Out'}
                        </button>

                    </div>

                    {/* Right Content - Main */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* Bio */}
                        {user.bio && (
                            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-sm border border-zinc-100 dark:border-zinc-800">
                                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">About {user.name?.split(' ')[0]}</h3>
                                <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed font-light text-base sm:text-lg">
                                    {user.bio}
                                </p>
                            </div>
                        )}

                        {/* Listings */}
                        <div>
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6 px-2">
                                {user.name?.split(' ')[0]}&apos;s Listings
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {user.listings.length > 0 ? (
                                    user.listings.map(listing => (
                                        <ListingCard key={listing.id} listing={listing} />
                                    ))
                                ) : (
                                    <div className="col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm p-8 text-center">
                                        <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <MapPin className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                                        </div>
                                        <h4 className="font-semibold text-zinc-900 dark:text-white mb-2">No listings yet</h4>
                                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6 max-w-xs mx-auto">
                                            Have a room to share? List your first space and start earning as a host.
                                        </p>
                                        <Link
                                            href="/listings/create"
                                            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                                        >
                                            Create your first listing
                                            <ChevronRight className="w-4 h-4" />
                                        </Link>
                                    </div>
                                )}

                                {/* Add New Listing Placeholder - only show when user has some listings */}
                                {user.listings.length > 0 && (
                                    <Link href="/listings/create" className="group flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all cursor-pointer min-h-[200px]">
                                        <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <span className="text-2xl text-zinc-400 dark:text-zinc-500 font-light">+</span>
                                        </div>
                                        <span className="text-sm font-bold text-zinc-500 dark:text-zinc-400">List a new room</span>
                                    </Link>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
}
