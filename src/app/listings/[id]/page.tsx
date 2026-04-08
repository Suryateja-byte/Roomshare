import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getReviews } from "@/lib/data";
import { Metadata } from "next";
import { auth } from "@/auth";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { sanitizeUnicode } from "@/lib/schemas";
import { features } from "@/lib/env";
import { generateViewToken } from "@/app/api/metrics/hmac";
import ListingPageClient from "./ListingPageClient";

const getListingWithLocation = cache(async (id: string) => {
  return prisma.listing.findUnique({
    where: { id },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          image: true,
          isVerified: true,
          bio: true,
          createdAt: true,
        },
      },
      location: true,
    },
  });
});

/** Row shape returned by get_similar_listings SQL function */
interface SimilarListingRow {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  city: string;
  state: string;
  room_type: string | null;
  available_slots: number;
  total_slots: number;
  amenities: string[];
  household_languages: string[];
  avg_rating: number;
  review_count: number;
  similarity: number;
}

/** Fetch similar listings using vector similarity. Non-critical — returns [] on failure. */
const getSimilarListings = cache(async function getSimilarListings(
  listingId: string
): Promise<SimilarListingRow[]> {
  if (!features.semanticSearch) return [];
  try {
    const rows = await prisma.$queryRaw<
      SimilarListingRow[]
    >`SELECT * FROM get_similar_listings(${listingId}, 4, 0.3)`;
    return rows;
  } catch (err) {
    logger.sync.error("Failed to fetch similar listings", {
      listingId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;

  let listing;
  try {
    listing = await getListingWithLocation(id);
  } catch {
    return { title: "Listing | RoomShare" };
  }

  if (!listing || listing.status !== "ACTIVE") {
    return { title: "Listing Not Found | RoomShare" };
  }

  // Use listing's first image if available, otherwise use default
  const ogImage: string =
    listing.images && listing.images.length > 0
      ? listing.images[0]
      : "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80";

  const title = `Rent this ${sanitizeUnicode(listing.title)} in ${listing.location?.city || "City"} | RoomShare`;
  const description = sanitizeUnicode(listing.description).substring(0, 160);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [ogImage],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    alternates: {
      canonical: `/listings/${id}`,
    },
  };
}

export default async function ListingPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await getListingWithLocation(id);

  if (!listing) {
    notFound();
  }

  let session = null;
  let isOwner = false;
  let isAdmin = false;

  if (listing.status !== "ACTIVE") {
    session = await auth();
    isOwner = session?.user?.id === listing.ownerId;
    isAdmin = session?.user?.isAdmin === true;
    if (!isOwner && !isAdmin) {
      notFound();
    }
  }

  // Start similar listings fetch early (runs in parallel with remaining queries)
  const similarListingsPromise = getSimilarListings(id);

  const [coordinates, acceptedBookings, reviews] = await Promise.all([
    (async () => {
      if (!listing.location) {
        return null;
      }

      try {
        const coordsResult = await prisma.$queryRaw<
          Array<{ lat: number; lng: number }>
        >`
                    SELECT
                        ST_Y(coords::geometry) as lat,
                        ST_X(coords::geometry) as lng
                    FROM "Location"
                    WHERE "listingId" = ${listing.id}
                    AND coords IS NOT NULL
                `;
        if (
          coordsResult.length > 0 &&
          coordsResult[0].lat &&
          coordsResult[0].lng
        ) {
          return {
            lat: Number(coordsResult[0].lat),
            lng: Number(coordsResult[0].lng),
          };
        }
      } catch (error) {
        logger.sync.error("Failed to fetch coordinates", {
          listingId: listing.id,
          error: sanitizeErrorMessage(error),
        });
      }

      return null;
    })(),
    prisma.booking.findMany({
      where: {
        listingId: id,
        status: { in: ["ACCEPTED", "HELD"] },
        endDate: {
          gte: new Date(),
        },
      },
      select: {
        startDate: true,
        endDate: true,
      },
      orderBy: {
        startDate: "asc",
      },
    }),
    getReviews(listing.id),
  ]);

  const similarListingsRaw = await similarListingsPromise;

  // Format booked dates for client - using YYYY-MM-DD to avoid timezone issues
  const bookedDates = acceptedBookings.map((b) => ({
    startDate: b.startDate.toISOString().split("T")[0],
    endDate: b.endDate.toISOString().split("T")[0],
  }));

  const similarListings = similarListingsRaw.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    images: row.images,
    location: { city: row.city, state: row.state },
    amenities: row.amenities,
    householdLanguages: row.household_languages,
    availableSlots: row.available_slots,
    totalSlots: row.total_slots,
    avgRating: row.avg_rating,
    reviewCount: row.review_count,
  }));

  // JSON-LD structured data for search engines.
  // Content uses sanitizeUnicode() for title/description — safe from injection.
  const jsonLd =
    listing.status === "ACTIVE"
      ? {
          "@context": "https://schema.org",
          "@type": "LodgingBusiness",
          name: sanitizeUnicode(listing.title),
          description: sanitizeUnicode(listing.description).substring(0, 300),
          image: listing.images?.[0] || undefined,
          address: listing.location
            ? {
                "@type": "PostalAddress",
                addressLocality: listing.location.city,
                addressRegion: listing.location.state,
              }
            : undefined,
          ...(coordinates
            ? {
                geo: {
                  "@type": "GeoCoordinates",
                  latitude: coordinates.lat,
                  longitude: coordinates.lng,
                },
              }
            : {}),
          offers: {
            "@type": "Offer",
            price: Number(listing.price),
            priceCurrency: "USD",
            availability:
              listing.availableSlots > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/SoldOut",
          },
          ...(reviews.length > 0
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: (
                    reviews.reduce((sum, r) => sum + r.rating, 0) /
                    reviews.length
                  ).toFixed(1),
                  reviewCount: reviews.length,
                  bestRating: 5,
                  worstRating: 1,
                },
              }
            : {}),
        }
      : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          // Server-rendered static JSON — sanitized via sanitizeUnicode(), no XSS risk
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ListingPageClient
        listing={{
          id: listing.id,
          title: listing.title,
          description: listing.description,
          price: Number(listing.price),
          images: listing.images,
          amenities: listing.amenities,
          householdLanguages: listing.householdLanguages,
          totalSlots: listing.totalSlots,
          availableSlots: listing.availableSlots,
          bookingMode: listing.bookingMode ?? "SHARED",
          status: listing.status,
          viewCount: listing.viewCount,
          genderPreference: listing.genderPreference,
          householdGender: listing.householdGender,
          location: listing.location
            ? {
                city: listing.location.city,
                state: listing.location.state,
              }
            : null,
          owner: {
            id: listing.owner.id,
            name: listing.owner.name,
            image: listing.owner.image,
            bio: listing.owner.bio,
            isVerified: listing.owner.isVerified,
            createdAt: listing.owner.createdAt,
          },
          holdTtlMinutes: listing.holdTtlMinutes ?? 15,
          ownerId: listing.ownerId,
        }}
        reviews={reviews}
        isOwner={isOwner}
        isLoggedIn={!!session?.user}
        userHasBooking={false}
        userExistingReview={null}
        bookedDates={bookedDates}
        holdEnabled={features.softHoldsEnabled}
        coordinates={coordinates}
        similarListings={similarListings}
        viewToken={generateViewToken(listing.id)}
      />
    </>
  );
}
