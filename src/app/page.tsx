import { Suspense } from "react";
import type { Metadata } from "next";
import HomeClient, { PostListingsHomeSections } from "./HomeClient";
import FeaturedListings from "@/components/FeaturedListings";
import FeaturedListingsSkeleton from "@/components/FeaturedListingsSkeleton";

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
      <Suspense fallback={<FeaturedListingsSkeleton />}>
        <FeaturedListings />
      </Suspense>
      <PostListingsHomeSections />
    </>
  );
}
