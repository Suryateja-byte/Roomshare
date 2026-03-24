import { Suspense } from "react";
import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import FeaturedListings from "@/components/FeaturedListings";

export const metadata: Metadata = {
  title: "RoomShare — Find Compatible Roommates & Shared Housing",
  description:
    "Search verified roommates and shared living spaces. Compatible matching, instant messaging, and flexible leases. Find your ideal home today.",
  openGraph: {
    title: "RoomShare — Find Compatible Roommates & Shared Housing",
    description:
      "Search verified roommates and shared living spaces. Compatible matching, instant messaging, and flexible leases.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RoomShare — Find Compatible Roommates & Shared Housing",
    description:
      "Search verified roommates and shared living spaces. Compatible matching, instant messaging, and flexible leases.",
  },
  alternates: {
    canonical: "/",
  },
};

// ISR: Revalidate featured listings every hour — homepage data is not time-critical
export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      <HomeClient />
      <Suspense
        fallback={
          <section className="py-24 md:py-32 bg-white border-t border-zinc-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
                <div className="max-w-2xl">
                  <div className="h-5 w-28 bg-zinc-200 rounded-full mb-6 animate-pulse" />
                  <div className="h-10 w-72 bg-zinc-200 rounded mb-4 animate-pulse" />
                  <div className="h-6 w-96 bg-zinc-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="rounded-xl animate-pulse">
                    <div className="bg-white flex flex-col rounded-none sm:rounded-2xl border border-zinc-200/50 overflow-hidden">
                      <div className="aspect-[16/10] sm:aspect-[4/3] bg-zinc-100" />
                      <div className="flex flex-col flex-1 p-5 sm:p-6">
                        <div className="flex justify-between items-start gap-4 mb-1">
                          <div className="h-5 bg-zinc-200 rounded w-3/4" />
                        </div>
                        <div className="h-4 bg-zinc-200 rounded w-1/2 mt-1 mb-4" />
                        <div className="h-7 bg-zinc-200 rounded w-1/4 mb-5" />
                        <div className="h-px w-full bg-zinc-100 mb-5" />
                        <div className="h-3 bg-zinc-200 rounded w-2/3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        }
      >
        <FeaturedListings />
      </Suspense>
    </>
  );
}
