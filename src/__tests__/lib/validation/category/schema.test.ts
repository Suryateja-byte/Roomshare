import {
  InventoryInputSchema,
  PrivateRoomInputSchema,
  SharedRoomInputSchema,
} from "@/lib/validation/category/schema";
import { validateInventoryInput } from "@/lib/validation/category";

describe("InventoryInputSchema", () => {
  const base = {
    inventoryKey: "room-1",
    availableFrom: "2026-05-01",
    availabilityRange: "[2026-05-01T00:00:00Z,2026-06-01T00:00:00Z)",
    price: 1200,
  };

  it("accepts a valid ENTIRE_PLACE shape and forces null-only fields", () => {
    const result = validateInventoryInput({
      ...base,
      roomCategory: "ENTIRE_PLACE",
      capacityGuests: 2,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalBeds).toBeNull();
      expect(result.value.openBeds).toBeNull();
    }
  });

  it("rejects ENTIRE_PLACE rows with non-null totalBeds", () => {
    const result = validateInventoryInput({
      ...base,
      roomCategory: "ENTIRE_PLACE",
      capacityGuests: 2,
      totalBeds: 2,
    });

    expect(result.ok).toBe(false);
  });

  it("rejects SHARED_ROOM rows where openBeds exceeds totalBeds", () => {
    const result = InventoryInputSchema.safeParse({
      ...base,
      roomCategory: "SHARED_ROOM",
      totalBeds: 2,
      openBeds: 3,
    });

    expect(result.success).toBe(false);
  });

  it("requires a valid tstzrange literal", () => {
    const result = validateInventoryInput({
      ...base,
      roomCategory: "PRIVATE_ROOM",
      capacityGuests: 1,
      availabilityRange: "not-a-range",
    });

    expect(result.ok).toBe(false);
  });

  it("accepts a valid PRIVATE_ROOM shape and normalizes optional strings", () => {
    const result = PrivateRoomInputSchema.parse({
      ...base,
      roomCategory: "PRIVATE_ROOM",
      capacityGuests: "2",
      spaceLabel: "  Front room  ",
      leaseMinMonths: "3",
      leaseMaxMonths: "6",
      leaseNegotiable: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        capacityGuests: 2,
        spaceLabel: "Front room",
        leaseMinMonths: 3,
        leaseMaxMonths: 6,
        leaseNegotiable: true,
      })
    );
  });

  it("accepts a valid SHARED_ROOM shape and forces capacityGuests to null", () => {
    const result = SharedRoomInputSchema.parse({
      ...base,
      roomCategory: "SHARED_ROOM",
      totalBeds: 3,
      openBeds: 1,
    });

    expect(result.capacityGuests).toBeNull();
    expect(result.totalBeds).toBe(3);
    expect(result.openBeds).toBe(1);
  });
});
