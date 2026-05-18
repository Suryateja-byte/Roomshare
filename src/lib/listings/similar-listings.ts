import "server-only";

import { cache } from "react";
import type { Listing } from "@/components/listings/ListingCard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { features } from "@/lib/env";
import { getReadEmbeddingVersion } from "@/lib/embeddings/version";
import {
  getPublicListingDetail,
  type PublicListingDetailResult,
} from "@/lib/listings/public-detail";

/** Row shape returned by get_similar_listings SQL function. */
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

const SIMILAR_LISTING_LIMIT = 4;
const SIMILAR_CANDIDATE_LIMIT = SIMILAR_LISTING_LIMIT * 3;
const SIMILARITY_THRESHOLD = 0.3;

function mapPublicDetailToListing(
  detail: PublicListingDetailResult,
  row: SimilarListingRow
): Listing | null {
  const { listing, publicAvailability } = detail;

  if (!listing.location || !publicAvailability) {
    return null;
  }

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: Number(listing.price),
    images: listing.images,
    location: {
      city: listing.location.city,
      state: listing.location.state,
    },
    amenities: listing.amenities,
    householdLanguages: listing.householdLanguages,
    availableSlots: publicAvailability.effectiveAvailableSlots,
    totalSlots: publicAvailability.totalSlots,
    avgRating: row.avg_rating,
    reviewCount: row.review_count,
    moveInDate: listing.moveInDate ?? undefined,
    publicAvailability,
  };
}

function isListing(value: Listing | null): value is Listing {
  return value !== null;
}

export const getSimilarListingsForListing = cache(
  async function getSimilarListingsForListing(
    listingId: string
  ): Promise<Listing[]> {
    if (!features.semanticSearch) return [];

    try {
      const embeddingVersion = getReadEmbeddingVersion();
      const rows = await prisma.$queryRaw<
        SimilarListingRow[]
      >`SELECT * FROM get_similar_listings(
        ${listingId}, ${embeddingVersion}, ${SIMILAR_CANDIDATE_LIMIT}, ${SIMILARITY_THRESHOLD}
      )`;

      const publicListings = await Promise.all(
        rows.map(async (row): Promise<Listing | null> => {
          try {
            const publicDetail = await getPublicListingDetail(row.id);
            if (!publicDetail?.isPubliclyVisible) {
              return null;
            }

            return mapPublicDetailToListing(publicDetail, row);
          } catch (err) {
            logger.sync.warn("Failed to revalidate similar listing candidate", {
              listingId,
              candidateListingId: row.id,
              error: err instanceof Error ? err.message : String(err),
            });
            return null;
          }
        })
      );

      return publicListings.filter(isListing).slice(0, SIMILAR_LISTING_LIMIT);
    } catch (err) {
      logger.sync.error("Failed to fetch similar listings", {
        listingId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
);
