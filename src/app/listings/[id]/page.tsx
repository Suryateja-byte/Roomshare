import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MapPin, Users, Bed, Wifi, ShieldCheck, Calendar, Share2, Heart, Edit, Eye } from 'lucide-react';
import Link from 'next/link';
import ContactHostButton from '@/components/ContactHostButton';
import DeleteListingButton from '@/components/DeleteListingButton';
import VerifiedBadge from '@/components/verification/VerifiedBadge';
import ReviewList from '@/components/ReviewList';
import ReviewForm from '@/components/ReviewForm';
import BookingForm from '@/components/BookingForm';
import ReportButton from '@/components/ReportButton';
import UserAvatar from '@/components/UserAvatar';
import RoomPlaceholder from '@/components/listings/RoomPlaceholder';
import ListingStatusToggle from '@/components/ListingStatusToggle';
import ShareListingButton from '@/components/ShareListingButton';
import SaveListingButton from '@/components/SaveListingButton';
import { getReviews } from '@/lib/data';
import { trackListingView } from '@/app/actions/listing-status';
import { Metadata } from 'next';
import { auth } from '@/auth';
import { ListingStatus } from '@prisma/client';

interface PageProps {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const listing = await prisma.listing.findUnique({
        where: { id },
        include: { location: true },
    });

    if (!listing) {
        return { title: 'Listing Not Found' };
    }

    // Use listing's first image if available, otherwise use default
    const ogImage: string = (listing.images && listing.images.length > 0)
        ? listing.images[0]
        : 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80';

    return {
        title: `Rent this ${listing.title} in ${listing.location?.city || 'City'} | RoomShare`,
        description: listing.description.substring(0, 160),
        openGraph: {
            images: [ogImage],
        },
    };
}

export default async function ListingPage({ params }: PageProps) {
    const { id } = await params;
    const session = await auth();
    const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
            owner: true,
            location: true,
        },
    });

    if (!listing) {
        notFound();
    }

    const reviews = await getReviews(listing.id);
    const isOwner = session?.user?.id === listing.ownerId;

    // Track view if user is not the owner
    if (session?.user?.id && !isOwner) {
        await trackListingView(listing.id);
    }

    // Use actual listing images or fallback to placeholder
    const hasImages = listing.images && listing.images.length > 0;
    const mainImage = hasImages ? listing.images[0] : null;
    const galleryImages = hasImages && listing.images.length > 1 ? listing.images.slice(1, 5) : [];

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Hero Gallery */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                {hasImages ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[400px] md:h-[500px] rounded-3xl overflow-hidden">
                        <div className="md:col-span-2 h-full relative group">
                            <img src={mainImage ?? undefined} alt={listing.title} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                        </div>
                        {galleryImages.length > 0 && (
                            <div className="hidden md:grid grid-cols-2 gap-4 col-span-2 h-full">
                                {galleryImages.map((img, i) => (
                                    <div key={i} className="relative group overflow-hidden">
                                        <img src={img} alt={`Gallery ${i}`} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <RoomPlaceholder />
                )}
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col lg:flex-row gap-12">
                    {/* Main Content */}
                    <div className="flex-1">
                        {/* Header */}
                        <div className="mb-8">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <h1 className="text-3xl md:text-4xl font-bold text-foreground">{listing.title}</h1>
                                        {isOwner && (
                                            <ListingStatusToggle
                                                listingId={listing.id}
                                                currentStatus={listing.status as ListingStatus}
                                            />
                                        )}
                                    </div>
                                    <div className="flex items-center text-muted-foreground gap-4">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="w-4 h-4" />
                                            <span>{listing.location?.city}, {listing.location?.state}</span>
                                        </div>
                                        {isOwner && listing.viewCount > 0 && (
                                            <div className="flex items-center gap-1 text-sm">
                                                <Eye className="w-4 h-4" />
                                                <span>{listing.viewCount} views</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <ShareListingButton
                                        listingId={listing.id}
                                        title={listing.title}
                                    />
                                    {!isOwner && session?.user && (
                                        <SaveListingButton listingId={listing.id} />
                                    )}
                                    {!isOwner && <ReportButton listingId={listing.id} />}
                                </div>
                            </div>
                        </div>

                        {/* Stats Bar */}
                        <div className="flex flex-wrap gap-6 py-6 border-y border-border/50 mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-full text-primary">
                                    <Users className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-semibold">{listing.totalSlots} Slots</p>
                                    <p className="text-sm text-muted-foreground">{listing.availableSlots} available</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-full text-primary">
                                    <Bed className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-semibold">Furnished</p>
                                    <p className="text-sm text-muted-foreground">Ready to move in</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-full text-primary">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-semibold">Verified</p>
                                    <p className="text-sm text-muted-foreground">Safe listing</p>
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="mb-10">
                            <h2 className="text-2xl font-bold mb-4">About this place</h2>
                            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                                {listing.description}
                            </p>
                        </div>

                        {/* Amenities */}
                        <div className="mb-10">
                            <h2 className="text-2xl font-bold mb-6">What this place offers</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {listing.amenities.map((amenity, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:border-primary/50 transition-colors">
                                        {amenity.toLowerCase().includes('wifi') ? <Wifi className="w-5 h-5 text-primary" /> :
                                            amenity.toLowerCase().includes('bed') ? <Bed className="w-5 h-5 text-primary" /> :
                                                <div className="w-5 h-5 rounded-full bg-primary/20" />}
                                        <span>{amenity}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Host Info */}
                        <div className="mb-10 p-6 bg-muted/30 rounded-2xl border border-border/50">
                            <div className="flex items-center gap-4 mb-4">
                                <UserAvatar image={listing.owner.image} name={listing.owner.name} size="xl" />
                                <div>
                                    <h3 className="text-xl font-bold flex items-center gap-2">
                                        Hosted by {listing.owner.name || 'User'}
                                        {listing.owner.isVerified && <VerifiedBadge />}
                                    </h3>
                                    <p className="text-muted-foreground text-sm">Joined {new Date().getFullYear()}</p>
                                </div>
                            </div>
                            <p className="text-muted-foreground mb-4">{listing.owner.bio || "This host hasn't added a bio yet."}</p>
                            {!isOwner ? (
                                <ContactHostButton listingId={listing.id} />
                            ) : (
                                <div className="space-y-3">
                                    <Link href={`/listings/${listing.id}/edit`} className="block">
                                        <Button variant="primary" className="w-full">
                                            <Edit className="w-4 h-4 mr-2" />
                                            Edit Listing
                                        </Button>
                                    </Link>
                                    <DeleteListingButton listingId={listing.id} />
                                </div>
                            )}
                        </div>

                        {/* Reviews Section */}
                        <div className="mb-10">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                                Reviews
                                <span className="text-lg font-normal text-muted-foreground">
                                    ({reviews.length})
                                </span>
                            </h2>

                            <div className="mb-8">
                                <ReviewList reviews={reviews} />
                            </div>

                            {!isOwner && session?.user && (
                                <div>
                                    <ReviewForm listingId={listing.id} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar / Sticky Card */}
                    <div className="lg:w-[380px]">
                        <div className="sticky top-24">
                            <BookingForm
                                listingId={listing.id}
                                price={listing.price}
                                ownerId={listing.ownerId}
                                isOwner={isOwner}
                            />
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}
