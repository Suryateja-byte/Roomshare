import { z } from "zod";
import { isValidLanguageCode } from "./languages";
import {
  VALID_ROOM_TYPES,
  VALID_LEASE_DURATIONS,
  VALID_GENDER_PREFERENCES,
  VALID_HOUSEHOLD_GENDERS,
  VALID_AMENITIES,
  VALID_HOUSE_RULES,
  VALID_BOOKING_MODES,
} from "./filter-schema";

/**
 * Language code validation schema
 * Validates that a string is a valid ISO 639-1 language code from our supported list
 */
export const languageCodeSchema = z
  .string()
  .refine(isValidLanguageCode, { message: "Invalid language code" });

/**
 * Household languages array validation
 * For "Languages spoken in the house" field
 * - Max 20 languages (reasonable limit)
 * - Each must be a valid language code
 */
export const householdLanguagesSchema = z
  .array(languageCodeSchema)
  .max(20, "Maximum 20 languages allowed")
  .default([]);

/**
 * Optional primary home language validation
 * Single language code or null
 */
export const primaryHomeLanguageSchema = z
  .string()
  .refine(isValidLanguageCode, { message: "Invalid language code" })
  .nullable()
  .optional();

// ============================================
// Listing Enum Validation Schemas
// ============================================
// Strip 'any' from filter enums — 'any' is a filter-only value, not a valid listing value.

const LISTING_ROOM_TYPES = VALID_ROOM_TYPES.filter(
  (v): v is Exclude<typeof v, "any"> => v !== "any"
);
export const listingRoomTypeSchema = z
  .enum(LISTING_ROOM_TYPES as unknown as [string, ...string[]])
  .optional()
  .nullable();

const LISTING_LEASE_DURATIONS = VALID_LEASE_DURATIONS.filter(
  (v): v is Exclude<typeof v, "any"> => v !== "any"
);
export const listingLeaseDurationSchema = z
  .enum(LISTING_LEASE_DURATIONS as unknown as [string, ...string[]])
  .optional()
  .nullable();

const LISTING_GENDER_PREFERENCES = VALID_GENDER_PREFERENCES.filter(
  (v): v is Exclude<typeof v, "any"> => v !== "any"
);
export const listingGenderPreferenceSchema = z
  .enum(LISTING_GENDER_PREFERENCES as unknown as [string, ...string[]])
  .optional()
  .nullable();

const LISTING_HOUSEHOLD_GENDERS = VALID_HOUSEHOLD_GENDERS.filter(
  (v): v is Exclude<typeof v, "any"> => v !== "any"
);
export const listingHouseholdGenderSchema = z
  .enum(LISTING_HOUSEHOLD_GENDERS as unknown as [string, ...string[]])
  .optional()
  .nullable();

const LISTING_BOOKING_MODES = VALID_BOOKING_MODES.filter(
  (v): v is Exclude<typeof v, "any"> => v !== "any"
);
export const listingBookingModeSchema = z
  .enum(LISTING_BOOKING_MODES as unknown as [string, ...string[]])
  .optional()
  .nullable();

// ============================================
// Image URL Validation Schema
// ============================================
// Structural regex: validates URL shape + path + extension. Tighten path to [\w./-]+ (M-S3)
const SUPABASE_IMAGE_URL_PATTERN =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/images\/listings\/[\w./-]+\.(jpg|jpeg|png|gif|webp)$/i;

// Pin Supabase project ref from env to prevent cross-project image injection (M-S3)
function getExpectedSupabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const match = url.match(/^https:\/\/([a-z0-9-]+\.supabase\.co)/);
  return match?.[1] || null;
}

export const supabaseImageUrlSchema = z
  .string()
  .url("Invalid image URL")
  .regex(SUPABASE_IMAGE_URL_PATTERN, "Image must be from Supabase storage")
  .refine((url) => {
    const expectedHost = getExpectedSupabaseHost();
    if (!expectedHost) return false; // Fail-closed: reject if env not configured
    try {
      const parsed = new URL(url);
      return parsed.host === expectedHost;
    } catch {
      return false;
    }
  }, "Image must be from this project's Supabase storage");

// ============================================
// Storage URL Validation Schema (verification docs, etc.)
// ============================================
// Broader than supabaseImageUrlSchema: allows any bucket, image + PDF extensions
const SUPABASE_STORAGE_URL_PATTERN =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[\w-]+\/[\w./-]+\.(jpg|jpeg|png|gif|webp|pdf)$/i;

export const supabaseStorageUrlSchema = z
  .string()
  .url("Invalid document URL")
  .max(2048)
  .regex(SUPABASE_STORAGE_URL_PATTERN, "Document must be from Supabase storage")
  .refine((url) => {
    const expectedHost = getExpectedSupabaseHost();
    if (!expectedHost) return false;
    try {
      const parsed = new URL(url);
      return parsed.host === expectedHost;
    } catch {
      return false;
    }
  }, "Document must be from this project's Supabase storage");

export const listingImagesSchema = z
  .array(supabaseImageUrlSchema)
  .min(1, "At least one image is required")
  .max(10, "Maximum 10 images");

// ============================================
// Move-in Date Validation Schema
// ============================================
export const moveInDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
  .refine((dateStr) => {
    const date = new Date(dateStr + "T00:00:00Z");
    return !isNaN(date.getTime());
  }, "Invalid calendar date")
  .refine((dateStr) => {
    const date = new Date(dateStr + "T00:00:00Z");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return date >= today;
  }, "Move-in date cannot be in the past")
  .refine((dateStr) => {
    const date = new Date(dateStr + "T00:00:00Z");
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 2);
    return date <= maxDate;
  }, "Move-in date cannot be more than 2 years in the future")
  .optional()
  .nullable();

/** Strip zero-width and invisible Unicode characters, NFC-normalize */
export function sanitizeUnicode(str: string): string {
  return str
    .normalize("NFC")
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, "")
    .trim();
}

// Defense-in-depth: reject HTML tags in user-facing text fields (M-D4)
export const noHtmlTags = (val: string) => !/<[^>]*>/.test(val);
export const NO_HTML_MSG = "HTML tags are not allowed";

export const createListingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(100, "Title must be 100 characters or less")
    .transform(sanitizeUnicode)
    .refine(noHtmlTags, NO_HTML_MSG),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(1000, "Description must be 1000 characters or less")
    .transform(sanitizeUnicode)
    .refine(noHtmlTags, NO_HTML_MSG),
  price: z.coerce
    .number()
    .positive("Price must be a positive number")
    .multipleOf(0.01, "Price cannot have fractional cents")
    .max(50000, "Maximum $50,000/month")
    .refine(Number.isFinite, "Must be a valid number"),
  amenities: z
    .string()
    .optional()
    .default("")
    .transform((str) =>
      str
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )
    .pipe(
      z
        .array(z.string().max(50, "Each amenity max 50 chars"))
        .max(20, "Maximum 20 amenities")
        .refine(
          (items) =>
            items.every((item) =>
              VALID_AMENITIES.some(
                (v) => v.toLowerCase() === item.toLowerCase()
              )
            ),
          { message: "Invalid amenity value" }
        )
    ),
  houseRules: z
    .string()
    .optional()
    .default("")
    .transform((str) =>
      str
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )
    .pipe(
      z
        .array(z.string().max(50, "Each house rule max 50 chars"))
        .max(20, "Maximum 20 house rules")
        .refine(
          (items) =>
            items.every((item) =>
              VALID_HOUSE_RULES.some(
                (v) => v.toLowerCase() === item.toLowerCase()
              )
            ),
          { message: "Invalid house rule value" }
        )
    ),
  totalSlots: z.coerce
    .number()
    .int()
    .positive("Total slots must be a positive integer")
    .max(20, "Maximum 20 roommates"),
  address: z
    .string()
    .trim()
    .min(1, "Address is required")
    .max(200, "Address must be 200 characters or less"),
  city: z
    .string()
    .trim()
    .min(1, "City is required")
    .max(100, "City must be 100 characters or less"),
  state: z
    .string()
    .trim()
    .min(1, "State is required")
    .max(50, "State must be 50 characters or less"),
  zip: z
    .string()
    .trim()
    .min(1, "Zip code is required")
    .regex(
      /^\d{5}(-\d{4})?$/,
      "Must be a valid US zip code (e.g., 12345 or 12345-6789)"
    ),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;

/**
 * Extended listing schema for API route validation.
 * Includes all base fields plus optional listing metadata fields
 * (images, enum filters, languages, move-in date).
 */
export const createListingApiSchema = createListingSchema.extend({
  images: listingImagesSchema,
  leaseDuration: listingLeaseDurationSchema,
  roomType: listingRoomTypeSchema,
  genderPreference: listingGenderPreferenceSchema,
  householdGender: listingHouseholdGenderSchema,
  householdLanguages: householdLanguagesSchema.optional().default([]),
  primaryHomeLanguage: primaryHomeLanguageSchema,
  moveInDate: moveInDateSchema,
  bookingMode: listingBookingModeSchema,
});

export type CreateListingApiInput = z.infer<typeof createListingApiSchema>;

// Booking validation schema with industry-standard 30-day minimum
export const createBookingSchema = z
  .object({
    listingId: z.string().min(1, "Listing ID is required"),
    startDate: z.coerce.date({ message: "Valid start date is required" }),
    endDate: z.coerce.date({ message: "Valid end date is required" }),
    pricePerMonth: z.coerce.number().positive("Price must be positive"),
    slotsRequested: z.coerce
      .number()
      .int("Slots must be a whole number")
      .min(1, "Must request at least 1 slot")
      .max(20, "Cannot request more than 20 slots")
      .default(1),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(data.startDate);
      startDate.setHours(0, 0, 0, 0);
      return startDate >= today;
    },
    { message: "Start date cannot be in the past", path: ["startDate"] }
  )
  .refine(
    (data) => {
      const diffDays = Math.ceil(
        (data.endDate.getTime() - data.startDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return diffDays >= 30; // Industry standard: 30 days minimum (Airbnb uses 28 nights)
    },
    { message: "Minimum booking duration is 30 days", path: ["endDate"] }
  );

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// Phase 4: Hold validation schema (same constraints as booking but semantically distinct)
export const createHoldSchema = z
  .object({
    listingId: z.string().min(1, "Listing ID is required"),
    startDate: z.coerce.date({ message: "Valid start date is required" }),
    endDate: z.coerce.date({ message: "Valid end date is required" }),
    pricePerMonth: z.coerce.number().positive("Price must be positive"),
    slotsRequested: z.coerce
      .number()
      .int("Slots must be a whole number")
      .min(1, "Must request at least 1 slot")
      .max(20, "Cannot request more than 20 slots")
      .default(1),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(data.startDate);
      startDate.setHours(0, 0, 0, 0);
      return startDate >= today;
    },
    { message: "Start date cannot be in the past", path: ["startDate"] }
  )
  .refine(
    (data) => {
      const diffDays = Math.ceil(
        (data.endDate.getTime() - data.startDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return diffDays >= 30;
    },
    { message: "Minimum booking duration is 30 days", path: ["endDate"] }
  );

export type CreateHoldInput = z.infer<typeof createHoldSchema>;
