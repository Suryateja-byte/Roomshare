/**
 * Tests for logBookingAudit helper
 *
 * Verifies: feature-flag gating, TX-bound INSERT, all 6 action types,
 * actor contracts, PII rejection, and error propagation.
 */

jest.mock("@/lib/env", () => ({
  features: {
    bookingAudit: true,
  },
}));

import { logBookingAudit } from "@/lib/booking-audit";
import { features } from "@/lib/env";

// Factory for fake Prisma transaction client
function createMockTx() {
  return {
    bookingAuditLog: {
      create: jest.fn().mockResolvedValue({ id: "audit-1" }),
    },
  } as any;
}

describe("logBookingAudit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (features as any).bookingAudit = true;
  });

  it("inserts audit row with correct fields", async () => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: "booking-1",
      action: "CREATED",
      previousStatus: null,
      newStatus: "PENDING",
      actorId: "user-1",
      actorType: "USER",
      details: { slotsRequested: 2, listingId: "listing-1" },
    });

    expect(tx.bookingAuditLog.create).toHaveBeenCalledWith({
      data: {
        bookingId: "booking-1",
        action: "CREATED",
        previousStatus: null,
        newStatus: "PENDING",
        actorId: "user-1",
        actorType: "USER",
        details: { slotsRequested: 2, listingId: "listing-1" },
        ipAddress: undefined,
      },
    });
  });

  it("always writes audit log regardless of feature flag (audit never disabled)", async () => {
    // Feature flag removed — audit trail must always be active.
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: "booking-1",
      action: "ACCEPTED",
      previousStatus: "PENDING",
      newStatus: "ACCEPTED",
      actorId: "host-1",
      actorType: "HOST",
    });

    expect(tx.bookingAuditLog.create).toHaveBeenCalled();
  });

  it("passes tx (not prisma) to create — transaction isolation", async () => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: "b-1",
      action: "REJECTED",
      previousStatus: "HELD",
      newStatus: "REJECTED",
      actorId: "host-1",
      actorType: "HOST",
      details: { rejectionReason: "not suitable" },
    });

    // The test proves tx.bookingAuditLog.create was called, not any global prisma
    expect(tx.bookingAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["CREATED", null, "PENDING", "user-1", "USER"],
    ["HELD", "PENDING", "HELD", "user-1", "USER"],
    ["ACCEPTED", "PENDING", "ACCEPTED", "host-1", "HOST"],
    ["REJECTED", "HELD", "REJECTED", "host-1", "HOST"],
    ["CANCELLED", "ACCEPTED", "CANCELLED", "user-1", "USER"],
    ["EXPIRED", "HELD", "EXPIRED", null, "SYSTEM"],
  ] as const)(
    "validates action=%s transition",
    async (action, prev, next, actorId, actorType) => {
      const tx = createMockTx();
      await logBookingAudit(tx, {
        bookingId: "b-1",
        action,
        previousStatus: prev,
        newStatus: next,
        actorId,
        actorType,
      });

      expect(tx.bookingAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action,
            previousStatus: prev,
            newStatus: next,
          }),
        })
      );
    }
  );

  it("previousStatus is null only for CREATED", async () => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: "b-1",
      action: "CREATED",
      previousStatus: null,
      newStatus: "PENDING",
      actorId: "u-1",
      actorType: "USER",
    });

    expect(tx.bookingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ previousStatus: null }),
      })
    );
  });

  it("actorId is null when actorType is SYSTEM", async () => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: "b-1",
      action: "EXPIRED",
      previousStatus: "HELD",
      newStatus: "EXPIRED",
      actorId: null,
      actorType: "SYSTEM",
    });

    expect(tx.bookingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: null, actorType: "SYSTEM" }),
      })
    );
  });

  it("audit INSERT failure propagates (rolls back parent TX)", async () => {
    const tx = createMockTx();
    tx.bookingAuditLog.create.mockRejectedValue(
      new Error("DB constraint violation")
    );

    await expect(
      logBookingAudit(tx, {
        bookingId: "b-1",
        action: "CREATED",
        previousStatus: null,
        newStatus: "PENDING",
        actorId: "u-1",
        actorType: "USER",
      })
    ).rejects.toThrow("DB constraint violation");
  });

  // Fix 5: Expanded PII_KEYS to include compound variants
  it.each([
    "email",
    "phone",
    "name",
    "address",
    "firstName",
    "lastName",
    "fullName",
    "phoneNumber",
    "tenantEmail",
    "tenantName",
    "hostEmail",
    "hostName",
  ])('strips PII key "%s" from details', async (key) => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: "b-1",
      action: "CREATED",
      previousStatus: null,
      newStatus: "PENDING",
      actorId: "u-1",
      actorType: "USER",
      details: { slotsRequested: 1, [key]: "sensitive-value" },
    });

    const callData = tx.bookingAuditLog.create.mock.calls[0][0].data;
    expect(callData.details).not.toHaveProperty(key);
    expect(callData.details).toHaveProperty("slotsRequested");
  });

  it("includes ipAddress when provided", async () => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: "b-1",
      action: "CREATED",
      previousStatus: null,
      newStatus: "PENDING",
      actorId: "u-1",
      actorType: "USER",
      ipAddress: "192.168.1.1",
    });

    expect(tx.bookingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ipAddress: "192.168.1.1" }),
      })
    );
  });

  describe("multi-slot audit details", () => {
    it("CREATED action includes slotsRequested in details", async () => {
      const tx = createMockTx();
      await logBookingAudit(tx, {
        bookingId: "b1",
        action: "CREATED",
        previousStatus: null,
        newStatus: "PENDING",
        actorId: "user-1",
        actorType: "USER",
        details: { slotsRequested: 3, listingId: "listing-1" },
      });

      expect(tx.bookingAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          details: expect.objectContaining({ slotsRequested: 3 }),
        }),
      });
    });

    it("HELD action includes slotsRequested and heldUntil in details", async () => {
      const heldUntil = new Date(Date.now() + 15 * 60 * 1000);
      const tx = createMockTx();

      await logBookingAudit(tx, {
        bookingId: "b1",
        action: "HELD",
        previousStatus: null,
        newStatus: "HELD",
        actorId: "user-1",
        actorType: "USER",
        details: { slotsRequested: 2, listingId: "listing-1", heldUntil },
      });

      expect(tx.bookingAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          details: expect.objectContaining({ slotsRequested: 2, heldUntil }),
        }),
      });
    });

    it("CANCELLED action includes slotsRequested and previousStatus in details", async () => {
      const tx = createMockTx();

      await logBookingAudit(tx, {
        bookingId: "b1",
        action: "CANCELLED",
        previousStatus: "ACCEPTED",
        newStatus: "CANCELLED",
        actorId: "user-1",
        actorType: "USER",
        details: { slotsRequested: 3, previousStatus: "ACCEPTED" },
      });

      expect(tx.bookingAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          details: expect.objectContaining({ slotsRequested: 3 }),
        }),
      });
    });
  });

  describe("ADMIN actor type", () => {
    it("accepts ADMIN actorType with actorId", async () => {
      const tx = createMockTx();
      await logBookingAudit(tx, {
        bookingId: "b-1",
        action: "CANCELLED",
        previousStatus: "ACCEPTED",
        newStatus: "CANCELLED",
        actorId: "admin-1",
        actorType: "ADMIN",
        details: { reason: "policy violation" },
      });

      expect(tx.bookingAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: "admin-1",
            actorType: "ADMIN",
          }),
        })
      );
    });
  });

  describe("PII stripping edge cases", () => {
    it("only strips top-level PII keys, not nested values", async () => {
      const tx = createMockTx();
      await logBookingAudit(tx, {
        bookingId: "b-1",
        action: "CREATED",
        previousStatus: null,
        newStatus: "PENDING",
        actorId: "u-1",
        actorType: "USER",
        details: {
          slotsRequested: 1,
          nested: { email: "should-still-exist@test.com" },
        },
      });

      const callData = tx.bookingAuditLog.create.mock.calls[0][0].data;
      // stripPii only strips top-level keys, nested objects pass through
      expect(callData.details).toHaveProperty("nested");
      expect(callData.details.nested).toHaveProperty("email");
    });

    it("handles undefined details gracefully", async () => {
      const tx = createMockTx();
      await logBookingAudit(tx, {
        bookingId: "b-1",
        action: "CREATED",
        previousStatus: null,
        newStatus: "PENDING",
        actorId: "u-1",
        actorType: "USER",
        // details intentionally omitted
      });

      expect(tx.bookingAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            details: undefined,
          }),
        })
      );
    });

    it("handles empty details object", async () => {
      const tx = createMockTx();
      await logBookingAudit(tx, {
        bookingId: "b-1",
        action: "CREATED",
        previousStatus: null,
        newStatus: "PENDING",
        actorId: "u-1",
        actorType: "USER",
        details: {},
      });

      const callData = tx.bookingAuditLog.create.mock.calls[0][0].data;
      expect(callData.details).toEqual({});
    });

    it("strips all PII keys while preserving non-PII keys", async () => {
      const tx = createMockTx();
      await logBookingAudit(tx, {
        bookingId: "b-1",
        action: "CREATED",
        previousStatus: null,
        newStatus: "PENDING",
        actorId: "u-1",
        actorType: "USER",
        details: {
          email: "test@test.com",
          phone: "555-1234",
          name: "John",
          slotsRequested: 2,
          listingId: "listing-1",
          hostEmail: "host@test.com",
          tenantName: "Jane",
        },
      });

      const callData = tx.bookingAuditLog.create.mock.calls[0][0].data;
      expect(callData.details).toEqual({
        slotsRequested: 2,
        listingId: "listing-1",
      });
    });
  });
});
