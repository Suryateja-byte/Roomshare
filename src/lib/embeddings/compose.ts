/**
 * Compose semantically rich text from listing fields for embedding.
 * Front-loads title + description (highest signal), then structured attributes.
 *
 * Accepts data from listing_search_docs or joined Listing + Location.
 * Column names use camelCase to match the ListingSearchData interface
 * in search-doc-sync.ts.
 */
export function composeListingText(listing: {
  title: string;
  description: string;
  price: number | string;
  roomType?: string | null;
  amenities?: string[];
  houseRules?: string[];
  leaseDuration?: string | null;
  genderPreference?: string | null;
  householdGender?: string | null;
  householdLanguages?: string[];
  primaryHomeLanguage?: string | null;
  availableSlots?: number | null;
  totalSlots?: number | null;
  address?: string;
  city?: string;
  state?: string;
  moveInDate?: Date | string | null;
  bookingMode?: string | null;
}): string {
  const parts: string[] = [];

  parts.push(listing.title);
  parts.push(listing.description);

  if (listing.roomType) {
    parts.push(`Room type: ${listing.roomType}.`);
  }
  parts.push(`$${listing.price} per month.`);

  if (listing.availableSlots != null && listing.totalSlots != null) {
    parts.push(
      `${listing.availableSlots} of ${listing.totalSlots} slots available.`
    );
  }

  if (listing.amenities?.length) {
    parts.push(`Amenities: ${listing.amenities.join(", ")}.`);
  }

  if (listing.houseRules?.length) {
    parts.push(`House rules: ${listing.houseRules.join(", ")}.`);
  }

  if (listing.leaseDuration) {
    parts.push(`Lease: ${listing.leaseDuration}.`);
  }

  if (listing.genderPreference) {
    parts.push(`Gender preference: ${listing.genderPreference}.`);
  }

  if (listing.householdGender) {
    parts.push(`Household gender: ${listing.householdGender}.`);
  }

  if (listing.householdLanguages?.length) {
    parts.push(`Languages spoken: ${listing.householdLanguages.join(", ")}.`);
  }

  if (listing.bookingMode) {
    parts.push(`Booking mode: ${listing.bookingMode}.`);
  }

  // Use city + state only — full street address is PII per project rules
  // and should not be sent to external APIs (Gemini embedding)
  if (listing.city && listing.state) {
    parts.push(`Located in ${listing.city}, ${listing.state}.`);
  }

  if (listing.moveInDate) {
    const date =
      typeof listing.moveInDate === "string"
        ? listing.moveInDate
        : listing.moveInDate.toISOString().split("T")[0];
    parts.push(`Available from ${date}.`);
  }

  return parts.filter(Boolean).join(" ");
}
