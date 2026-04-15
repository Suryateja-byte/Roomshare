import { buildPublicAvailability } from "@/lib/search/public-availability";

describe("search/public-availability", () => {
  it("builds the legacy-default availability block from current listing fields", () => {
    expect(
      buildPublicAvailability({
        availableSlots: 2,
        totalSlots: 4,
        moveInDate: new Date("2026-06-01T00:00:00.000Z"),
      })
    ).toEqual({
      availabilitySource: "LEGACY_BOOKING",
      openSlots: 2,
      totalSlots: 4,
      availableFrom: "2026-06-01",
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: null,
    });
  });

  it("accepts future override fields without changing the contract shape", () => {
    expect(
      buildPublicAvailability({
        availabilitySource: "HOST_MANAGED",
        openSlots: 3,
        totalSlots: 5,
        availableFrom: "2026-07-15",
        availableUntil: new Date("2026-12-15T00:00:00.000Z"),
        minStayMonths: 6,
        lastConfirmedAt: "2026-04-15T12:30:00.000Z",
      })
    ).toEqual({
      availabilitySource: "HOST_MANAGED",
      openSlots: 3,
      totalSlots: 5,
      availableFrom: "2026-07-15",
      availableUntil: "2026-12-15",
      minStayMonths: 6,
      lastConfirmedAt: "2026-04-15T12:30:00.000Z",
    });
  });
});
