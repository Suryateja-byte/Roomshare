'use client';

import { LazyMotion, domAnimation, m, Variants } from 'framer-motion';
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

const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
};

const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

export default function FeaturedListingsClient({ listings }: FeaturedListingsClientProps) {
    if (!listings || listings.length === 0) {
        return (
            <LazyMotion features={domAnimation}>
            <section className="py-24 md:py-32 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                    <m.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={staggerContainer}
                        className="text-center"
                    >
                        <m.h2 variants={fadeInUp} className="text-3xl md:text-5xl font-medium tracking-tight text-zinc-900 dark:text-white mb-6">
                            Be the first to share.
                        </m.h2>
                        <m.p variants={fadeInUp} className="text-zinc-500 dark:text-zinc-400 text-lg font-light max-w-xl mx-auto mb-10">
                            No rooms listed in this area yet. Share your space and find the perfect roommate today.
                        </m.p>
                        <m.div variants={fadeInUp}>
                            <Link href="/listings/create">
                                <Button size="lg" className="rounded-full px-8 h-12 text-base font-medium gap-2">
                                    List Your Room
                                    <ArrowRight className="w-4 h-4" />
                                </Button>
                            </Link>
                        </m.div>
                    </m.div>
                </div>
            </section>
            </LazyMotion>
        );
    }

    return (
        <LazyMotion features={domAnimation}>
        <section className="py-24 md:py-32 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800/50 relative">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
                <m.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-100px" }}
                    variants={staggerContainer}
                    className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16"
                >
                    <div className="max-w-2xl">
                        <m.div variants={fadeInUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200/50 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-6">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                            New Arrivals
                        </m.div>
                        <m.h2 variants={fadeInUp} className="text-3xl md:text-5xl font-medium tracking-tight text-zinc-900 dark:text-white mb-4">
                            Latest curated spaces.
                        </m.h2>
                        <m.p variants={fadeInUp} className="text-zinc-500 dark:text-zinc-400 text-lg font-light">
                            Find your next home among these hand-picked listings.
                        </m.p>
                    </div>
                    
                    <m.div variants={fadeInUp} className="hidden md:block">
                        <Link href="/search" className="group">
                            <Button variant="ghost" className="rounded-full text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 px-6 gap-2">
                                View all <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </Link>
                    </m.div>
                </m.div>

                <m.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-100px" }}
                    variants={staggerContainer}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10"
                >
                    {listings.map((listing, index) => (
                        <m.div key={listing.id} variants={fadeInUp}>
                            <ListingCard
                                listing={listing}
                                priority={index < 3}
                                className="h-full border-zinc-200/50 dark:border-zinc-800"
                            />
                        </m.div>
                    ))}
                </m.div>

                <m.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                    className="flex justify-center mt-12 md:hidden"
                >
                    <Link href="/search" className="group w-full">
                        <Button variant="outline" size="lg" className="w-full rounded-full border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                            Explore All Listings
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </Link>
                </m.div>
            </div>
        </section>
        </LazyMotion>
    );
}
