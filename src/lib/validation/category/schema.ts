import { z } from "zod";

export const RoomCategory = z.enum([
  "ENTIRE_PLACE",
  "PRIVATE_ROOM",
  "SHARED_ROOM",
]);
export type RoomCategory = z.infer<typeof RoomCategory>;

const forcedNull = z
  .union([z.null(), z.undefined()])
  .transform(() => null as null);

const requiredPositiveInt = z.coerce.number().int().positive();
const requiredNonNegativeInt = z.coerce.number().int().min(0);
const optionalString = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .optional()
  .nullable()
  .transform((value) => value ?? null);

const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const tstzRange = z
  .string()
  .trim()
  .regex(/^[[(].+,.+[)\]]$/, "availabilityRange must be a valid tstzrange literal");

const BaseInventoryInputSchema = z.object({
  roomCategory: RoomCategory,
  inventoryKey: z.string().trim().min(1).max(128).optional(),
  spaceLabel: optionalString,
  capacityGuests: forcedNull,
  totalBeds: forcedNull,
  openBeds: forcedNull,
  availableFrom: dateOnly,
  availableUntil: dateOnly.optional().nullable(),
  availabilityRange: tstzRange,
  price: z.coerce.number().finite(),
  leaseMinMonths: z.coerce.number().int().positive().optional().nullable(),
  leaseMaxMonths: z.coerce.number().int().positive().optional().nullable(),
  leaseNegotiable: z.boolean().optional(),
  genderPreference: forcedNull,
  householdGender: forcedNull,
});

export const EntirePlaceInputSchema = BaseInventoryInputSchema.extend({
  roomCategory: z.literal("ENTIRE_PLACE"),
  capacityGuests: requiredPositiveInt,
  totalBeds: forcedNull,
  openBeds: forcedNull,
  genderPreference: forcedNull,
  householdGender: forcedNull,
});

export const PrivateRoomInputSchema = BaseInventoryInputSchema.extend({
  roomCategory: z.literal("PRIVATE_ROOM"),
  capacityGuests: requiredPositiveInt,
  totalBeds: forcedNull,
  openBeds: forcedNull,
});

export const SharedRoomInputSchema = BaseInventoryInputSchema.extend({
  roomCategory: z.literal("SHARED_ROOM"),
  capacityGuests: forcedNull,
  totalBeds: requiredPositiveInt,
  openBeds: requiredNonNegativeInt,
}).superRefine((value, ctx) => {
  if (value.openBeds > value.totalBeds) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "openBeds must be less than or equal to totalBeds",
      path: ["openBeds"],
    });
  }
});

/** Discriminated union enforcing per-category required and forced-null rules. */
export const InventoryInputSchema = z.discriminatedUnion("roomCategory", [
  EntirePlaceInputSchema,
  PrivateRoomInputSchema,
  SharedRoomInputSchema,
]);

export type InventoryInput = z.infer<typeof InventoryInputSchema>;
