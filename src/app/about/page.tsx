'use client';

import { Shield, Heart, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

// --- Components ---

interface ValueCardProps {
    icon: LucideIcon;
    title: string;
    description: string;
}

const ValueCard = ({ icon: Icon, title, description }: ValueCardProps) => (
    <div className="group p-8 bg-zinc-50 dark:bg-zinc-800 rounded-[2rem] hover:bg-zinc-900 dark:hover:bg-white hover:text-white dark:hover:text-zinc-900 transition-all duration-500 cursor-default">
        <div className="w-12 h-12 bg-white dark:bg-zinc-700 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:bg-zinc-800 dark:group-hover:bg-zinc-200 transition-colors">
            <Icon className="w-6 h-6 text-zinc-900 dark:text-white group-hover:text-white dark:group-hover:text-zinc-900 transition-colors" strokeWidth={1.5} />
        </div>
        <h3 className="text-xl font-semibold mb-3 tracking-tight text-zinc-900 dark:text-white group-hover:text-white dark:group-hover:text-zinc-900">{title}</h3>
        <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed group-hover:text-zinc-400 dark:group-hover:text-zinc-500 transition-colors font-light">
            {description}
        </p>
    </div>
);

interface TeamMemberProps {
    name: string;
    role: string;
    image: string;
}

const TeamMember = ({ name, role, image }: TeamMemberProps) => (
    <div className="group">
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800 mb-4">
            <img
                src={image}
                alt={name}
                className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 ease-out transform group-hover:scale-105"
            />
        </div>
        <h4 className="text-lg font-bold text-zinc-900 dark:text-white">{name}</h4>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{role}</p>
    </div>
);

// --- Main Page ---

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-black">

            <div>
                {/* Hero Section */}
                <section className="relative pt-20 pb-32 px-6 overflow-hidden">
                    <div className="container mx-auto max-w-5xl text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <span className="text-xs font-bold tracking-widest uppercase text-zinc-500 dark:text-zinc-400">Our Mission</span>
                        </div>

                        <h1 className="text-5xl md:text-7xl lg:text-8xl font-semibold tracking-tighter text-zinc-900 dark:text-white mb-10 leading-[0.95] animate-in fade-in slide-in-from-bottom-6 duration-1000">
                            Shared living shouldn&apos;t be a compromise.
                        </h1>

                        <p className="text-xl md:text-2xl text-zinc-500 dark:text-zinc-400 font-light max-w-3xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000">
                            We&apos;re building a future where finding a home means finding your people.
                            Less transactional, more human.
                        </p>
                    </div>

                    {/* Hero Image */}
                    <div className="mt-24 container mx-auto max-w-[1600px] px-0 md:px-6">
                        <div className="relative aspect-[21/9] rounded-[3rem] overflow-hidden shadow-2xl shadow-zinc-200 dark:shadow-zinc-900">
                            <img
                                src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?q=80&w=2832&auto=format&fit=crop"
                                alt="Friends hanging out in apartment"
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/10"></div>
                        </div>
                    </div>
                </section>

                {/* Story Section */}
                <section className="py-24 px-6 bg-zinc-50 dark:bg-zinc-900">
                    <div className="container mx-auto max-w-4xl text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white mb-6 tracking-tight">The old way was broken.</h2>
                        <div className="space-y-6 text-lg text-zinc-500 dark:text-zinc-400 font-light leading-relaxed max-w-2xl mx-auto">
                            <p>
                                For years, finding a roommate meant scrolling through sketchy forums,
                                dealing with ghosting, and hoping the stranger you moved in with wasn&apos;t a nightmare.
                            </p>
                            <p>
                                We believed there had to be a better way. A way to prioritize <strong className="text-zinc-900 dark:text-white font-medium">safety</strong>, <strong className="text-zinc-900 dark:text-white font-medium">compatibility</strong>, and <strong className="text-zinc-900 dark:text-white font-medium">trust</strong> before you ever sign a lease.
                            </p>
                            <p>
                                RoomShare isn&apos;t just about splitting rent. It&apos;s about curating environments where people thrive together.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Values Section */}
                <section className="py-32 px-6 bg-white dark:bg-zinc-950">
                    <div className="container mx-auto max-w-6xl">
                        <div className="text-center mb-20">
                            <h2 className="text-4xl font-bold text-zinc-900 dark:text-white tracking-tight mb-4">Our Principles</h2>
                            <p className="text-zinc-500 dark:text-zinc-400 text-lg">The core values that guide every feature we build.</p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-8">
                            <ValueCard
                                icon={Shield}
                                title="Safety First"
                                description="We don't cut corners on verification. Everyone on RoomShare is real, verified, and vetted."
                            />
                            <ValueCard
                                icon={Heart}
                                title="Human Connection"
                                description="Algorithms are great, but chemistry matters. We design for genuine interactions, not just transactions."
                            />
                            <ValueCard
                                icon={Sparkles}
                                title="Standard of Living"
                                description="We curate listings to ensure every home meets a baseline of comfort, cleanliness, and style."
                            />
                        </div>
                    </div>
                </section>

                {/* Team Section */}
                <section className="py-24 px-6 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="container mx-auto max-w-6xl">
                        <div className="flex justify-between items-end mb-16">
                            <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white tracking-tight">Meet the team.</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                            <TeamMember
                                name="Suryatheja Deverakonda"
                                role="Founder & Creator"
                                image="/images/team/surya.jpg"
                            />
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="py-20 px-6 bg-zinc-900 text-white">
                    <div className="container mx-auto max-w-4xl text-center py-12">
                        <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-8">Ready to find your place?</h2>
                        <p className="text-xl text-zinc-400 mb-12 max-w-2xl mx-auto font-light">
                            Join the community that is redefining what it means to live together in the modern city.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/signup" className="px-10 py-4 bg-white text-zinc-900 rounded-full font-bold hover:bg-zinc-200 transition-colors">
                                Get Started
                            </Link>
                            <Link href="/search" className="px-10 py-4 bg-transparent border border-zinc-700 text-white rounded-full font-bold hover:bg-white/10 transition-colors">
                                Browse Listings
                            </Link>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
}
