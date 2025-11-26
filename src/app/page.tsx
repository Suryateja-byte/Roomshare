import { Suspense } from 'react';
import SearchForm from '@/components/SearchForm';
import { Shield, Users, Coffee, Heart, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white selection:bg-black selection:text-white ">
      {/* Hero Section */}
      <section className="relative pt-20 pb-20 sm:pt-28 sm:pb-28 md:pt-32 md:pb-32 lg:pt-48 lg:pb-40 px-4 sm:px-6 overflow-hidden">
        {/* Background Mesh */}
        <div className="absolute inset-0 -z-10 h-full w-full mesh-bg "></div>
        <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-indigo-50/50 via-purple-50/30 to-transparent -z-10 blur-3xl" />

        <div className="container relative z-10 max-w-7xl mx-auto text-center">

          {/* Badge */}
          <div className="animate-fade-up flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-black/5 bg-white/50 backdrop-blur-sm shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:border-black/10 transition-colors cursor-default">
              <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
              <span className="text-xs font-semibold text-zinc-600 tracking-wide uppercase">Reimagining Shared Living</span>
            </div>
          </div>

          {/* Headline */}
          <h1 className="animate-fade-up delay-100 text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-semibold tracking-tight text-zinc-950 mb-6 sm:mb-8 leading-[1.05]">
            Love where <br className="hidden sm:block" />
            <span className="text-zinc-400 ">you live.</span>
          </h1>

          <p className="animate-fade-up delay-200 text-base sm:text-lg md:text-xl lg:text-2xl text-zinc-500 mb-8 sm:mb-10 md:mb-14 max-w-2xl mx-auto font-light leading-relaxed">
            Curated spaces. Compatible people. <br className="hidden sm:block" />
            The modern way to find your sanctuary.
          </p>

          {/* Floating Search Bar */}
          <div className="animate-fade-up delay-300 relative z-20 max-w-4xl mx-auto mb-10 sm:mb-14 md:mb-20 px-0 sm:px-2">
            <Suspense fallback={<div className="h-20 animate-pulse bg-zinc-100 rounded-full" />}>
              <SearchForm />
            </Suspense>
          </div>

          {/* Hero Visual */}
          <div className="animate-fade-up delay-300 relative w-full max-w-6xl mx-auto">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-[2.5rem] blur-2xl opacity-50"></div>
            <div className="relative aspect-[21/9] rounded-[2rem] overflow-hidden shadow-2xl shadow-indigo-900/10 border border-white/50 bg-zinc-100 ">
              <Image
                src="/hero-image-new.jpg"
                alt="Modern living space"
                fill
                className="object-cover hover:scale-105 transition-transform duration-[2s] ease-out"
                priority
                quality={100}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Strip */}
      <section className="py-10 border-y border-zinc-100 bg-zinc-50/50 ">
        <div className="container mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-8 md:gap-24 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
            <div className="text-lg font-bold text-zinc-400 flex items-center gap-2">
              <Shield className="w-5 h-5" /> Secure Verified
            </div>
            <div className="text-lg font-bold text-zinc-400 flex items-center gap-2">
              <Users className="w-5 h-5" /> 50k+ Roommates
            </div>
            <div className="text-lg font-bold text-zinc-400 flex items-center gap-2">
              <Heart className="w-5 h-5" /> 98% Matches
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-24 md:py-32 bg-white ">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14 md:mb-20">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900 mb-3 sm:mb-4">Everything you need.</h2>
            <p className="text-zinc-500 text-base sm:text-lg font-light">Safety, compatibility, and flexibility built right in.</p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto">
            <FeatureCard
              icon={Shield}
              title="Verified Trust"
              description="Every profile is manually verified. No bots, no scams, just real people."
              delay={0}
            />
            <FeatureCard
              icon={Zap}
              title="Instant Match"
              description="Our algorithm pairs you based on lifestyle, habits, and vibes."
              delay={100}
            />
            <FeatureCard
              icon={Coffee}
              title="Lifestyle Fit"
              description="Filter by sleep schedule, cleanliness, and social preferences."
              delay={200}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 bg-zinc-950 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-indigo-500/10 rounded-full blur-[80px] sm:blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-purple-500/10 rounded-full blur-[80px] sm:blur-[120px] pointer-events-none"></div>

        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-semibold tracking-tight mb-4 sm:mb-6 md:mb-8">
            Ready to find your <br />
            <span className="text-zinc-500">people?</span>
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-zinc-400 mb-8 sm:mb-10 md:mb-12 max-w-xl mx-auto font-light">
            Join the community changing the way the world lives together.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
            <Link href="/signup">
              <Button size="lg" className="h-12 sm:h-14 px-6 sm:px-10 w-full sm:w-auto bg-white text-black hover:bg-zinc-200 text-sm sm:text-base">
                Get Started
              </Button>
            </Link>
            <Link href="/search">
              <Button variant="ghost" size="lg" className="h-12 sm:h-14 px-6 sm:px-10 w-full sm:w-auto text-zinc-400 hover:text-white hover:bg-white/5 text-sm sm:text-base">
                Browse Listings <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// Feature Card Component
function FeatureCard({ icon: Icon, title, description, delay }: { icon: any, title: string, description: string, delay: number }) {
  return (
    <div
      className="group relative p-5 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl bg-zinc-50/50 hover:bg-white border border-zinc-100/50 hover:border-zinc-200/80 transition-all duration-500 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-4 sm:mb-6 inline-flex p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white border border-zinc-100 shadow-sm group-hover:scale-110 transition-transform duration-500">
        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-900 " strokeWidth={1.5} />
      </div>
      <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3 text-zinc-900 tracking-tight">{title}</h3>
      <p className="text-sm sm:text-base text-zinc-500 leading-relaxed font-light">{description}</p>
    </div>
  );
}
