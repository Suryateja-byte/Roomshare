import { z } from 'zod';
import { isValidLanguageCode } from './languages';
import {
  VALID_ROOM_TYPES,
  VALID_LEASE_DURATIONS,
  VALID_GENDER_PREFERENCES,
  VALID_HOUSEHOLD_GENDERS,
} from './filter-schema';

/**
 * Language code validation schema
 * Validates that a string is a valid ISO 639-1 language code from our supported list
 */
export const languageCodeSchema = z.string().refine(
    isValidLanguageCode,
    { message: 'Invalid language code' }
);

/**
 * Household languages array validation
 * For "Languages spoken in the house" field
 * - Max 20 languages (reasonable limit)
 * - Each must be a valid language code
 */
export const householdLanguagesSchema = z.array(languageCodeSchema)
    .max(20, 'Maximum 20 languages allowed')
    .default([]);

/**
 * Optional primary home language validation
 * Single language code or null
 */
export const primaryHomeLanguageSchema = z.string()
    .refine(isValidLanguageCode, { message: 'Invalid language code' })
    .nullable()
    .optional();

// ============================================
// Listing Enum Validation Schemas
// ============================================
// Strip 'any' from filter enums — 'any' is a filter-only value, not a valid listing value.

const LISTING_ROOM_TYPES = VALID_ROOM_TYPES.filter((v): v is Exclude<typeof v, 'any'> => v !== 'any');
export const listingRoomTypeSchema = z.enum(LISTING_ROOM_TYPES as unknown as [string, ...string[]]).optional().nullable();

const LISTING_LEASE_DURATIONS = VALID_LEASE_DURATIONS.filter((v): v is Exclude<typeof v, 'any'> => v !== 'any');
export const listingLeaseDurationSchema = z.enum(LISTING_LEASE_DURATIONS as unknown as [string, ...string[]]).optional().nullable();

const LISTING_GENDER_PREFERENCES = VALID_GENDER_PREFERENCES.filter((v): v is Exclude<typeof v, 'any'> => v !== 'any');
export const listingGenderPreferenceSchema = z.enum(LISTING_GENDER_PREFERENCES as unknown as [string, ...string[]]).optional().nullable();

const LISTING_HOUSEHOLD_GENDERS = VALID_HOUSEHOLD_GENDERS.filter((v): v is Exclude<typeof v, 'any'> => v !== 'any');
export const listingHouseholdGenderSchema = z.enum(LISTING_HOUSEHOLD_GENDERS as unknown as [string, ...string[]]).optional().nullable();

// ============================================
// Image URL Validation Schema
// ============================================
// Supabase storage URL pattern: https://{project}.supabase.co/storage/v1/object/public/images/listings/...
const SUPABASE_IMAGE_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/images\/listings\/.+\.(jpg|jpeg|png|gif|webp)$/i;

export const listingImagesSchema = z.array(
  z.string().url("Invalid image URL").regex(SUPABASE_IMAGE_URL_PATTERN, "Image must be from Supabase storage")
).min(1, "At least one image is required").max(10, "Maximum 10 images");

// ============================================
// Move-in Date Validation Schema
// ============================================
export const moveInDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
  .refine((dateStr) => {
    const date = new Date(dateStr + 'T00:00:00Z');
    return !isNaN(date.getTime());
  }, "Invalid calendar date")
  .refine((dateStr) => {
    const date = new Date(dateStr + 'T00:00:00Z');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  }, "Move-in date cannot be in the past")
  .refine((dateStr) => {
    const date = new Date(dateStr + 'T00:00:00Z');
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 2);
    return date <= maxDate;
  }, "Move-in date cannot be more than 2 years in the future")
  .optional()
  .nullable();

export const createListingSchema = z.object({
    title: z.string().min(1, "Title is required").max(100, "Title must be 100 characters or less"),
    description: z.string().min(10, "Description must be at least 10 characters").max(1000, "Description must be 1000 characters or less"),
    price: z.coerce.number().positive("Price must be a positive number").max(50000, "Maximum $50,000/month").refine(Number.isFinite, "Must be a valid number"),
    amenities: z.string().transform((str) => str.split(',').map((s) => s.trim()).filter((s) => s.length > 0)).pipe(z.array(z.string().max(50, "Each amenity max 50 chars")).max(20, "Maximum 20 amenities")),
    houseRules: z.string().optional().default("").transform((str) => str.split(',').map((s) => s.trim()).filter((s) => s.length > 0)).pipe(z.array(z.string().max(50, "Each house rule max 50 chars")).max(20, "Maximum 20 house rules")),
    totalSlots: z.coerce.number().int().positive("Total slots must be a positive integer").max(20, "Maximum 20 roommates"),
    address: z.string().min(1, "Address is required").max(200, "Address must be 200 characters or less"),
    city: z.string().min(1, "City is required").max(100, "City must be 100 characters or less"),
    state: z.string().min(1, "State is required").max(50, "State must be 50 characters or less"),
    zip: z.string().min(1, "Zip code is required").regex(/^\d{5}(-\d{4})?$/, "Must be a valid US zip code (e.g., 12345 or 12345-6789)"),
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
  moveInDate: moveInDateSchema,
});

export type CreateListingApiInput = z.infer<typeof createListingApiSchema>;

// Booking validation schema with industry-standard 30-day minimum
export const createBookingSchema = z.object({
    listingId: z.string().min(1, "Listing ID is required"),
    startDate: z.coerce.date({ message: "Valid start date is required" }),
    endDate: z.coerce.date({ message: "Valid end date is required" }),
    pricePerMonth: z.coerce.number().positive("Price must be positive"),
}).refine(
    (data) => data.endDate > data.startDate,
    { message: "End date must be after start date", path: ["endDate"] }
).refine(
    (data) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(data.startDate);
        startDate.setHours(0, 0, 0, 0);
        return startDate >= today;
    },
    { message: "Start date cannot be in the past", path: ["startDate"] }
).refine(
    (data) => {
        const diffDays = Math.ceil((data.endDate.getTime() - data.startDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 30; // Industry standard: 30 days minimum (Airbnb uses 28 nights)
    },
    { message: "Minimum booking duration is 30 days", path: ["endDate"] }
);

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
