"use client";

import { Suspense, useRef, lazy } from "react";
import { LazyMotion, domAnimation, m, Variants } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";

const SearchForm = lazy(() => import("@/components/SearchForm"));
const ScrollAnimation = dynamic(() => import('@/components/ScrollAnimation'), {
    ssr: false,
    loading: () => (
        <div className="relative bg-zinc-950" style={{ height: '200vh' }}>
            <div className="sticky top-0 h-screen" />
        </div>
    ),
});
import { Button } from "@/components/ui/button";
import { ShieldCheck, Zap, Coffee, ArrowRight } from "lucide-react";

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

export default function HomeClient() {
  const { data: session, status } = useSession();
  const isLoggedIn = !!session?.user;
  const searchFormRef = useRef<HTMLDivElement>(null);

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-900">
        {/* Hero Section */}
        <section className="relative pt-32 pb-24 md:pt-40 md:pb-24 min-h-screen flex flex-col justify-center overflow-x-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full z-10">
            <div className="flex flex-col items-center text-center">
              
              {/* Center Content */}
              <div className="w-full flex flex-col items-center justify-center mb-12 md:mb-16">
                <m.div
                  initial="hidden"
                  animate="visible"
                  variants={staggerContainer}
                  className="w-full flex flex-col items-center"
                >
                  <m.div
                    variants={fadeInUp}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200/50 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-[0.15em] mb-8"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    Now in 12 cities
                  </m.div>

                  <m.h1
                    variants={fadeInUp}
                    className="text-5xl md:text-7xl lg:text-[5.5rem] font-medium tracking-tighter text-zinc-900 dark:text-white mb-6 leading-[1.05]"
                  >
                    Love where <br className="hidden md:block" />
                    you live.
                  </m.h1>

                  <m.p
                    variants={fadeInUp}
                    className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400 mb-10 max-w-2xl mx-auto font-light leading-relaxed"
                  >
                    Verified roommates. Real listings. People who actually
                    show up to the tour.
                  </m.p>

                  <m.div
                    variants={fadeInUp}
                    ref={searchFormRef}
                    className="w-full mx-auto max-w-4xl relative z-20"
                  >
                    <Suspense
                      fallback={
                        <div className="h-16 animate-pulse bg-zinc-100 dark:bg-zinc-900 rounded-2xl" />
                      }
                    >
                      <SearchForm />
                    </Suspense>
                  </m.div>

                  {status !== "loading" && !isLoggedIn && (
                    <m.div
                      variants={fadeInUp}
                      className="mt-8 flex items-center justify-center gap-3 text-sm"
                    >
                      <span className="text-zinc-400">New here?</span>
                      <Link
                        href="/signup"
                        className="font-medium text-zinc-900 dark:text-white hover:underline underline-offset-4 transition-colors"
                      >
                        Create an account
                      </Link>
                    </m.div>
                  )}
                </m.div>
              </div>

              {/* Cinematic Showcase Image below the search bar */}
              <div className="w-full max-w-6xl mx-auto mt-4 md:mt-8 hidden md:block">
                <m.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="relative aspect-[21/9] rounded-[2rem] overflow-hidden bg-zinc-100 dark:bg-zinc-900 shadow-2xl shadow-zinc-900/20"
                >
                  <Image
                    src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80"
                    alt="Modern Living Space"
                    fill
                    priority
                    sizes="100vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>
                </m.div>
              </div>

            </div>
          </div>
        </section>

        {/* Scroll Animation — "Walk through the door" experience */}
        <ScrollAnimation />

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
              <m.h2
                variants={fadeInUp}
                className="text-3xl md:text-5xl font-medium tracking-tight text-zinc-900 dark:text-white mb-6"
              >
                Why people switch to RoomShare.
              </m.h2>
              <m.p
                variants={fadeInUp}
                className="text-zinc-500 dark:text-zinc-400 text-lg font-light max-w-xl mx-auto"
              >
                Less guesswork. Less ghosting. More &ldquo;I actually like
                living here.&rdquo;
              </m.p>
            </m.div>

            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-12 max-w-5xl mx-auto"
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

        {/* CTA Section */}
        <section className="py-24 md:py-32 bg-white dark:bg-zinc-950 text-center">
          <m.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl mx-auto px-4 sm:px-6"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight mb-6 text-zinc-900 dark:text-white">
              Your next roommate is already here.
            </h2>
            <p className="text-lg text-zinc-500 dark:text-zinc-400 mb-10 max-w-xl mx-auto font-light">
              Takes 2 minutes to set up a profile. Then start browsing rooms tonight.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                asChild
                size="lg"
                className="w-full sm:w-auto rounded-full px-8 h-12 text-base font-medium"
              >
                <Link href="/signup">Create Your Profile</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="group w-full sm:w-auto rounded-full px-8 h-12 text-base font-medium gap-2 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <Link href="/search">
                  See Rooms Near You{" "}
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
      className="flex flex-col items-center text-center group"
    >
      <div className="mb-6 flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white transition-colors group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-lg font-medium mb-3 text-zinc-900 dark:text-white tracking-tight">
        {title}
      </h3>
      <p className="text-zinc-500 dark:text-zinc-400 font-light leading-relaxed">
        {description}
      </p>
    </m.div>
  );
}