import {
  prepareHostManagedListingWrite,
  requiresDedicatedHostManagedWritePath,
} from "@/lib/listings/host-managed-write";

function makeCurrent(
  overrides: Partial<Parameters<typeof prepareHostManagedListingWrite>[0]> = {}
) {
  return {
    id: "listing-1",
    version: 5,
    availabilitySource: "HOST_MANAGED" as const,
    status: "PAUSED" as const,
    statusReason: "HOST_PAUSED",
    needsMigrationReview: false,
    openSlots: 2,
    availableSlots: 2,
    totalSlots: 3,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availableUntil: new Date("2026-08-01T00:00:00.000Z"),
    minStayMonths: 1,
    lastConfirmedAt: null,
    freshnessReminderSentAt: new Date("2026-04-01T00:00:00.000Z"),
    freshnessWarningSentAt: new Date("2026-04-08T00:00:00.000Z"),
    autoPausedAt: new Date("2026-04-10T00:00:00.000Z"),
    ...overrides,
  };
}

const now = new Date("2026-04-15T12:00:00.000Z");

describe("host-managed-write", () => {
  it("accepts a valid HOST_MANAGED status-only write", () => {
    const result = prepareHostManagedListingWrite(
      makeCurrent(),
      {
        expectedVersion: 5,
        status: "ACTIVE",
      },
      { actor: "host", now }
    );

    expect(result).toEqual({
      ok: true,
      availabilityAffecting: false,
      data: {
        version: 6,
        status: "ACTIVE",
        statusReason: null,
      },
      nextVersion: 6,
      status: "ACTIVE",
      statusReason: null,
    });
  });

  it("rejects ACTIVE when openSlots is zero", () => {
    const result = prepareHostManagedListingWrite(
      makeCurrent({ openSlots: 0, availableSlots: 0, status: "RENTED" }),
      {
        expectedVersion: 5,
        status: "ACTIVE",
      },
      { actor: "host", now }
    );

    expect(result).toEqual({
      ok: false,
      code: "HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS",
      error: "Active host-managed listings require at least one open slot.",
      httpStatus: 400,
    });
  });

  it("auto-closes omitted-status writes with openSlots=0", () => {
    const result = prepareHostManagedListingWrite(
      makeCurrent(),
      {
        expectedVersion: 5,
        openSlots: 0,
      },
      { actor: "host", now }
    );

    expect(result).toEqual({
      ok: true,
      availabilityAffecting: true,
      data: {
        version: 6,
        status: "RENTED",
        statusReason: "NO_OPEN_SLOTS",
        totalSlots: 3,
        openSlots: 0,
        availableSlots: 0,
        moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        availableUntil: new Date("2026-08-01T00:00:00.000Z"),
        minStayMonths: 1,
        lastConfirmedAt: now,
        freshnessReminderSentAt: null,
        freshnessWarningSentAt: null,
        autoPausedAt: null,
      },
      nextVersion: 6,
      status: "RENTED",
      statusReason: "NO_OPEN_SLOTS",
    });
  });

  it("auto-closes omitted-status writes when availableUntil is already past", () => {
    const result = prepareHostManagedListingWrite(
      makeCurrent({
        moveInDate: new Date("2026-04-01T00:00:00.000Z"),
        availableUntil: new Date("2026-04-10T00:00:00.000Z"),
      }),
      {
        expectedVersion: 5,
        availableUntil: new Date("2026-04-10T00:00:00.000Z"),
      },
      { actor: "host", now }
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        status: "RENTED",
        statusReason: "AVAILABLE_UNTIL_PASSED",
        data: expect.objectContaining({
          status: "RENTED",
          statusReason: "AVAILABLE_UNTIL_PASSED",
        }),
      })
    );
  });

  it("blocks ACTIVE when migration review is still required", () => {
    const result = prepareHostManagedListingWrite(
      makeCurrent({ needsMigrationReview: true }),
      {
        expectedVersion: 5,
        status: "ACTIVE",
      },
      { actor: "admin", now }
    );

    expect(result).toEqual({
      ok: false,
      code: "HOST_MANAGED_MIGRATION_REVIEW_REQUIRED",
      error:
        "This listing must finish migration review before it can be made active.",
      httpStatus: 400,
    });
  });

  it("dual-writes availableSlots and clears freshness timestamps on availability changes", () => {
    const result = prepareHostManagedListingWrite(
      makeCurrent(),
      {
        expectedVersion: 5,
        openSlots: 1,
        minStayMonths: 3,
      },
      { actor: "host", now }
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        availabilityAffecting: true,
        data: expect.objectContaining({
          version: 6,
          openSlots: 1,
          availableSlots: 1,
          minStayMonths: 3,
          lastConfirmedAt: now,
          freshnessReminderSentAt: null,
          freshnessWarningSentAt: null,
          autoPausedAt: null,
        }),
      })
    );
  });

  it("does not touch freshness timestamps on pure status-only writes", () => {
    const result = prepareHostManagedListingWrite(
      makeCurrent(),
      {
        expectedVersion: 5,
        status: "PAUSED",
      },
      { actor: "admin", now }
    );

    if (!result.ok) {
      throw new Error("expected success");
    }

    expect(result.availabilityAffecting).toBe(false);
    expect(result.data).toEqual({
      version: 6,
      status: "PAUSED",
      statusReason: "ADMIN_PAUSED",
    });
  });

  it("rejects stale expectedVersion", () => {
    const result = prepareHostManagedListingWrite(
      makeCurrent(),
      {
        expectedVersion: 4,
        status: "PAUSED",
      },
      { actor: "host", now }
    );

    expect(result).toEqual({
      ok: false,
      code: "VERSION_CONFLICT",
      error: "This listing was updated elsewhere. Reload and try again.",
      httpStatus: 409,
    });
  });

  it("flags legacy inventory edits as wrong write path for HOST_MANAGED rows", () => {
    expect(
      requiresDedicatedHostManagedWritePath({
        availabilitySource: "HOST_MANAGED",
        moveInDateChanged: false,
        bookingModeChanged: false,
        totalSlotsChanged: true,
      })
    ).toBe(true);

    expect(
      requiresDedicatedHostManagedWritePath({
        availabilitySource: "LEGACY_BOOKING",
        moveInDateChanged: false,
        bookingModeChanged: false,
        totalSlotsChanged: true,
      })
    ).toBe(false);
  });
});
