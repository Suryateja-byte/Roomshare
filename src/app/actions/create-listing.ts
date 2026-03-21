"use server";

import { logger } from "@/lib/logger";

// P1-15 FIX: Define proper type for listing data returned to client
export type CreateListingData = {
  id: string;
  title: string;
  description: string;
  price: number;
  amenities: string[];
  houseRules: string[];
  totalSlots: number;
  availableSlots: number;
  ownerId: string;
  createdAt: Date;
};

export type CreateListingState = {
  success: boolean;
  error?: string;
  code?: string;
  fields?: Record<string, string>;
  data?: CreateListingData;
};

/**
 * @deprecated Use POST /api/listings instead. This server action is disabled.
 * The export signature is kept for type compatibility only.
 */
export async function createListing(
  _prevState: CreateListingState,
  _formData: FormData
): Promise<CreateListingState> {
  "use server";
  logger.sync.warn(
    "[DEPRECATED] createListing server action invoked — returning error"
  );
  return {
    success: false,
    error: "This server action is deprecated. Use POST /api/listings instead.",
  };
}
