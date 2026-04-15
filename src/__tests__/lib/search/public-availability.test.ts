import {
  buildPublicAvailability,
  resolvePublicAvailability,
  resolvePublicAvailabilityForListings,
} from "@/lib/search/public-availability";

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

  it("resolves LEGACY_BOOKING listings with booking-derived compatibility slots", () => {
    expect(
      resolvePublicAvailability(
        {
          id: "listing-legacy",
          availabilitySource: "LEGACY_BOOKING",
          status: "ACTIVE",
          availableSlots: 2,
          totalSlots: 4,
          moveInDate: new Date("2026-06-01T00:00:00.000Z"),
        },
        {
          legacySnapshot: {
            effectiveAvailableSlots: 3,
            totalSlots: 4,
          },
        }
      )
    ).toEqual({
      availabilitySource: "LEGACY_BOOKING",
      openSlots: 3,
      totalSlots: 4,
      availableFrom: "2026-06-01",
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: null,
      effectiveAvailableSlots: 3,
      isValid: true,
      isPubliclyAvailable: true,
    });
  });

  it("resolves valid HOST_MANAGED listings from row fields only", () => {
    expect(
      resolvePublicAvailability(
        {
          id: "listing-host",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          openSlots: 2,
          totalSlots: 4,
          moveInDate: new Date("2026-06-01T00:00:00.000Z"),
          availableUntil: new Date("2026-12-01T00:00:00.000Z"),
          minStayMonths: 3,
          lastConfirmedAt: "2026-04-15T12:30:00.000Z",
        },
        { now: new Date("2026-04-15T00:00:00.000Z") }
      )
    ).toEqual({
      availabilitySource: "HOST_MANAGED",
      openSlots: 2,
      totalSlots: 4,
      availableFrom: "2026-06-01",
      availableUntil: "2026-12-01",
      minStayMonths: 3,
      lastConfirmedAt: "2026-04-15T12:30:00.000Z",
      effectiveAvailableSlots: 2,
      isValid: true,
      isPubliclyAvailable: true,
    });
  });

  it("hides invalid HOST_MANAGED listings instead of falling back to legacy math", () => {
    expect(
      resolvePublicAvailability(
        {
          id: "listing-host-invalid",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          openSlots: 0,
          totalSlots: 4,
          moveInDate: new Date("2026-06-01T00:00:00.000Z"),
        },
        { now: new Date("2026-04-15T00:00:00.000Z") }
      )
    ).toEqual({
      availabilitySource: "HOST_MANAGED",
      openSlots: 0,
      totalSlots: 4,
      availableFrom: "2026-06-01",
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: null,
      effectiveAvailableSlots: 0,
      isValid: false,
      isPubliclyAvailable: false,
    });
  });

  it("resolves mixed listing sets in bulk using row-driven authority", () => {
    const resolved = resolvePublicAvailabilityForListings(
      [
        {
          id: "legacy-1",
          availabilitySource: "LEGACY_BOOKING" as const,
          status: "ACTIVE",
          availableSlots: 1,
          totalSlots: 2,
        },
        {
          id: "host-1",
          availabilitySource: "HOST_MANAGED" as const,
          status: "ACTIVE",
          openSlots: 2,
          totalSlots: 3,
          moveInDate: "2026-06-01",
        },
      ],
      {
        now: new Date("2026-04-15T00:00:00.000Z"),
        legacyAvailabilityByListing: new Map([
          ["legacy-1", { effectiveAvailableSlots: 1, totalSlots: 2 }],
        ]),
      }
    );

    expect(resolved.get("legacy-1")?.availabilitySource).toBe(
      "LEGACY_BOOKING"
    );
    expect(resolved.get("host-1")?.availabilitySource).toBe("HOST_MANAGED");
    expect(resolved.get("host-1")?.effectiveAvailableSlots).toBe(2);
  });
});
