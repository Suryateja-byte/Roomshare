import Link from 'next/link';
import { Users, Wifi, Bed, MapPin } from 'lucide-react';

interface ListingCardProps {
    listing: {
        id: string;
        title: string;
        price: number;
        availableSlots: number;
        images?: string[];
        amenities?: string[];
        // Add other fields if needed, but make them optional if not always present in MapListing
    };
    className?: string;
}

export default function ListingCard({ listing, className = '' }: ListingCardProps) {
    // Use actual listing images or placeholder
    const hasImage = listing.images && listing.images.length > 0;
    const imageUrl = hasImage
        ? listing.images[0]
        : `https://source.unsplash.com/random/800x600/?apartment,room&sig=${listing.id}`;

    return (
        <Link href={`/listings/${listing.id}`} className={`block group ${className}`}>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-border/50 h-full flex flex-col">
                {/* Image Container */}
                <div className="relative aspect-[4/3] overflow-hidden bg-muted ">
                    <img
                        src={imageUrl}
                        alt={listing.title}
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                    />
                    {!hasImage && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm">
                            <span className="text-slate-400 text-sm font-medium">No photos yet</span>
                        </div>
                    )}
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-semibold text-foreground shadow-sm">
                        {listing.availableSlots} spots left
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {listing.title}
                        </h3>
                        <div className="text-lg font-bold text-primary whitespace-nowrap ml-2">
                            ${listing.price}
                        </div>
                    </div>

                    {/* Amenities / Info */}
                    <div className="mt-auto space-y-3">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground ">
                            {/* Mocking some icons based on amenities or defaults */}
                            <div className="flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                <span>Shared</span>
                            </div>
                            {listing.amenities && listing.amenities.length > 0 && (
                                <>
                                    {listing.amenities.slice(0, 2).map((amenity, i) => (
                                        <div key={i} className="flex items-center gap-1 capitalize">
                                            {amenity.toLowerCase().includes('wifi') ? <Wifi className="w-4 h-4" /> :
                                                amenity.toLowerCase().includes('bed') ? <Bed className="w-4 h-4" /> :
                                                    <span className="w-1 h-1 rounded-full bg-muted-foreground/50 mx-1"></span>}
                                            <span className="truncate max-w-[60px]">{amenity}</span>
                                        </div>
                                    ))}
                                    {listing.amenities.length > 2 && (
                                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">+{listing.amenities.length - 2}</span>
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
