"use server";

import {
  analyzeFilterImpact,
  type FilterParams,
  type FilterSuggestion,
} from "@/lib/data";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIPFromHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { z } from "zod";

const filterParamsSchema = z.object({
  query: z.string().max(200).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  amenities: z.array(z.string().max(100)).max(50).optional(),
  moveInDate: z.string().max(50).optional(),
  leaseDuration: z.string().max(100).optional(),
  houseRules: z.array(z.string().max(100)).max(50).optional(),
  roomType: z.string().max(100).optional(),
  languages: z.array(z.string().max(10)).max(20).optional(),
  genderPreference: z.string().max(50).optional(),
  householdGender: z.string().max(50).optional(),
  bounds: z.object({
    minLat: z.number(),
    maxLat: z.number(),
    minLng: z.number(),
    maxLng: z.number(),
  }).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

/**
 * Server action to lazily fetch filter suggestions
 * Called on-demand when user clicks "Show suggestions" button
 * Reduces DB load by not auto-computing on every zero-result render
 */
export async function getFilterSuggestions(
  params: FilterParams,
): Promise<FilterSuggestion[]> {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  try {
    // Rate limiting
    const headersList = await headers();
    const ip = getClientIPFromHeaders(headersList);
    const rl = await checkRateLimit(ip, 'filterSuggestions', RATE_LIMITS.filterSuggestions);
    if (!rl.success) return [];

    // Zod validation
    const parsed = filterParamsSchema.safeParse(params);
    if (!parsed.success) {
      return [];
    }

    return analyzeFilterImpact(parsed.data as FilterParams);
  } catch (error) {
    logger.sync.warn('getFilterSuggestions failed silently', {
      error: error instanceof Error ? error.name : 'Unknown',
    });
    return [];
  }
}
