'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    Star,
    ShieldCheck,
    CheckCircle2,
    MapPin,
    Languages,
    MessageSquare,
    Flag,
    Calendar,
    Home
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/UserAvatar';
import { startConversation } from '@/app/actions/chat';
import BlockUserButton from '@/components/BlockUserButton';

type UserWithDetails = {
    id: string;
    name: string | null;
    email: string | null;
    emailVerified: Date | null;
    image: string | null;
    bio: string | null;
    countryOfOrigin: string | null;
    languages: string[];
    isVerified: boolean;
    createdAt?: Date;
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
    reviewsReceived: Array<{
        id: string;
        rating: number;
        comment: string;
        createdAt: Date;
        author: {
            id: string;
            name: string | null;
            image: string | null;
        };
    }>;
};

interface UserProfileClientProps {
    user: UserWithDetails;
    isOwnProfile: boolean;
    averageRating: number | null;
    currentUserId?: string;
}

const Badge = ({ icon: Icon, text, variant = "default" }: { icon?: any; text: string; variant?: "default" | "verified" }) => {
    const styles = variant === "verified"
        ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
        : "bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700";

    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${styles}`}>
            {Icon && <Icon className="w-3 h-3" />}
            {text}
        </div>
    );
};

const ListingCard = ({ listing }: { listing: UserWithDetails['listings'][0] }) => {
    const imageUrl = listing.images?.[0] || `https://source.unsplash.com/random/800x600/?apartment,room&sig=${listing.id}`;
    const locationText = listing.location
        ? `${listing.location.city}, ${listing.location.state}`
        : 'Location not specified';

    return (
        <Link href={`/listings/${listing.id}`}>
            <div className="group relative flex flex-col gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700 shadow-sm hover:shadow-md transition-all cursor-pointer">
                <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    <img
                        src={imageUrl}
                        alt={listing.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute top-2 right-2 px-2 py-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-md text-2xs font-bold uppercase tracking-wide text-green-600 dark:text-green-400">
                        {listing.availableSlots > 0 ? 'Available' : 'Full'}
                    </div>
                </div>
                <div className="px-1">
                    <h4 className="font-semibold text-zinc-900 dark:text-white leading-tight mb-1">{listing.title}</h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
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

const ReviewCard = ({ review }: { review: UserWithDetails['reviewsReceived'][0] }) => {
    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-100 dark:border-zinc-800">
            <div className="flex items-start gap-4">
                <Link href={`/users/${review.author.id}`}>
                    <UserAvatar image={review.author.image} name={review.author.name} className="w-10 h-10" />
                </Link>
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                        <Link href={`/users/${review.author.id}`} className="font-semibold text-zinc-900 dark:text-white hover:underline">
                            {review.author.name || 'Anonymous'}
                        </Link>
                        <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                                <Star
                                    key={i}
                                    className={`w-3.5 h-3.5 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-200 dark:text-zinc-700'}`}
                                />
                            ))}
                        </div>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{review.comment}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                        {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default function UserProfileClient({ user, isOwnProfile, averageRating, currentUserId }: UserProfileClientProps) {
    const router = useRouter();
    const [isContactLoading, setIsContactLoading] = useState(false);

    const handleContact = async () => {
        if (!currentUserId) {
            router.push('/login');
            return;
        }

        // We need a listing to start a conversation, so use the first listing if available
        if (user.listings.length === 0) {
            toast.error('This user has no listings to contact about.');
            return;
        }

        setIsContactLoading(true);
        try {
            const result = await startConversation(user.listings[0].id);
            if (result.conversationId) {
                router.push(`/messages/${result.conversationId}`);
            }
        } catch (error) {
            console.error('Failed to start conversation:', error);
            toast.error('Failed to start conversation');
        } finally {
            setIsContactLoading(false);
        }
    };

    const memberSince = user.emailVerified
        ? new Date(user.emailVerified).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : 'Recently joined';

    return (
        <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-black pb-20 pt-24">
            <main className="container mx-auto max-w-5xl px-6 py-10">

                {/* Profile Header */}
                <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 md:p-12 shadow-sm border border-zinc-100 dark:border-zinc-800 mb-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-zinc-50 dark:bg-zinc-800 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col md:flex-row gap-8 md:items-start">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full p-1 bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 shadow-xl">
                                <UserAvatar image={user.image} name={user.name} className="w-full h-full" />
                            </div>
                            {user.isVerified && (
                                <div className="absolute bottom-2 right-2 bg-green-500 w-6 h-6 rounded-full border-4 border-white dark:border-zinc-900 flex items-center justify-center shadow-sm">
                                    <CheckCircle2 className="w-3 h-3 text-white" />
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 pt-2">
                            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                                <div>
                                    <h1 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white tracking-tight mb-2">
                                        {user.name || 'User'}
                                    </h1>
                                    <p className="text-zinc-500 dark:text-zinc-400 font-medium mb-4">
                                        {user.listings.length > 0 ? 'Host' : 'Member'}
                                        {user.countryOfOrigin && ` from ${user.countryOfOrigin}`}
                                    </p>

                                    <div className="flex flex-wrap gap-3">
                                        {user.isVerified ? (
                                            <Badge icon={ShieldCheck} text="Identity Verified" variant="verified" />
                                        ) : (
                                            <Badge icon={ShieldCheck} text="Not Verified" />
                                        )}
                                        {averageRating && (
                                            <Badge
                                                icon={Star}
                                                text={`${averageRating.toFixed(1)} Rating`}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3">
                                    {isOwnProfile ? (
                                        <Link href="/profile">
                                            <Button variant="outline">
                                                Edit Profile
                                            </Button>
                                        </Link>
                                    ) : (
                                        <>
                                            {user.listings.length > 0 && (
                                                <Button
                                                    onClick={handleContact}
                                                    disabled={isContactLoading}
                                                >
                                                    <MessageSquare className="w-4 h-4 mr-2" />
                                                    {isContactLoading ? 'Loading...' : 'Contact'}
                                                </Button>
                                            )}
                                            <BlockUserButton
                                                userId={user.id}
                                                userName={user.name || 'User'}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Sidebar - Info */}
                    <div className="lg:col-span-1 space-y-8">

                        {/* Trust & Verification */}
                        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-8 shadow-sm border border-zinc-100 dark:border-zinc-800">
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5" /> Trust & Verification
                            </h3>
                            <ul className="space-y-4">
                                <li className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-500 dark:text-zinc-400">Identity verified</span>
                                    {user.isVerified ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    ) : (
                                        <span className="text-zinc-300 dark:text-zinc-600">Not verified</span>
                                    )}
                                </li>
                                <li className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-500 dark:text-zinc-400">Email confirmed</span>
                                    {user.emailVerified ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    ) : (
                                        <span className="text-zinc-300 dark:text-zinc-600">Not confirmed</span>
                                    )}
                                </li>
                                <hr className="border-zinc-100 dark:border-zinc-800" />
                                <li className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                                        <Calendar className="w-4 h-4" /> Member since
                                    </span>
                                    <span className="text-zinc-900 dark:text-white font-medium">{memberSince}</span>
                                </li>
                                <li className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                                        <Home className="w-4 h-4" /> Listings
                                    </span>
                                    <span className="text-zinc-900 dark:text-white font-medium">{user.listings.length}</span>
                                </li>
                                {averageRating && (
                                    <li className="flex items-center justify-between text-sm">
                                        <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                                            <Star className="w-4 h-4" /> Average rating
                                        </span>
                                        <span className="text-zinc-900 dark:text-white font-medium flex items-center gap-1">
                                            {averageRating.toFixed(1)}
                                            <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                                        </span>
                                    </li>
                                )}
                            </ul>
                        </div>

                        {/* Details */}
                        {(user.countryOfOrigin || user.languages.length > 0) && (
                            <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-8 shadow-sm border border-zinc-100 dark:border-zinc-800">
                                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6">Details</h3>
                                <ul className="space-y-5">
                                    {user.countryOfOrigin && (
                                        <li className="flex items-start gap-3 text-sm">
                                            <MapPin className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mt-0.5" />
                                            <div>
                                                <span className="block text-zinc-900 dark:text-white font-medium">From</span>
                                                <span className="text-zinc-500 dark:text-zinc-400">{user.countryOfOrigin}</span>
                                            </div>
                                        </li>
                                    )}
                                    {user.languages.length > 0 && (
                                        <li className="flex items-start gap-3 text-sm">
                                            <Languages className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mt-0.5" />
                                            <div>
                                                <span className="block text-zinc-900 dark:text-white font-medium">Speaks</span>
                                                <span className="text-zinc-500 dark:text-zinc-400">{user.languages.join(", ")}</span>
                                            </div>
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Right Content - Main */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* Bio */}
                        {user.bio && (
                            <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-8 shadow-sm border border-zinc-100 dark:border-zinc-800">
                                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">About {user.name?.split(' ')[0]}</h3>
                                <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed font-light text-lg">
                                    {user.bio}
                                </p>
                            </div>
                        )}

                        {/* Listings */}
                        {user.listings.length > 0 && (
                            <div>
                                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6 px-2">
                                    {user.name?.split(' ')[0]}&apos;s Listings
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {user.listings.map(listing => (
                                        <ListingCard key={listing.id} listing={listing} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Reviews */}
                        {user.reviewsReceived.length > 0 && (
                            <div id="reviews">
                                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6 px-2 flex items-center gap-2">
                                    <Star className="w-5 h-5" />
                                    Reviews ({user.reviewsReceived.length})
                                </h3>
                                <div className="space-y-4">
                                    {user.reviewsReceived.map(review => (
                                        <ReviewCard key={review.id} review={review} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Empty States */}
                        {user.listings.length === 0 && user.reviewsReceived.length === 0 && !user.bio && (
                            <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-12 shadow-sm border border-zinc-100 dark:border-zinc-800 text-center">
                                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Home className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
                                </div>
                                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                                    {user.name?.split(' ')[0]} hasn&apos;t added any details yet
                                </h3>
                                <p className="text-zinc-500 dark:text-zinc-400">
                                    Check back later for more information about this member.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
