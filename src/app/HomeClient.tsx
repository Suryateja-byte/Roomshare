"use client";

import React, { Suspense, lazy } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Home,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const SearchForm = lazy(() => import("@/components/SearchForm"));

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
        <div className="w-full rounded-[1.375rem] bg-surface-container-lowest p-6 text-center shadow-ambient-lg">
          <h1 className="font-display text-4xl font-normal tracking-tight text-on-surface md:text-5xl">
            Better Rooms. Better People.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-on-surface-variant">
            Verified roommates. Real listings. People who actually show up to
            the tour.
          </p>
          <Button asChild className="mt-6 rounded-full">
            <Link href="/search">Start searching</Link>
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

function AuthCTA() {
  const { data: session } = useSession();

  if (session?.user) return null;

  return (
    <div className="animate-editorial-rise flex flex-col items-center gap-3 text-sm md:flex-row md:items-center md:justify-between md:gap-6">
      <p className="text-on-surface-variant">
        Join <span className="font-semibold text-on-surface">50,000+</span>{" "}
        people who found their perfect match
      </p>
      <div className="flex items-center gap-2">
        <span className="text-on-surface">New here?</span>
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-surface-container-lowest px-3 py-1 font-semibold text-primary shadow-[0_12px_30px_rgba(29,30,28,0.14)] transition-colors hover:border-primary/45 hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas"
        >
          Create an account
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export default function HomeClient() {
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;

  return (
    <div className="flex flex-col bg-surface-canvas text-on-surface font-body">
      <HeroSection />
      <WhyBand />
      <HowItWorks isLoggedIn={isLoggedIn} />
    </div>
  );
}

function HeroSection() {
  return (
    <section
      aria-label="Search for rooms"
      className="home-hero-section relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-surface-canvas pb-5 pt-[4.75rem] md:h-[100svh] md:min-h-0 md:pb-8 md:pt-24"
    >
      <picture className="home-hero-photo absolute inset-0 opacity-100 md:opacity-100">
        <source
          media="(max-width: 767px)"
          type="image/avif"
          sizes="100vw"
          srcSet="/images/home/hero-living-room-mobile-400.avif 400w, /images/home/hero-living-room-mobile-800.avif 800w, /images/home/hero-living-room-mobile-1024.avif 1024w"
        />
        <source
          media="(max-width: 767px)"
          type="image/webp"
          sizes="100vw"
          srcSet="/images/home/hero-living-room-mobile-400.webp 400w, /images/home/hero-living-room-mobile-800.webp 800w, /images/home/hero-living-room-mobile-1024.webp 1024w"
        />
        <source
          media="(max-width: 767px)"
          type="image/png"
          sizes="100vw"
          srcSet="/images/home/hero-living-room-mobile.png 1024w"
        />
        <source
          type="image/avif"
          sizes="100vw"
          srcSet="/images/home/hero-living-room-800.avif 800w, /images/home/hero-living-room-1200.avif 1200w, /images/home/hero-living-room-1600.avif 1600w, /images/home/hero-living-room-1774.avif 1774w"
        />
        <source
          type="image/webp"
          sizes="100vw"
          srcSet="/images/home/hero-living-room-800.webp 800w, /images/home/hero-living-room-1200.webp 1200w, /images/home/hero-living-room-1600.webp 1600w, /images/home/hero-living-room-1774.webp 1774w"
        />
        <img
          src="/images/home/hero-living-room.png"
          alt=""
          width={1774}
          height={887}
          className="home-hero-photo-img h-full w-full object-cover"
          fetchPriority="high"
          loading="eager"
          decoding="async"
        />
      </picture>
      <div
        aria-hidden="true"
        className="home-hero-wash absolute inset-0 bg-[linear-gradient(90deg,rgb(251_249_244/0.98)_0%,rgb(251_249_244/0.91)_43%,rgb(251_249_244/0.38)_76%,rgb(251_249_244/0.04)_100%)] md:bg-[linear-gradient(90deg,rgb(251_249_244/0.98)_0%,rgb(251_249_244/0.93)_31%,rgb(251_249_244/0.68)_48%,rgb(251_249_244/0.16)_70%,rgb(251_249_244/0.03)_100%)]"
      />

      <div className="home-hero-frame relative z-10 flex w-full flex-1 flex-col justify-between gap-6 md:gap-8">
        <div className="home-hero-top w-full">
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,0.56fr)_minmax(0,0.44fr)] md:gap-8 lg:gap-12">
            <div className="home-hero-copy max-w-[34rem] md:max-w-[46rem] lg:max-w-[52rem]">
              <div className="animate-editorial-rise mb-5 inline-flex items-center gap-2 text-micro-label text-primary md:mb-4">
                <Sparkles
                  className="hidden h-3 w-3 md:block"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span>Find your people</span>
              </div>
              <h1
                className="home-hero-title animate-editorial-rise font-display text-[min(9.2vw,11vh,2.85rem)] font-normal leading-[0.98] tracking-normal text-on-surface sm:text-[4rem] md:text-[min(6.25vw,12vh,6.15rem)]"
                style={{ animationDelay: "80ms" }}
              >
                <span className="block whitespace-nowrap">Better Rooms.</span>
                <em className="block whitespace-nowrap font-normal text-primary">
                  Better People.
                </em>
              </h1>
              <p
                className="home-hero-subtitle animate-editorial-rise mt-4 max-w-[18.5rem] text-[0.95rem] leading-[1.4] text-on-surface-variant md:mt-4 md:max-w-md md:text-[1.05rem] md:leading-relaxed lg:text-lg"
                style={{ animationDelay: "150ms" }}
              >
                Verified roommates. Real listings.
                <br />
                People who actually
                <span className="md:hidden"> show up.</span>
                <span className="hidden md:inline"> show up to the tour.</span>
              </p>
              <div
                className="home-hero-secondary animate-editorial-rise mt-5 grid-cols-1 gap-3 sm:grid-cols-3 md:mt-6 md:max-w-[44rem] md:gap-4"
                style={{ animationDelay: "220ms" }}
              >
                <TrustChip
                  icon={ShieldCheck}
                  title="Verified People"
                  sub="ID & phone checked"
                />
                <TrustChip
                  icon={Home}
                  title="Quality Listings"
                  sub="Hand-checked homes"
                />
                <TrustChip
                  icon={Sparkles}
                  title="Better Matches"
                  sub="Compatibility first"
                />
              </div>
            </div>
            <div className="hidden md:block" aria-hidden="true" />
          </div>
        </div>

        <div className="home-hero-bottom w-full">
          <div
            className="home-hero-search-row animate-editorial-rise w-full"
            style={{ animationDelay: "280ms" }}
          >
            <SearchFormErrorBoundary>
              <Suspense
                fallback={
                  <div className="mx-auto h-[18.5rem] max-w-[22.5rem] rounded-[1.5rem] bg-surface-container-lowest shadow-ambient md:h-[6.25rem] md:max-w-none md:rounded-[1.875rem]">
                    <div className="h-full animate-shimmer rounded-[inherit] bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
                  </div>
                }
              >
                <SearchForm variant="home" />
              </Suspense>
            </SearchFormErrorBoundary>
          </div>

          <div className="home-hero-auth mt-4 md:mt-5">
            <AuthCTA />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustChip({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[rgb(154_64_39/0.08)] text-primary">
        <Icon
          className="h-[1.05rem] w-[1.05rem]"
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[0.8rem] font-semibold text-on-surface">
          {title}
        </div>
        <div className="truncate text-xs text-on-surface-variant">{sub}</div>
      </div>
    </div>
  );
}

function WhyBand() {
  const pillars = [
    {
      icon: UserCheck,
      kicker: "Verified humans",
      title: "No catfish, no ghosts.",
      body: "Every profile starts with ID and phone checks, so messages come from real people with real intent.",
      featured: false,
    },
    {
      icon: Home,
      kicker: "Curated listings",
      title: "Rooms, not inventory.",
      body: "Homes are reviewed for clarity, availability, and the small details that make a tour worth your time.",
      featured: true,
    },
    {
      icon: Sparkles,
      kicker: "Slow matching",
      title: "Compatibility, not queries.",
      body: "Lifestyle signals help surface households where the rent works and the daily rhythm does too.",
      featured: false,
    },
    {
      icon: MessageCircle,
      kicker: "Move-in support",
      title: "Handholds, not helplines.",
      body: "From tour scheduling to first messages, RoomShare keeps the path practical and human.",
      featured: false,
    },
  ];

  return (
    <section
      aria-labelledby="why-roomshare-heading"
      className="bg-surface-container-high py-20 md:py-28"
    >
      <div className="container">
        <div className="mb-14 max-w-2xl md:mb-16">
          <div className="text-micro-label text-primary">Why RoomShare</div>
          <h2
            id="why-roomshare-heading"
            className="mt-4 font-display text-4xl font-normal leading-[1.04] tracking-tight text-on-surface md:text-6xl"
          >
            Cozy spaces. <em className="text-primary">Real</em> people.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-on-surface-variant">
            Four small promises that add up to a move-in you actually look
            forward to.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4 md:gap-0">
          {pillars.map((pillar) => (
            <article
              key={pillar.kicker}
              className={`flex min-h-64 flex-col p-6 md:p-8 ${
                pillar.featured
                  ? "-translate-y-0 rounded-[1.25rem] bg-surface-container-lowest shadow-ghost md:-translate-y-4"
                  : "rounded-[1.25rem] bg-surface-container-lowest md:rounded-none md:bg-transparent"
              }`}
            >
              <div
                className={`mb-5 grid h-14 w-14 place-items-center rounded-2xl text-primary ${
                  pillar.featured
                    ? "bg-primary/10"
                    : "bg-surface-canvas md:bg-surface-container-lowest"
                }`}
              >
                <pillar.icon className="h-6 w-6" strokeWidth={1.6} />
              </div>
              <div className="text-micro-label text-on-surface-variant">
                {pillar.kicker}
              </div>
              <h3 className="mt-2 font-display text-2xl font-normal leading-tight text-on-surface">
                {pillar.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                {pillar.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ isLoggedIn }: { isLoggedIn: boolean }) {
  const steps = [
    {
      n: "01",
      kicker: "Introduce yourself",
      title: "A profile that reads like a letter, not a form.",
      body: "Answer a few warm questions about your mornings, guests, quiet hours, and home rhythm.",
    },
    {
      n: "02",
      kicker: "Meet the household",
      title: "Verified rooms. Real humans who show up.",
      body: "Browse live listings, compare household expectations, and message when the room actually fits.",
    },
    {
      n: "03",
      kicker: "Move in on purpose",
      title: "Lease the room and the rapport together.",
      body: "Start with shared expectations already visible, so the first week feels less like guesswork.",
    },
  ];

  return (
    <section
      aria-labelledby="how-roomshare-heading"
      className="bg-surface-container-high py-20 md:py-28"
    >
      <div className="container grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-20">
        <div>
          <div className="text-micro-label text-primary">How it works</div>
          <h2
            id="how-roomshare-heading"
            className="mt-4 font-display text-4xl font-normal leading-[1.04] tracking-tight text-on-surface md:text-6xl"
          >
            Less <em className="text-primary">guesswork.</em>
            <br />
            Less ghosting.
            <br />
            More <em className="text-primary">actually</em> living there.
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-on-surface-variant">
            RoomShare turns awkward DMs and no-show tours into a slower, clearer
            path toward the right household.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link href={isLoggedIn ? "/profile" : "/signup"}>
                {isLoggedIn ? "Update your profile" : "Create your profile"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/search">See rooms near you</Link>
            </Button>
          </div>
        </div>

        <ol className="flex list-none flex-col gap-2 p-0">
          {steps.map((step, index) => (
            <li
              key={step.n}
              className={`grid gap-5 rounded-[1.25rem] p-6 sm:grid-cols-[auto_1fr] md:p-9 ${
                index === 0
                  ? "bg-surface-container-lowest shadow-ghost"
                  : "bg-surface-canvas"
              }`}
            >
              <div className="w-16 font-display text-5xl italic leading-none tracking-tight text-primary">
                {step.n}
              </div>
              <div>
                <div className="text-micro-label text-on-surface-variant">
                  {step.kicker}
                </div>
                <h3 className="mt-2 font-display text-2xl font-normal leading-tight text-on-surface md:text-3xl">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-xl leading-relaxed text-on-surface-variant">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function PostListingsHomeSections() {
  return (
    <>
      <MatchingSection />
      <StoriesSection />
      <FinalCTA />
    </>
  );
}

function MatchingSection() {
  const traits = [
    ["Mornings", "Slow, quiet", "Slow, quiet", true],
    ["Cleanliness", "Tidy-ish", "Tidy-ish", true],
    ["Guests", "Rarely overnight", "Weekend dinners", false],
    ["Cooking", "Every night", "Shared meals", true],
    ["Quiet hours", "After 10 pm", "After 10 pm", true],
  ] as const;

  return (
    <section
      aria-labelledby="matching-heading"
      className="overflow-hidden bg-[#ded9d0] py-20 md:py-28"
    >
      <div className="container grid items-center gap-12 lg:grid-cols-[5fr_7fr] lg:gap-20">
        <div>
          <div className="text-micro-label text-primary">
            The connection score
          </div>
          <h2
            id="matching-heading"
            className="mt-4 font-display text-4xl font-normal leading-[1.04] tracking-tight text-on-surface md:text-6xl"
          >
            A match, <em className="text-primary">in writing.</em>
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-on-surface-variant">
            Compatibility goes beyond rent and square footage. The small rituals
            matter: quiet hours, shared dinners, guests, and the state of the
            sink.
          </p>
          <ul className="mt-8 flex list-none flex-col gap-3 p-0">
            {[
              "Lifestyle signals without invasive questions",
              "Weighted by what you care about most",
              "Both sides see fit before a message starts",
            ].map((item, index) => (
              <li
                key={item}
                className={`flex items-start gap-3 rounded-2xl p-4 ${
                  index === 0 ? "bg-surface-container-lowest shadow-ghost" : ""
                }`}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary font-display italic text-on-primary">
                  {index + 1}
                </span>
                <span className="text-sm font-medium leading-relaxed text-on-surface">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-ambient-lg md:p-10">
            <div className="mb-7 flex items-center justify-between border-b border-outline-variant/20 pb-6">
              <div>
                <div className="text-micro-label text-on-surface-variant">
                  The match report
                </div>
                <div className="mt-1 font-display text-lg italic text-on-surface-variant">
                  No. 042 · Maya & Jordan
                </div>
              </div>
              <ConnectionRing value={94} />
            </div>

            <div className="mb-7 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <PersonTag name="Maya" role="Grad student · Austin" />
              <div className="font-display text-2xl italic text-on-surface-variant">
                &amp;
              </div>
              <PersonTag name="Jordan" role="Illustrator · Austin" alignRight />
            </div>

            <div className="space-y-2">
              {traits.map(([label, a, b, match], index) => (
                <div
                  key={label}
                  className={`rounded-xl p-3 ${
                    index % 2 ? "bg-surface-canvas" : ""
                  }`}
                >
                  <div className="mb-2 text-center text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
                    {label}
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
                    <span className="text-right text-on-surface">{a}</span>
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-full ${
                        match
                          ? "bg-primary/10 text-primary"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      {match ? <Check className="h-4 w-4" /> : "~"}
                    </span>
                    <span className="text-on-surface">{b}</span>
                  </div>
                </div>
              ))}
            </div>

            <blockquote className="mt-7 rounded-2xl bg-surface-container-high p-5 font-display text-xl italic leading-relaxed text-on-surface">
              “A rare high match. Both prefer quiet evenings and agree on
              weekend rhythms.”
              <footer className="mt-3 font-body text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
                The matching editor
              </footer>
            </blockquote>
          </div>
          <div className="absolute right-4 top-0 -translate-y-1/2 rotate-3 rounded-full bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-on-primary shadow-ambient">
            Recommended
          </div>
        </div>
      </div>
    </section>
  );
}

function ConnectionRing({ value }: { value: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const dash = (value / 100) * circumference;

  return (
    <div className="relative h-[68px] w-[68px]">
      <svg
        width="68"
        height="68"
        viewBox="0 0 68 68"
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          stroke="rgb(27 28 25 / 0.08)"
          strokeWidth="4"
        />
        <circle
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          strokeLinecap="round"
          strokeWidth="4"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-display text-2xl italic tracking-tight text-primary">
        {value}
      </div>
    </div>
  );
}

function PersonTag({
  name,
  role,
  alignRight = false,
}: {
  name: string;
  role: string;
  alignRight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 ${
        alignRight ? "flex-row-reverse text-right" : ""
      }`}
    >
      <div className="grid h-11 w-11 place-items-center rounded-full bg-primary font-display text-lg italic text-on-primary">
        {name[0]}
      </div>
      <div>
        <div className="font-display text-xl tracking-tight text-on-surface">
          {name}
        </div>
        <div className="text-xs text-on-surface-variant">{role}</div>
      </div>
    </div>
  );
}

function StoriesSection() {
  const quotes = [
    {
      q: "I had been on three other apps and every tour was a ghost. On RoomShare I met Jordan on Tuesday and was unpacking by the weekend.",
      name: "Maya K.",
      role: "Moved into a Victorian in East Austin",
    },
    {
      q: "The matching report is oddly practical. It knew we both wanted quiet Sundays before we did.",
      name: "Jordan P.",
      role: "Illustrator, Austin",
      dark: true,
    },
    {
      q: "I listed a spare room on a whim. The tenant I found still lives here two years later.",
      name: "Hana M.",
      role: "Homeowner, Brooklyn",
    },
  ];

  return (
    <section
      aria-labelledby="stories-heading"
      className="bg-surface-canvas py-20 md:py-28"
    >
      <div className="container">
        <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="text-micro-label text-primary">Field notes</div>
            <h2
              id="stories-heading"
              className="mt-4 max-w-3xl font-display text-4xl font-normal leading-[1.04] tracking-tight text-on-surface md:text-6xl"
            >
              Stories from <em className="text-primary">the other side</em> of
              the lease.
            </h2>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {quotes.map((quote) => (
            <figure
              key={quote.name}
              className={`m-0 flex min-h-80 flex-col rounded-[1.25rem] p-7 shadow-ghost md:p-9 ${
                quote.dark
                  ? "bg-on-surface text-surface-canvas md:translate-y-5"
                  : "bg-surface-container-lowest text-on-surface"
              }`}
            >
              <blockquote className="flex-1 font-display text-2xl leading-snug tracking-tight">
                “{quote.q}”
              </blockquote>
              <figcaption className="mt-7 flex items-center gap-3 border-t border-current/10 pt-5">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary font-display italic text-on-primary">
                  {quote.name[0]}
                </div>
                <div>
                  <div className="font-display italic">{quote.name}</div>
                  <div
                    className={`text-xs ${
                      quote.dark
                        ? "text-surface-canvas/60"
                        : "text-on-surface-variant"
                    }`}
                  >
                    {quote.role}
                  </div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-16 grid overflow-hidden rounded-[1.25rem] bg-surface-container-high py-6 md:grid-cols-4 md:py-8">
          {[
            ["94%", "Matches accept the first tour"],
            ["2.4 days", "Average time from match to tour"],
            ["12k", "Verified roommates this season"],
            ["31 cities", "Active across the US & Europe"],
          ].map(([number, label], index) => (
            <div
              key={number}
              className={`px-6 py-5 text-center ${
                index > 0 ? "md:border-l md:border-on-surface/10" : ""
              }`}
            >
              <div className="font-display text-4xl tracking-tight text-on-surface md:text-5xl">
                {number}
              </div>
              <div className="mx-auto mt-2 max-w-44 text-sm leading-relaxed text-on-surface-variant">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;

  return (
    <section
      aria-labelledby="home-final-cta-heading"
      className="bg-surface-canvas py-14 md:py-20"
    >
      <div className="container">
        <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#9a4027_0%,#b9583c_62%,#6b2f1c_100%)] p-8 text-on-primary shadow-[0_40px_80px_-30px_rgb(154_64_39/0.42)] md:p-14 lg:p-20">
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgb(255_225_180/0.35),transparent_65%)]"
          />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
            <div>
              <div className="text-micro-label text-on-primary/70">
                The next chapter
              </div>
              <h2
                id="home-final-cta-heading"
                className="mt-4 max-w-3xl font-display text-4xl font-normal leading-[1.02] tracking-tight md:text-6xl"
              >
                Your next <em>roommate</em> is already writing their profile.
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-on-primary/85">
                Takes three minutes. No credit card, no lease pressure, just the
                start of a better-curated home life.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  asChild
                  className="rounded-full bg-surface-container-lowest text-on-surface hover:bg-surface-canvas"
                >
                  <Link href={isLoggedIn ? "/search" : "/signup"}>
                    {isLoggedIn ? "Browse rooms" : "Create your profile"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="rounded-full border-on-primary/25 bg-transparent text-on-primary hover:bg-on-primary/10 hover:text-on-primary"
                >
                  <Link href={isLoggedIn ? "/listings/create" : "/search"}>
                    {isLoggedIn ? "List your room" : "See rooms near you"}
                  </Link>
                </Button>
              </div>
              <div className="mt-8 flex items-center gap-4">
                <div className="flex">
                  {["#ead7c3", "#c9a685", "#7a5034", "#b58b65"].map(
                    (color, index) => (
                      <span
                        key={color}
                        className="h-9 w-9 rounded-full shadow-[0_0_0_2px_#9a4027]"
                        style={{
                          backgroundColor: color,
                          marginLeft: index === 0 ? 0 : -10,
                        }}
                      />
                    )
                  )}
                </div>
                <div className="text-sm text-on-primary/75">
                  <strong className="text-on-primary">212 people</strong> joined
                  this week
                </div>
              </div>
            </div>

            <div className="rotate-2 rounded-[1.25rem] bg-surface-container-lowest p-3 text-on-surface shadow-[0_30px_60px_-20px_rgb(0_0_0/0.22)]">
              <picture className="block aspect-[4/3] overflow-hidden rounded-2xl">
                <source
                  type="image/avif"
                  sizes="(max-width: 768px) 92vw, 28rem"
                  srcSet="/images/home/hero-living-room-800.avif 800w, /images/home/hero-living-room-1200.avif 1200w"
                />
                <source
                  type="image/webp"
                  sizes="(max-width: 768px) 92vw, 28rem"
                  srcSet="/images/home/hero-living-room-800.webp 800w, /images/home/hero-living-room-1200.webp 1200w"
                />
                <img
                  src="/images/home/hero-living-room.png"
                  alt=""
                  width={1774}
                  height={887}
                  className="h-full w-full object-cover object-center"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <div className="p-4">
                <div className="mb-3 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.14em] text-on-surface-variant">
                  <span>Dispatch from</span>
                  <span>04 · 2026</span>
                </div>
                <p className="font-display text-2xl italic leading-snug">
                  “Moved into a sunny bedroom with a stranger. She is now my
                  emergency contact.”
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
