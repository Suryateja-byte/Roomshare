"use client";

import { LazyMotion, domAnimation, m } from "framer-motion";
import Link from "next/link";
import ListingCard from "@/components/listings/ListingCard";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/lib/motion-variants";

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

export default function FeaturedListingsClient({
  listings,
}: FeaturedListingsClientProps) {
  if (!listings || listings.length === 0) {
    return (
      <LazyMotion features={domAnimation}>
        <section
          data-testid="featured-listings-section"
          className="py-16 md:py-20 bg-surface-canvas"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="text-center"
            >
              <m.h2
                variants={fadeInUp}
                className="font-display text-3xl md:text-5xl font-medium tracking-tight text-on-surface mb-6"
              >
                Be the first to share.
              </m.h2>
              <m.p
                variants={fadeInUp}
                className="text-on-surface-variant text-lg font-light max-w-xl mx-auto mb-10"
              >
                No rooms listed in this area yet. Share your space and find the
                perfect roommate today.
              </m.p>
              <m.div variants={fadeInUp}>
                <Button
                  asChild
                  size="lg"
                  className="rounded-full px-8 h-12 text-base font-medium gap-2"
                >
                  <Link href="/listings/create">
                    List Your Room
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </m.div>
            </m.div>
          </div>
        </section>
      </LazyMotion>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <section
        data-testid="featured-listings-section"
        className="py-16 md:py-20 bg-surface-canvas relative"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <m.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16"
          >
            <div className="max-w-2xl">
              <m.div
                variants={fadeInUp}
                className="font-body text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant mb-6 flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                New Arrivals
              </m.div>
              <m.h2
                variants={fadeInUp}
                className="font-display text-3xl md:text-5xl font-normal tracking-tight text-on-surface mb-4"
              >
                Just listed.
              </m.h2>
              <m.p
                variants={fadeInUp}
                className="text-on-surface-variant text-lg font-light"
              >
                Fresh rooms from verified hosts — updated daily.
              </m.p>
            </div>

            <m.div variants={fadeInUp} className="hidden md:block">
              <Button
                asChild
                variant="ghost"
                className="group rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high px-6 gap-2"
              >
                <Link href="/search">
                  See All Listings{" "}
                  <ArrowRight
                    size={16}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </Link>
              </Button>
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
                  className="h-full"
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
            <Button
              asChild
              variant="outline"
              size="lg"
              className="group w-full rounded-full border-outline-variant/20 hover:bg-surface-canvas"
            >
              <Link href="/search" className="w-full">
                Explore All Listings
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </m.div>
        </div>
      </section>
    </LazyMotion>
  );
}
