"use client";

import { Shield, Heart, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

// --- Components ---

interface ValueCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

const ValueCard = ({ icon: Icon, title, description }: ValueCardProps) => (
  <div className="group p-8 bg-surface-container-lowest rounded-lg shadow-ambient-sm hover:bg-primary hover:text-white transition-all duration-500 cursor-default">
    <div className="w-12 h-12 bg-surface-container-high rounded-2xl flex items-center justify-center mb-6 shadow-ambient-sm group-hover:bg-primary-container transition-colors">
      <Icon
        className="w-6 h-6 text-on-surface group-hover:text-white transition-colors"
        strokeWidth={1.5}
      />
    </div>
    <h3 className="font-display text-xl font-semibold mb-3 tracking-tight text-on-surface group-hover:text-white">
      {title}
    </h3>
    <p className="text-on-surface-variant leading-relaxed group-hover:text-white/70 transition-colors font-light">
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
    <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-surface-container-high mb-4">
      <Image
        src={image}
        alt={name}
        fill
        sizes="(max-width: 768px) 100vw, 25vw"
        className="object-cover grayscale group-hover:grayscale-0 transition-all duration-700 ease-out transform group-hover:scale-105"
      />
    </div>
    <h4 className="text-lg font-bold text-on-surface">{name}</h4>
    <p className="text-sm text-on-surface-variant">{role}</p>
  </div>
);

// --- Main Page ---

export default function AboutClient() {
  return (
    <div className="min-h-screen bg-surface-container-lowest font-sans selection:bg-on-surface selection:text-surface-container-lowest">
      <div>
        {/* Hero Section */}
        <section className="relative pt-20 pb-32 px-6 overflow-hidden">
          <div className="container mx-auto max-w-5xl text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-outline-variant/20 bg-surface-canvas mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <span className="text-xs font-bold tracking-widest uppercase text-on-surface-variant">
                Our Mission
              </span>
            </div>

            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-semibold tracking-tighter text-on-surface mb-10 leading-[0.95] animate-in fade-in slide-in-from-bottom-6 duration-1000">
              Shared living shouldn&apos;t be a compromise.
            </h1>

            <p className="text-xl md:text-2xl text-on-surface-variant font-light max-w-3xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000">
              We got tired of Craigslist horror stories. So we built the
              roommate platform we wished existed when we were looking.
            </p>
          </div>

          {/* Hero Image */}
          <div className="mt-24 container mx-auto max-w-[1600px] px-0 md:px-6">
            <div className="relative aspect-[21/9] rounded-[3rem] overflow-hidden shadow-ambient-lg">
              <Image
                src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?q=80&w=2832&auto=format&fit=crop"
                alt="Friends hanging out in apartment"
                fill
                priority
                sizes="(max-width: 768px) 100vw, (max-width: 1600px) 90vw, 1600px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-on-surface/10"></div>
            </div>
          </div>
        </section>

        {/* Story Section */}
        <section className="py-24 px-6 bg-surface-canvas">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-on-surface mb-6 tracking-tight">
              The old way was broken.
            </h2>
            <div className="space-y-6 text-lg text-on-surface-variant font-light leading-relaxed max-w-2xl mx-auto">
              <p>
                For years, finding a roommate meant scrolling through sketchy
                forums, dealing with ghosting, and hoping the stranger you moved
                in with wasn&apos;t a nightmare.
              </p>
              <p>
                We believed there had to be a better way. A way to prioritize{" "}
                <strong className="text-on-surface font-medium">
                  safety
                </strong>
                ,{" "}
                <strong className="text-on-surface font-medium">
                  compatibility
                </strong>
                , and{" "}
                <strong className="text-on-surface font-medium">
                  trust
                </strong>{" "}
                before you ever sign a lease.
              </p>
              <p>
                RoomShare isn&apos;t just about splitting rent. It&apos;s about
                knowing who you&apos;re living with before you sign anything.
              </p>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-32 px-6 bg-surface-container-lowest">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-20">
              <h2 className="font-display text-4xl font-bold text-on-surface tracking-tight mb-4">
                What we won&apos;t compromise on.
              </h2>
              <p className="text-on-surface-variant text-lg">
                Three things we check every decision against.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <ValueCard
                icon={Shield}
                title="Safety First"
                description="ID checks, phone verification, and rental history — before anyone can message you. No shortcuts."
              />
              <ValueCard
                icon={Heart}
                title="Human Connection"
                description="Matching on lifestyle, not just budget. Because the person who leaves dishes in the sink matters more than the rent split."
              />
              <ValueCard
                icon={Sparkles}
                title="Standard of Living"
                description="Every listing has real photos and accurate details. If a place doesn't meet our standards, it doesn't go up."
              />
            </div>
          </div>
        </section>

        {/* Team Section */}
        <section className="py-24 px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="flex justify-between items-end mb-16">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-on-surface tracking-tight">
                Meet the team.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <TeamMember
                name="Suryatheja Deverakonda"
                role="Founder & Creator"
                image="/images/team/surya.webp"
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 bg-primary text-white">
          <div className="container mx-auto max-w-4xl text-center py-12">
            <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tighter mb-8">
              Stop scrolling. Start living.
            </h2>
            <p className="text-xl text-white/60 mb-12 max-w-2xl mx-auto font-light">
              Set up your profile in 2 minutes. Browse verified rooms
              tonight. Move in when you&apos;re ready.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="px-10 py-4 bg-white text-primary rounded-full font-bold hover:bg-white/90 transition-colors"
              >
                Create Your Profile
              </Link>
              <Link
                href="/search"
                className="px-10 py-4 bg-transparent border border-white/30 text-white rounded-full font-bold hover:bg-white/10 transition-colors"
              >
                See Rooms Near You
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
