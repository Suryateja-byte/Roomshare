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
