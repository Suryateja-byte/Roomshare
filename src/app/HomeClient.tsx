'use client';

import { Suspense, useRef, lazy } from 'react';
import { LazyMotion, domAnimation, m, Variants } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';

const SearchForm = lazy(() => import('@/components/SearchForm'));
import { Button } from '@/components/ui/button';
import { ShieldCheck, Zap, Coffee, ArrowRight } from 'lucide-react';

const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
};

const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.05 }
    }
};

interface HomeClientProps {
    isLoggedIn?: boolean;
}

export default function HomeClient({ isLoggedIn = false }: HomeClientProps) {
    const searchFormRef = useRef<HTMLDivElement>(null);

    return (
        <LazyMotion features={domAnimation}>
            <div className="flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-900">
                {/* Hero Section */}
                <section className="relative pt-32 pb-24 md:pt-48 md:pb-32 min-h-screen flex flex-col justify-center overflow-hidden">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full z-10">
                        <div className="flex flex-col lg:flex-row gap-16 items-center">

                            {/* Left Content */}
                            <div className="flex-1 text-center lg:text-left flex flex-col justify-center">
                                <m.div
                                    initial="hidden"
                                    animate="visible"
                                    variants={staggerContainer}
                                >
                                    <m.div variants={fadeInUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200/50 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-8">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                        Reimagining Shared Living
                                    </m.div>

                                    <m.h1 variants={fadeInUp} className="text-5xl md:text-7xl lg:text-[5.5rem] font-medium tracking-tighter text-zinc-900 dark:text-white mb-6 leading-[1.05]">
                                        Love where <br className="hidden lg:block" />
                                        you live.
                                    </m.h1>

                                    <m.p variants={fadeInUp} className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400 mb-10 max-w-xl mx-auto lg:mx-0 font-light leading-relaxed">
                                        The modern way to find your sanctuary. Curated spaces and compatible people, simplified.
                                    </m.p>

                                    <m.div variants={fadeInUp} ref={searchFormRef} className="w-full mx-auto max-w-2xl lg:mx-0 relative z-20">
                                        <Suspense fallback={<div className="h-16 animate-pulse bg-zinc-100 dark:bg-zinc-900 rounded-2xl" />}>
                                            <SearchForm />
                                        </Suspense>
                                    </m.div>

                                    {!isLoggedIn && (
                                        <m.div variants={fadeInUp} className="mt-8 flex items-center justify-center lg:justify-start gap-3 text-sm">
                                            <span className="text-zinc-400">New here?</span>
                                            <Link href="/signup" className="font-medium text-zinc-900 dark:text-white hover:underline underline-offset-4 transition-colors">
                                                Create an account
                                            </Link>
                                        </m.div>
                                    )}
                                </m.div>
                            </div>

                            {/* Right Visuals */}
                            <div className="flex-1 w-full max-w-xl lg:max-w-none">
                                <m.div
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                    className="relative aspect-[4/5] lg:aspect-[4/4] rounded-[2rem] overflow-hidden bg-zinc-100 dark:bg-zinc-900 shadow-2xl shadow-zinc-900/10"
                                >
                                    <Image
                                        src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80"
                                        alt="Modern Living Space"
                                        fill
                                        priority
                                        sizes="(max-width: 768px) 100vw, 50vw"
                                        className="object-cover"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                                    <div className="absolute bottom-8 left-8">
                                        <p className="text-white/80 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Featured Space</p>
                                        <p className="text-white text-lg font-medium tracking-tight">Downtown Minimalist Loft</p>
                                    </div>
                                </m.div>
                            </div>

                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section className="py-24 md:py-32 bg-zinc-50 dark:bg-zinc-900/20">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6">
                        <m.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: "-100px" }}
                            variants={staggerContainer}
                            className="text-center mb-20"
                        >
                            <m.h2 variants={fadeInUp} className="text-3xl md:text-5xl font-medium tracking-tight text-zinc-900 dark:text-white mb-6">
                                Everything you need.
                            </m.h2>
                            <m.p variants={fadeInUp} className="text-zinc-500 dark:text-zinc-400 text-lg font-light max-w-xl mx-auto">
                                Simplified roommate search so you can focus on finding your perfect home.
                            </m.p>
                        </m.div>

                        <m.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: "-100px" }}
                            variants={staggerContainer}
                            className="grid sm:grid-cols-3 gap-12 max-w-5xl mx-auto"
                        >
                            <FeatureCard
                                icon={ShieldCheck}
                                title="Verified Trust"
                                description="Every profile is manually verified. Real people, real homes, real safety."
                            />
                            <FeatureCard
                                icon={Zap}
                                title="Instant Match"
                                description="Our algorithm pairs you based on lifestyle habits and shared values."
                            />
                            <FeatureCard
                                icon={Coffee}
                                title="Lifestyle Fit"
                                description="Filter by cleanliness, social battery, and morning person vibes."
                            />
                        </m.div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="py-24 md:py-32 px-6 bg-white dark:bg-zinc-950 text-center">
                    <m.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="max-w-3xl mx-auto"
                    >
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight mb-6 text-zinc-900 dark:text-white">
                            Ready to find your people?
                        </h2>
                        <p className="text-lg text-zinc-500 dark:text-zinc-400 mb-10 max-w-xl mx-auto font-light">
                            Join the community changing the way the world lives together.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                            <Link href="/signup">
                                <Button size="lg" className="w-full sm:w-auto rounded-full px-8 h-12 text-base font-medium">
                                    Get Started
                                </Button>
                            </Link>
                            <Link href="/search" className="group">
                                <Button variant="outline" size="lg" className="w-full sm:w-auto rounded-full px-8 h-12 text-base font-medium gap-2 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900">
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
            className="flex flex-col items-center text-center group"
        >
            <div className="mb-6 flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white transition-colors group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                <Icon className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-medium mb-3 text-zinc-900 dark:text-white tracking-tight">{title}</h3>
            <p className="text-zinc-500 dark:text-zinc-400 font-light leading-relaxed">{description}</p>
        </m.div>
    );
}
