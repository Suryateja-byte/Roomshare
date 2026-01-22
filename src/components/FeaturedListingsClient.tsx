'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import ListingCard from '@/components/listings/ListingCard';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Listing {
    id: string;
    title: string;
    description: string;
    price: number;
    images: string[];
    availableSlots: number;
    totalSlots: number;
    amenities: string[];
    houseRules: string[];
    householdLanguages: string[];
    genderPreference?: string;
    householdGender?: string;
    leaseDuration?: string;
    roomType?: string;
    moveInDate?: Date;
    ownerId?: string;
    avgRating?: number;
    reviewCount?: number;
    location: {
        address?: string;
        city: string;
        state: string;
        zip?: string;
        lat: number;
        lng: number;
    };
}

interface FeaturedListingsClientProps {
    listings: Listing[];
}

const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
};

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

export default function FeaturedListingsClient({ listings }: FeaturedListingsClientProps) {
    // Show empty state with CTA when no listings exist
    if (!listings || listings.length === 0) {
        return (
            <section className="py-16 md:py-24 bg-zinc-50 dark:bg-zinc-900/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={staggerContainer}
                        className="text-center"
                    >
                        <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white mb-4">
                            Be the First to List
                        </motion.h2>
                        <motion.p variants={fadeInUp} className="text-zinc-500 dark:text-zinc-400 text-lg font-light max-w-2xl mx-auto mb-8">
                            No rooms listed yet — be the first to share your space with our growing community of roommates.
                        </motion.p>
                        <motion.div variants={fadeInUp}>
                            <Link href="/listings/create">
                                <Button size="lg" className="h-12 px-8 rounded-xl text-base font-medium gap-2">
                                    List Your Room
                                    <ArrowRight className="w-4 h-4" />
                                </Button>
                            </Link>
                        </motion.div>
                    </motion.div>
                </div>
            </section>
        );
    }

    return (
        <section className="py-16 md:py-24 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={staggerContainer}
                    className="text-center mb-12"
                >
                    <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 mb-4">
                        <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Just Listed</span>
                    </motion.div>
                    <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white mb-4">
                        Newest Listings
                    </motion.h2>
                    <motion.p variants={fadeInUp} className="text-zinc-500 dark:text-zinc-400 text-lg font-light max-w-2xl mx-auto">
                        Fresh spaces just added by our community. Find your perfect match before anyone else.
                    </motion.p>
                </motion.div>

                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={staggerContainer}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    {listings.map((listing) => (
                        <motion.div key={listing.id} variants={fadeInUp}>
                            <ListingCard
                                listing={{
                                    id: listing.id,
                                    title: listing.title,
                                    price: listing.price,
                                    description: listing.description,
                                    location: {
                                        city: listing.location.city,
                                        state: listing.location.state,
                                    },
                                    amenities: listing.amenities,
                                    householdLanguages: listing.householdLanguages,
                                    availableSlots: listing.availableSlots,
                                    images: listing.images,
                                    avgRating: listing.avgRating,
                                    reviewCount: listing.reviewCount,
                                }}
                            />
                        </motion.div>
                    ))}
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 }}
                    className="flex justify-center mt-12"
                >
                    <Link href="/search">
                        <Button variant="outline" size="lg" className="group rounded-full px-8">
                            View All Listings
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </Link>
                </motion.div>
            </div>
        </section>
    );
}
