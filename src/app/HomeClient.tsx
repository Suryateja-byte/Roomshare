'use client';

import { Suspense, useRef } from 'react';
import { LazyMotion, domAnimation, m, Variants } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import SearchForm from '@/components/SearchForm';
import { Button } from '@/components/ui/button';
import { Shield, Users, Heart, ShieldCheck, Zap, Coffee, ArrowRight } from 'lucide-react';

// Use 'm' (lightweight motion) instead of 'motion' with LazyMotion
// This reduces bundle from ~200KB to ~20KB by only loading DOM animation features

// Animation variants
const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
};

const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

// Filter tags for the search section
const filterTags = ['Move-in Date', 'Lease Duration', 'Room Type', 'Amenities', 'House Rules'];

interface HomeClientProps {
    isLoggedIn?: boolean;
}

export default function HomeClient({ isLoggedIn = false }: HomeClientProps) {
    const searchFormRef = useRef<HTMLDivElement>(null);

    const handleFilterClick = () => {
        // Scroll to search form
        searchFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    return (
        <LazyMotion features={domAnimation}>
        <div className="flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-black font-sans">
            {/* Hero Section */}
            <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden min-h-screen flex flex-col justify-center">
                {/* Background Effects - Light */}
                <div className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50/50 via-purple-50/30 to-transparent dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-transparent"></div>
                <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-indigo-100/50 via-purple-100/30 to-transparent dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-transparent -z-10 blur-3xl"></div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                    <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center">

                        {/* Left Content */}
                        <div className="flex-1 text-center lg:text-left z-10">
                            <m.div
                                initial="hidden"
                                animate="visible"
                                variants={staggerContainer}
                            >
                                {/* Badge */}
                                <m.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-sm mb-8 shadow-sm">
                                    <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 tracking-wide uppercase">Reimagining Shared Living</span>
                                </m.div>

                                {/* Headline */}
                                <m.h1 variants={fadeInUp} className="text-5xl md:text-7xl xl:text-8xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white mb-8 leading-[1.05]">
                                    Love where <br className="hidden lg:block" />
                                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-500 dark:from-white dark:to-zinc-500">you live.</span>
                                </m.h1>

                                {/* Subheadline */}
                                <m.p variants={fadeInUp} className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-6 max-w-xl mx-auto lg:mx-0 font-light leading-relaxed">
                                    Curated spaces. Compatible people. The modern way to find your sanctuary.
                                </m.p>

                                {/* Signup CTA for non-logged-in users */}
                                {!isLoggedIn && (
                                    <m.div variants={fadeInUp} className="mb-8">
                                        <div className="inline-flex flex-col sm:flex-row gap-3 p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/50 dark:to-purple-950/50 border border-indigo-100 dark:border-indigo-900/50">
                                            <div className="flex-1 text-left">
                                                <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">
                                                    🏠 Start your journey today
                                                </p>
                                                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                                    No fees • Verified users • Flexible leases
                                                </p>
                                            </div>
                                            <div className="flex gap-2 items-center">
                                                <Link href="/signup">
                                                    <Button className="h-10 px-6 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-lg shadow-indigo-500/20 transition-all">
                                                        Sign Up Free
                                                    </Button>
                                                </Link>
                                                <Link href="/login">
                                                    <Button variant="ghost" className="h-10 px-4 rounded-full text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950 font-medium text-sm">
                                                        Log In
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    </m.div>
                                )}

                                {/* Search Component */}
                                <m.div variants={fadeInUp} ref={searchFormRef} className="w-full mx-auto max-w-2xl lg:mx-0">
                                    <Suspense fallback={<div className="h-20 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-3xl" />}>
                                        <SearchForm />
                                    </Suspense>
                                </m.div>

                                {/* Filter Tags */}
                                <m.div variants={fadeInUp} className="mt-6 flex flex-wrap justify-center lg:justify-start gap-2">
                                    {filterTags.map((filter, i) => (
                                        <button
                                            key={i}
                                            onClick={handleFilterClick}
                                            className="px-4 py-2 text-sm font-medium rounded-full border transition-colors bg-white dark:bg-zinc-800 text-zinc-700 dark:text-white border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                        >
                                            {filter}
                                        </button>
                                    ))}
                                </m.div>
                            </m.div>
                        </div>

                        {/* Right Visuals (Bento Grid) */}
                        <div className="flex-1 w-full max-w-xl lg:max-w-none">
                            <m.div
                                className="grid grid-cols-5 gap-4"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.8, delay: 0.2 }}
                            >
                                {/* Main Image */}
                                <div className="col-span-3 aspect-[16/10] rounded-3xl overflow-hidden relative group shadow-2xl shadow-zinc-900/10 dark:shadow-indigo-950/30 border border-zinc-200 dark:border-zinc-800">
                                    <Image
                                        src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80"
                                        alt="Modern Living Room"
                                        fill
                                        priority
                                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 60vw, 50vw"
                                        className="object-cover group-hover:scale-105 transition-transform duration-normal ease-out"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
                                </div>

                                {/* Secondary Stack */}
                                <div className="col-span-2 grid grid-rows-2 gap-4">
                                    {/* Secondary Image */}
                                    <div className="relative aspect-auto rounded-3xl overflow-hidden shadow-xl border border-zinc-200 dark:border-zinc-800 group">
                                        <Image
                                            src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
                                            alt="Cozy Interior"
                                            fill
                                            sizes="(max-width: 768px) 50vw, 20vw"
                                            className="object-cover group-hover:scale-105 transition-transform duration-normal ease-out"
                                        />
                                    </div>

                                    {/* Stats Card */}
                                    <div className="relative aspect-auto rounded-3xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-center p-4 overflow-hidden group">
                                        <div className="absolute inset-0 bg-indigo-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                                        <div className="z-10">
                                            <p className="text-3xl font-bold text-zinc-900 dark:text-white mb-1">50k+</p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Roommates</p>
                                            <div className="flex -space-x-2 justify-center">
                                                {[1, 2, 3, 4].map(i => (
                                                    <div key={i} className="w-6 h-6 rounded-full border border-white dark:border-zinc-900 bg-zinc-100 dark:bg-zinc-800 overflow-hidden relative">
                                                        <Image
                                                            src={`https://i.pravatar.cc/100?img=${i + 10}`}
                                                            alt="User"
                                                            fill
                                                            sizes="24px"
                                                            className="object-cover"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </m.div>
                        </div>

                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <m.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="py-10 border-y border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
            >
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-wrap justify-center items-center gap-8 md:gap-0">

                        <div className="flex items-center gap-2.5 px-10">
                            <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                                <span className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide">Secure</span>
                                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Verified</span>
                            </div>
                        </div>

                        <div className="hidden md:block w-px h-8 bg-zinc-300 dark:bg-zinc-700"></div>

                        <div className="flex items-center gap-2.5 px-10">
                            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                                <span className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide">50K+</span>
                                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Roommates</span>
                            </div>
                        </div>

                        <div className="hidden md:block w-px h-8 bg-zinc-300 dark:bg-zinc-700"></div>

                        <div className="flex items-center gap-2.5 px-10">
                            <Heart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                                <span className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide">98%</span>
                                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Match Rate</span>
                            </div>
                        </div>

                    </div>
                </div>
            </m.section>

            {/* Features Section */}
            <section className="py-24 md:py-32 bg-white dark:bg-zinc-950">
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                    <m.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={staggerContainer}
                        className="text-center mb-16"
                    >
                        <m.h2 variants={fadeInUp} className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white mb-4">
                            Everything you need.
                        </m.h2>
                        <m.p variants={fadeInUp} className="text-zinc-500 dark:text-zinc-400 text-lg font-light">
                            Safety, compatibility, and flexibility built right in.
                        </m.p>
                    </m.div>

                    <m.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={staggerContainer}
                        className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-6xl mx-auto"
                    >
                        <FeatureCard
                            icon={ShieldCheck}
                            title="Verified Trust"
                            description="Every profile is manually verified. No bots, no scams, just real people."
                        />
                        <FeatureCard
                            icon={Zap}
                            title="Instant Match"
                            description="Our AI algorithm pairs you based on lifestyle, habits, and vibes."
                        />
                        <FeatureCard
                            icon={Coffee}
                            title="Lifestyle Fit"
                            description="Filter by sleep schedule, cleanliness, and social preferences."
                        />
                    </m.div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 px-6 bg-zinc-900 dark:bg-zinc-950 text-white relative overflow-hidden">
                {/* Background Blurs */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none"></div>

                <m.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="max-w-4xl mx-auto text-center relative z-10"
                >
                    <h2 className="text-4xl md:text-5xl lg:text-7xl font-semibold tracking-tight mb-8 text-white">
                        Ready to find your <br />
                        <span className="text-indigo-400">people?</span>
                    </h2>
                    <p className="text-xl text-zinc-400 mb-12 max-w-xl mx-auto font-light">
                        Join the community changing the way the world lives together.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <Link href="/signup">
                            <Button className="h-14 px-10 w-full sm:w-auto rounded-full bg-white text-zinc-950 font-medium text-base shadow-lg shadow-white/10 hover:shadow-xl transition-all duration-300 active:scale-[0.98] hover:bg-zinc-100">
                                Get Started
                            </Button>
                        </Link>
                        <Link href="/search" className="group">
                            <Button variant="ghost" className="h-14 px-10 w-full sm:w-auto rounded-full text-zinc-400 hover:text-white hover:bg-white/10 font-medium text-base transition-all duration-200 flex items-center justify-center gap-2">
                                Browse Listings <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </Link>
                    </div>
                </m.div>
            </section>
        </div>
        </LazyMotion>
    );
}

// Feature Card Component
function FeatureCard({
    icon: Icon,
    title,
    description
}: {
    icon: React.ComponentType<{ className?: string; size?: number }>;
    title: string;
    description: string;
}) {
    return (
        <m.div
            variants={fadeInUp}
            whileHover={{ y: -4 }}
            className="group p-6 rounded-3xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-300 hover:shadow-2xl hover:shadow-zinc-900/5 dark:hover:shadow-black/20"
        >
            <div className="mb-6 inline-flex p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-950 group-hover:border-indigo-200 dark:group-hover:border-indigo-900 transition-all duration-300">
                <Icon className="w-6 h-6 text-zinc-700 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-zinc-900 dark:text-white tracking-tight">{title}</h3>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{description}</p>
        </m.div>
    );
}
