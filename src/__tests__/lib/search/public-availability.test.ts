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
      freshnessBucket: "NOT_APPLICABLE",
      searchEligible: true,
      staleAt: null,
      autoPauseAt: null,
      publicStatus: "AVAILABLE",
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
      freshnessBucket: "NORMAL",
      searchEligible: true,
      staleAt: "2026-05-06T12:30:00.000Z",
      autoPauseAt: "2026-05-15T12:30:00.000Z",
      publicStatus: "AVAILABLE",
    });
  });

  it("marks unconfirmed but otherwise valid HOST_MANAGED listings as search eligible", () => {
    expect(
      resolvePublicAvailability(
        {
          id: "listing-host-unconfirmed",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          openSlots: 2,
          totalSlots: 4,
          moveInDate: new Date("2026-06-01T00:00:00.000Z"),
          availableUntil: new Date("2026-12-01T00:00:00.000Z"),
          minStayMonths: 3,
          lastConfirmedAt: null,
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
      lastConfirmedAt: null,
      effectiveAvailableSlots: 2,
      isValid: true,
      isPubliclyAvailable: true,
      freshnessBucket: "UNCONFIRMED",
      searchEligible: true,
      staleAt: null,
      autoPauseAt: null,
      publicStatus: "AVAILABLE",
    });
  });

  it("marks reminder-window HOST_MANAGED listings as still search eligible", () => {
    expect(
      resolvePublicAvailability(
        {
          id: "listing-host-reminder",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          openSlots: 2,
          totalSlots: 4,
          moveInDate: new Date("2026-06-01T00:00:00.000Z"),
          availableUntil: new Date("2026-12-01T00:00:00.000Z"),
          minStayMonths: 3,
          lastConfirmedAt: "2026-04-01T12:30:00.000Z",
        },
        { now: new Date("2026-04-15T12:30:00.000Z") }
      )
    ).toMatchObject({
      freshnessBucket: "REMINDER",
      searchEligible: true,
      staleAt: "2026-04-22T12:30:00.000Z",
      autoPauseAt: "2026-05-01T12:30:00.000Z",
      publicStatus: "AVAILABLE",
    });
  });

  it("keeps stale HOST_MANAGED listings publicly available but not search eligible", () => {
    expect(
      resolvePublicAvailability(
        {
          id: "listing-host-stale",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          openSlots: 2,
          totalSlots: 4,
          moveInDate: new Date("2026-06-01T00:00:00.000Z"),
          availableUntil: new Date("2026-12-01T00:00:00.000Z"),
          minStayMonths: 3,
          lastConfirmedAt: "2026-03-20T12:30:00.000Z",
        },
        { now: new Date("2026-04-15T12:30:00.000Z") }
      )
    ).toMatchObject({
      isPubliclyAvailable: true,
      freshnessBucket: "STALE",
      searchEligible: false,
      staleAt: "2026-04-10T12:30:00.000Z",
      autoPauseAt: "2026-04-19T12:30:00.000Z",
      publicStatus: "AVAILABLE",
    });
  });

  it("marks overdue HOST_MANAGED listings as auto-pause due without changing row status", () => {
    expect(
      resolvePublicAvailability(
        {
          id: "listing-host-auto-pause-due",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          openSlots: 2,
          totalSlots: 4,
          moveInDate: new Date("2026-06-01T00:00:00.000Z"),
          availableUntil: new Date("2026-12-01T00:00:00.000Z"),
          minStayMonths: 3,
          lastConfirmedAt: "2026-03-10T12:30:00.000Z",
        },
        { now: new Date("2026-04-15T12:30:00.000Z") }
      )
    ).toMatchObject({
      isPubliclyAvailable: true,
      freshnessBucket: "AUTO_PAUSE_DUE",
      searchEligible: false,
      staleAt: "2026-03-31T12:30:00.000Z",
      autoPauseAt: "2026-04-09T12:30:00.000Z",
      publicStatus: "AVAILABLE",
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
      freshnessBucket: "UNCONFIRMED",
      searchEligible: false,
      staleAt: null,
      autoPauseAt: null,
      publicStatus: "AVAILABLE",
    });
  });

  it("maps public status snapshots from row status and reason", () => {
    expect(
      resolvePublicAvailability({
        id: "listing-full",
        availabilitySource: "LEGACY_BOOKING",
        status: "RENTED",
        statusReason: "NO_OPEN_SLOTS",
        availableSlots: 0,
        totalSlots: 2,
      }).publicStatus
    ).toBe("FULL");

    expect(
      resolvePublicAvailability({
        id: "listing-closed",
        availabilitySource: "LEGACY_BOOKING",
        status: "RENTED",
        statusReason: "AVAILABLE_UNTIL_PASSED",
        availableSlots: 0,
        totalSlots: 2,
      }).publicStatus
    ).toBe("CLOSED");

    expect(
      resolvePublicAvailability({
        id: "listing-paused",
        availabilitySource: "LEGACY_BOOKING",
        status: "PAUSED",
        statusReason: "HOST_PAUSED",
        availableSlots: 1,
        totalSlots: 2,
      }).publicStatus
    ).toBe("PAUSED");

    expect(
      resolvePublicAvailability({
        id: "listing-needs-reconfirmation",
        availabilitySource: "HOST_MANAGED",
        status: "PAUSED",
        statusReason: "STALE_AUTO_PAUSE",
        openSlots: 1,
        totalSlots: 2,
        moveInDate: "2026-06-01",
        lastConfirmedAt: "2026-03-10T12:30:00.000Z",
      }).publicStatus
    ).toBe("NEEDS_RECONFIRMATION");
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
