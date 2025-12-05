import { z } from 'zod';

export const createListingSchema = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().min(10, "Description must be at least 10 characters"),
    price: z.coerce.number().positive("Price must be a positive number"),
    amenities: z.string().transform((str) => str.split(',').map((s) => s.trim()).filter((s) => s.length > 0)),
    houseRules: z.string().optional().default("").transform((str) => str.split(',').map((s) => s.trim()).filter((s) => s.length > 0)),
    totalSlots: z.coerce.number().int().positive("Total slots must be a positive integer"),
    address: z.string().min(1, "Address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    zip: z.string().min(1, "Zip code is required"),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;

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
