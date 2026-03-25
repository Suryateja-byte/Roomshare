import { Suspense } from "react";
import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import FeaturedListings from "@/components/FeaturedListings";

export const metadata: Metadata = {
  title: "RoomShare — Find Your People, Not Just a Place",
  description:
    "Verified roommates. Real listings. People who actually show up to the tour. Find compatible shared housing today.",
  openGraph: {
    title: "RoomShare — Find Your People, Not Just a Place",
    description:
      "Verified roommates. Real listings. People who actually show up to the tour.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RoomShare — Find Your People, Not Just a Place",
    description:
      "Verified roommates. Real listings. People who actually show up to the tour.",
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
          <section className="py-16 md:py-20 bg-surface-canvas">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
                <div className="max-w-2xl">
                  <div className="h-5 w-28 bg-surface-container-high rounded-full mb-6 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
                  <div className="h-10 w-72 bg-surface-container-high rounded-lg mb-4 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
                  <div className="h-6 w-96 bg-surface-container-high rounded-lg animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="rounded-lg overflow-hidden">
                    <div className="bg-surface-container-lowest flex flex-col rounded-lg shadow-ambient-sm overflow-hidden">
                      <div className="aspect-[16/10] sm:aspect-[4/3] bg-surface-container-high animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
                      <div className="flex flex-col flex-1 p-5 sm:p-6">
                        <div className="flex justify-between items-start gap-4 mb-1">
                          <div className="h-5 bg-surface-container-high rounded-lg w-3/4 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
                        </div>
                        <div className="h-4 bg-surface-container-high rounded-lg w-1/2 mt-1 mb-4 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
                        <div className="h-7 bg-surface-container-high rounded-lg w-1/4 mb-5 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
                        <div className="h-3 bg-surface-container-high rounded-lg w-2/3 animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]" />
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
