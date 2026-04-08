"use client";

import React, { Suspense, useRef, lazy } from "react";
import dynamic from "next/dynamic";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
const SearchForm = lazy(() => import("@/components/SearchForm"));
import { Button } from "@/components/ui/button";
import { ShieldCheck, Zap, Coffee, ArrowRight } from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/motion-variants";

const EditorialLivingRoomHero = dynamic(
  () => import("@/components/home/EditorialLivingRoomHero"),
  {
    ssr: false,
    loading: () => (
      <section
        aria-label="Search for rooms"
        className="relative min-h-[60dvh] md:min-h-[70dvh] flex flex-col justify-center bg-surface-canvas"
      >
        <div className="flex items-center justify-center h-full">
          <span className="font-display text-on-surface-variant text-lg animate-pulse">
            Loading...
          </span>
        </div>
      </section>
    ),
  },
);

class SearchFormErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full max-w-5xl mx-auto px-4 py-16 text-center">
          <h1 className="font-display text-4xl md:text-5xl font-normal tracking-tight text-on-surface mb-4">
            Find Your People, Not Just a Place
          </h1>
          <p className="text-on-surface-variant text-lg mb-6">
            Verified roommates. Real listings. People who actually show up to the tour.
          </p>
          <a
            href="/search"
            className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-medium hover:opacity-90 transition-opacity"
          >
            Start searching &rarr;
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthCTA() {
  const { data: session, status } = useSession();
  const isLoggedIn = !!session?.user;

  if (status === "loading" || isLoggedIn) return null;

  return (
    <m.div
      variants={fadeInUp}
      className="mt-8 flex items-center justify-center gap-3 text-sm bg-surface-container-high/50 rounded-full px-6 py-3"
    >
      <span className="text-on-surface-variant">New here?</span>
      <Link
        href="/signup"
        className="font-medium text-primary hover:underline underline-offset-4 transition-colors"
      >
        Create an account
      </Link>
    </m.div>
  );
}

export default function HomeClient() {
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;
  const searchFormRef = useRef<HTMLDivElement>(null);

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex flex-col bg-surface-canvas text-on-surface font-body">
        {/* ================================================================
            HERO SECTION — Immersive 3D Editorial Living Room
            ================================================================ */}
        <EditorialLivingRoomHero>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="flex flex-col items-center text-center">
              <m.div
                initial="hidden"
                animate="visible"
                variants={staggerContainer}
                className="w-full flex flex-col items-center"
              >
                {/* Editorial label */}
                <m.div
                  variants={fadeInUp}
                  className="font-body text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant mb-6"
                >
                  Find Your People
                </m.div>

                {/* Newsreader display heading with italic emphasis */}
                <m.h1
                  variants={fadeInUp}
                  className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-[5.5rem] font-normal tracking-tight text-on-surface mb-6 leading-[1.05] text-balance"
                >
                  Finding <em className="italic">Your</em> People,{" "}
                  <br className="hidden lg:block" />
                  Not Just a Place
                </m.h1>

                {/* Manrope subheading */}
                <m.p
                  variants={fadeInUp}
                  className="text-lg md:text-xl text-on-surface-variant mb-10 max-w-2xl mx-auto leading-relaxed"
                >
                  Verified roommates. Real listings. People who actually show
                  up to the tour.
                </m.p>

                {/* Glassmorphism search bar */}
                <m.div
                  variants={fadeInUp}
                  ref={searchFormRef}
                  className="w-full mx-auto max-w-4xl relative z-20"
                >
                  <div className="bg-transparent border-0 shadow-none p-0 md:bg-surface-container-lowest md:backdrop-blur-xl md:border md:border-outline-variant/30 md:rounded-2xl md:shadow-ambient md:p-2 lg:p-3">
                    <SearchFormErrorBoundary>
                      <Suspense
                        fallback={
                          <div className="h-16 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%] rounded-xl" />
                        }
                      >
                        <SearchForm variant="home" />
                      </Suspense>
                    </SearchFormErrorBoundary>
                  </div>
                </m.div>

                {/* CTA for logged-out users */}
                <AuthCTA />
              </m.div>
            </div>
          </div>
        </EditorialLivingRoomHero>

        {/* ================================================================
            FEATURES — "Cozy Spaces, Real People"
            Surface container high background for tonal shift
            ================================================================ */}
        <section
          aria-label="Why RoomShare"
          className="py-16 md:py-20 bg-surface-container-high"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
              className="text-center mb-16 md:mb-20"
            >
              <m.div
                variants={fadeInUp}
                className="font-body text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant mb-6"
              >
                Why RoomShare
              </m.div>
              <m.h2
                variants={fadeInUp}
                className="font-display text-3xl md:text-5xl font-normal tracking-tight text-on-surface mb-6"
              >
                Cozy Spaces, Real People
              </m.h2>
              <m.p
                variants={fadeInUp}
                className="text-on-surface-variant text-lg font-light max-w-xl mx-auto"
              >
                Less guesswork. Less ghosting. More &ldquo;I actually like
                living here.&rdquo;
              </m.p>
            </m.div>

            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 lg:gap-10 max-w-5xl mx-auto"
            >
              <FeatureCard
                icon={ShieldCheck}
                title="No catfishing"
                description="Every person verifies their ID and phone number before they can message you. No bots, no fakes."
              />
              <FeatureCard
                icon={Zap}
                title="Matched on what matters"
                description="Sleep schedule, noise tolerance, guests policy — not just budget. You'll know before you visit."
              />
              <FeatureCard
                icon={Coffee}
                title="Filters that actually help"
                description="Clean freak or organized chaos? Early bird or night owl? Set your deal-breakers upfront."
              />
            </m.div>
          </div>
        </section>

        {/* ================================================================
            CTA SECTION — "Your next roommate is already here"
            Surface canvas with generous whitespace
            ================================================================ */}
        <section
          aria-label="Get started"
          className="py-16 pb-24 md:py-20 md:pb-20 bg-surface-canvas text-center"
        >
          <m.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeInUp}
            className="max-w-3xl mx-auto px-4 sm:px-6"
          >
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-normal tracking-tight mb-6 text-on-surface text-balance">
              {isLoggedIn
                ? "Find your perfect room."
                : "Your next roommate is already here."}
            </h2>
            <p className="text-lg text-on-surface-variant mb-10 max-w-xl mx-auto font-light">
              {isLoggedIn
                ? "Browse verified listings and connect with roommates who match your lifestyle."
                : "Takes 2 minutes to set up a profile. Then start browsing rooms tonight."}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                asChild
                size="lg"
                className="w-full sm:w-auto rounded-full px-8 h-12 text-base font-medium"
              >
                <Link href={isLoggedIn ? "/search" : "/signup"}>
                  {isLoggedIn ? "Browse Rooms" : "Create Your Profile"}
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="group w-full sm:w-auto rounded-full px-8 h-12 text-base font-medium gap-2 bg-surface-container-high sm:bg-transparent"
              >
                <Link href={isLoggedIn ? "/listings/create" : "/search"}>
                  {isLoggedIn ? "List Your Room" : "See Rooms Near You"}{" "}
                  <ArrowRight
                    size={16}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </Link>
              </Button>
            </div>
          </m.div>
        </section>
      </div>
    </LazyMotion>
  );
}

/* ================================================================
   FEATURE CARD — Editorial styling
   ================================================================ */
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  title: string;
  description: string;
}) {
  return (
    <m.div
      variants={fadeInUp}
      className="flex flex-col items-center text-center group bg-surface-container-lowest rounded-xl p-6 sm:p-8 shadow-ambient-sm h-full"
    >
      <div
        aria-hidden="true"
        className="mb-6 flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary transition-[transform,background-color,color] duration-200 group-hover:bg-primary group-hover:text-on-primary group-hover:scale-110"
      >
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-display text-lg font-medium mb-3 text-on-surface tracking-tight">
        {title}
      </h3>
      <p className="text-on-surface-variant leading-relaxed">{description}</p>
    </m.div>
  );
}
