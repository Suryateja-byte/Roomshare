/**
 * Tests for Phase 4 createHold server action
 *
 * Covers: happy path, feature flag gating, max holds boundary,
 * capacity counting, WHOLE_UNIT override, duplicate prevention,
 * idempotency, slot decrement, createBooking interaction,
 * rate limiting, and price validation.
 */

jest.mock("@/lib/booking-audit", () => ({ logBookingAudit: jest.fn() }));

// Mock dependencies before imports
jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    booking: {
      create: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/notifications", () => ({
  createInternalNotification: jest.fn(),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmailWithPreference: jest.fn(),
}));

jest.mock("@/app/actions/block", () => ({
  checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ success: true, remaining: 9, resetAt: new Date() }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    createBooking: { limit: 10, windowMs: 3600000 },
    createBookingByIp: { limit: 30, windowMs: 3600000 },
    createHold: { limit: 10, windowMs: 3600000 },
    createHoldByIp: { limit: 30, windowMs: 3600000 },
    createHoldPerListing: { limit: 3, windowMs: 3600000 },
  },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: "Serializable",
      ReadCommitted: "ReadCommitted",
      RepeatableRead: "RepeatableRead",
      ReadUncommitted: "ReadUncommitted",
    },
  },
}));

// Feature flags: softHoldsEnabled ON by default for hold tests
jest.mock("@/lib/env", () => ({
  features: {
    softHoldsEnabled: true,
    softHoldsDraining: false,
    multiSlotBooking: true,
    wholeUnitMode: true,
    bookingAudit: true,
  },
  getServerEnv: jest.fn(() => ({})),
}));

jest.mock("@/lib/idempotency", () => ({
  withIdempotency: jest.fn(),
}));

import { createHold, createBooking } from "@/app/actions/booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { withIdempotency } from "@/lib/idempotency";
import { MAX_HOLDS_PER_USER, HOLD_TTL_MINUTES } from "@/lib/hold-constants";
import { logBookingAudit } from "@/lib/booking-audit";

// Typed reference for per-test feature flag mutation
const mockEnv = jest.requireMock("@/lib/env") as {
  features: {
    softHoldsEnabled: boolean;
    softHoldsDraining: boolean;
    multiSlotBooking: boolean;
    wholeUnitMode: boolean;
  };
};

describe("createHold", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
  };

  const mockListing = {
    id: "listing-123",
    title: "Cozy Room",
    ownerId: "owner-123",
    totalSlots: 2,
    availableSlots: 2,
    status: "ACTIVE",
    price: 800,
    bookingMode: "SHARED",
    holdTtlMinutes: 15,
  };

  const mockOwner = {
    id: "owner-123",
    name: "Host User",
    email: "host@example.com",
  };

  const mockTenant = {
    id: "user-123",
    name: "Test User",
  };

  // Future dates (pass schema validation: >= 30 days apart)
  const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000); // ~7 months from now

  const mockHoldBooking = {
    id: "hold-123",
    listingId: "listing-123",
    tenantId: "user-123",
    startDate: futureStart,
    endDate: futureEnd,
    totalPrice: 4800,
    status: "HELD",
    slotsRequested: 1,
    heldUntil: new Date(Date.now() + HOLD_TTL_MINUTES * 60 * 1000),
  };

  /**
   * Helper to build a standard mock tx for executeHoldTransaction.
   * $queryRaw is called 3 times in order:
   *   1) hold count query (COUNT active holds for this user)
   *   2) listing FOR UPDATE lock
   *   3) capacity SUM query (ACCEPTED + active HELD)
   */
  function buildMockTx(overrides?: {
    holdCount?: number;
    listing?: typeof mockListing | null;
    usedSlots?: number;
    existingHold?: object | null;
    decrementResult?: number;
  }) {
    const holdCount = overrides?.holdCount ?? 0;
    const listing =
      overrides?.listing === undefined ? mockListing : overrides.listing;
    const usedSlots = overrides?.usedSlots ?? 0;
    const existingHold = overrides?.existingHold ?? null;
    const decrementResult = overrides?.decrementResult ?? 1;

    return {
      $queryRaw: jest
        .fn()
        // 1) hold count query
        .mockResolvedValueOnce([{ count: BigInt(holdCount) }])
        // 2) listing FOR UPDATE
        .mockResolvedValueOnce(listing ? [listing] : [])
        // 3) capacity SUM
        .mockResolvedValueOnce([{ total: BigInt(usedSlots) }]),
      $executeRaw: jest.fn().mockResolvedValue(decrementResult),
      user: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) => {
            if (where.id === "owner-123") return Promise.resolve(mockOwner);
            if (where.id === "user-123") return Promise.resolve(mockTenant);
            return Promise.resolve(null);
          }),
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue(existingHold),
        create: jest.fn().mockResolvedValue(mockHoldBooking),
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-123",
      isSuspended: false,
      emailVerified: new Date(),
    });

    // Reset feature flags to default ON state
    mockEnv.features.softHoldsEnabled = true;
    mockEnv.features.softHoldsDraining = false;
    mockEnv.features.multiSlotBooking = true;

    // Default: direct transaction path (no idempotency key)
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: unknown) => {
        const tx = buildMockTx();
        return (
          callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
        )(tx);
      }
    );
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Hold creation -- happy path
  // ─────────────────────────────────────────────────────────────
  describe("happy path", () => {
    it("creates HELD booking with correct heldUntil and decrements availableSlots", async () => {
      let capturedCreateData: Record<string, unknown> | null = null;
      let executeRawCalled = false;

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx();
          tx.booking.create = jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve(mockHoldBooking);
            });
          tx.$executeRaw = jest.fn().mockImplementation(() => {
            executeRawCalled = true;
            return Promise.resolve(1);
          });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe("hold-123");

      // Verify HELD status
      expect(capturedCreateData).not.toBeNull();
      expect(capturedCreateData!.status).toBe("HELD");

      // Verify heldUntil is set and in the future
      expect(capturedCreateData!.heldUntil).toBeInstanceOf(Date);
      const heldUntil = capturedCreateData!.heldUntil as Date;
      expect(heldUntil.getTime()).toBeGreaterThan(Date.now());
      // Should be approximately HOLD_TTL_MINUTES from now
      const expectedHeldUntil = Date.now() + HOLD_TTL_MINUTES * 60 * 1000;
      expect(Math.abs(heldUntil.getTime() - expectedHeldUntil)).toBeLessThan(
        5000
      ); // within 5s tolerance

      // Verify slot decrement was called
      expect(executeRawCalled).toBe(true);
    });

    it("calls logBookingAudit with HELD action", async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx();
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
      expect(logBookingAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "HELD",
          newStatus: "HELD",
          previousStatus: null,
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Hold creation -- feature flag OFF
  // ─────────────────────────────────────────────────────────────
  describe("feature flag OFF", () => {
    it("returns error when softHoldsEnabled is false", async () => {
      mockEnv.features.softHoldsEnabled = false;

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("FEATURE_DISABLED");
      expect(result.error).toContain("not currently available");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Hold creation -- feature flag DRAIN (blocks new holds)
  // ─────────────────────────────────────────────────────────────
  describe("feature flag DRAIN", () => {
    it("returns error when draining (softHoldsEnabled = false during drain)", async () => {
      // When ENABLE_SOFT_HOLDS=drain, softHoldsEnabled is false (only "on" makes it true)
      mockEnv.features.softHoldsEnabled = false;
      mockEnv.features.softHoldsDraining = true;

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("FEATURE_DISABLED");
      expect(result.error).toContain("not currently available");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Max 3 holds boundary
  // ─────────────────────────────────────────────────────────────
  describe("max holds boundary", () => {
    it("allows up to MAX_HOLDS_PER_USER holds", async () => {
      // 2 existing holds (under limit of 3) -- should succeed
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ holdCount: MAX_HOLDS_PER_USER - 1 });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe("hold-123");
    });

    it("rejects when MAX_HOLDS_PER_USER reached", async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ holdCount: MAX_HOLDS_PER_USER });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("MAX_HOLDS_EXCEEDED");
      expect(result.error).toContain(`${MAX_HOLDS_PER_USER}`);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Hold capacity includes HELD (SUM counts ACCEPTED + active HELD)
  // ─────────────────────────────────────────────────────────────
  describe("capacity includes HELD slots", () => {
    it("rejects hold when ACCEPTED + HELD slots fill capacity", async () => {
      // totalSlots=2, usedSlots=2 (mix of ACCEPTED and HELD)
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ usedSlots: 2 });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not enough available slots");
    });

    it("allows hold when capacity has room after counting HELD", async () => {
      // totalSlots=2, usedSlots=1 -- room for 1 more
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ usedSlots: 1 });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. WHOLE_UNIT override: forces slotsRequested = totalSlots
  // ─────────────────────────────────────────────────────────────
  describe("WHOLE_UNIT override", () => {
    it("forces slotsRequested to totalSlots for WHOLE_UNIT listing", async () => {
      const wholeUnitListing = {
        ...mockListing,
        bookingMode: "WHOLE_UNIT",
        totalSlots: 3,
        availableSlots: 3,
      };
      let capturedCreateData: Record<string, unknown> | null = null;

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ listing: wholeUnitListing });
          tx.booking.create = jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve({ ...mockHoldBooking, slotsRequested: 3 });
            });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800,
        1
      );

      expect(result.success).toBe(true);
      expect(capturedCreateData).not.toBeNull();
      // Despite requesting 1, WHOLE_UNIT forces slotsRequested = totalSlots (3)
      expect(capturedCreateData!.slotsRequested).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Duplicate hold prevented
  // ─────────────────────────────────────────────────────────────
  describe("duplicate hold prevention", () => {
    it("rejects hold when user has active hold for overlapping dates", async () => {
      const existingHold = {
        id: "existing-hold-456",
        listingId: "listing-123",
        tenantId: "user-123",
        status: "HELD",
        heldUntil: new Date(Date.now() + 10 * 60 * 1000), // still active
        startDate: futureStart,
        endDate: futureEnd,
      };

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ existingHold });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("DUPLICATE_HOLD");
      expect(result.error).toContain("active hold for overlapping dates");
    });

    it("rejects hold when user has PENDING booking with overlapping dates", async () => {
      const existingPending = {
        id: "existing-pending-456",
        listingId: "listing-123",
        tenantId: "user-123",
        status: "PENDING",
        heldUntil: null,
        startDate: futureStart,
        endDate: futureEnd,
      };

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ existingHold: existingPending });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("DUPLICATE_HOLD");
      expect(result.error).toContain("active booking for overlapping dates");
    });

    it("rejects hold when user has ACCEPTED booking with overlapping dates", async () => {
      const existingAccepted = {
        id: "existing-accepted-456",
        listingId: "listing-123",
        tenantId: "user-123",
        status: "ACCEPTED",
        heldUntil: null,
        startDate: futureStart,
        endDate: futureEnd,
      };

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ existingHold: existingAccepted });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("DUPLICATE_HOLD");
      expect(result.error).toContain("active booking for overlapping dates");
    });

    it("allows hold when user has EXPIRED booking with overlapping dates", async () => {
      // existingHold = null means findFirst returns null (no active booking found)
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ existingHold: null });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Idempotency replay: returns cached result
  // ─────────────────────────────────────────────────────────────
  describe("idempotency replay", () => {
    it("returns cached result for replayed idempotency key", async () => {
      const cachedResult = {
        success: true as const,
        bookingId: "hold-123",
        listingId: "listing-123",
        listingTitle: "Cozy Room",
        listingOwnerId: "owner-123",
        ownerEmail: "host@example.com",
        ownerName: "Host User",
        tenantName: "Test User",
        holdTtlMinutes: 15,
        heldUntil: new Date(Date.now() + 15 * 60 * 1000),
      };

      (withIdempotency as jest.Mock).mockResolvedValue({
        success: true,
        cached: true, // indicates replay
        result: cachedResult,
      });

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800,
        1,
        "idempotency-key-abc"
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe("hold-123");

      // withIdempotency should have been called with the correct action name
      expect(withIdempotency).toHaveBeenCalledWith(
        "idempotency-key-abc",
        "user-123",
        "createHold",
        expect.objectContaining({ listingId: "listing-123" }),
        expect.any(Function)
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Slot decrement at creation
  // ─────────────────────────────────────────────────────────────
  describe("slot decrement at creation", () => {
    it("calls $executeRaw to decrement availableSlots", async () => {
      let executeRawMock: jest.Mock | null = null;

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx();
          executeRawMock = tx.$executeRaw;
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
      expect(executeRawMock).toHaveBeenCalled();
    });

    it("returns error when $executeRaw returns 0 (no rows updated)", async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ decrementResult: 0 });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("No available slots");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 10. createBooking rejects when HELD exists
  // ─────────────────────────────────────────────────────────────
  describe("createBooking rejects when HELD exists", () => {
    it("returns duplicate error when HELD booking exists for same dates", async () => {
      const existingHeldBooking = {
        id: "held-booking-789",
        listingId: "listing-123",
        tenantId: "user-123",
        status: "HELD",
        startDate: futureStart,
        endDate: futureEnd,
      };

      // Mock for createBooking path -- the duplicate check includes HELD status
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([mockListing]) // FOR UPDATE lock
              .mockResolvedValueOnce([{ total: BigInt(0) }]), // SUM(slotsRequested)
            user: {
              findUnique: jest
                .fn()
                .mockImplementation(({ where }: { where: { id: string } }) => {
                  if (where.id === "owner-123")
                    return Promise.resolve(mockOwner);
                  if (where.id === "user-123")
                    return Promise.resolve(mockTenant);
                  return Promise.resolve(null);
                }),
            },
            booking: {
              // The FIRST findFirst in executeBookingTransaction is the duplicate check
              // which now includes HELD in status filter
              findFirst: jest.fn().mockResolvedValue(existingHeldBooking),
              create: jest.fn(),
            },
          };
          return (callback as (tx: unknown) => Promise<unknown>)(tx);
        }
      );

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("already have a booking request");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 11. Rate limit enforced
  // ─────────────────────────────────────────────────────────────
  describe("rate limit enforced", () => {
    it("blocks excess hold requests via per-user rate limit", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValueOnce({
        success: false,
        remaining: 0,
        resetAt: new Date(),
      });

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("RATE_LIMITED");
      expect(result.error).toContain("Too many hold requests");
    });

    it("blocks excess hold requests via per-IP rate limit", async () => {
      (checkRateLimit as jest.Mock)
        // First call (per-user) succeeds
        .mockResolvedValueOnce({
          success: true,
          remaining: 5,
          resetAt: new Date(),
        })
        // Second call (per-IP) fails
        .mockResolvedValueOnce({
          success: false,
          remaining: 0,
          resetAt: new Date(),
        });

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("RATE_LIMITED");
      expect(result.error).toContain("Too many hold requests");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 12. Price validation
  // ─────────────────────────────────────────────────────────────
  describe("price validation", () => {
    it("rejects hold when client price does not match listing price", async () => {
      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        0.01
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("PRICE_CHANGED");
      expect(result.error).toContain("price has changed");
      expect(result.currentPrice).toBe(800);
    });

    it("accepts hold when client price matches listing price", async () => {
      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe("hold-123");
    });

    it("rejects manipulated high price", async () => {
      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        99999
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("PRICE_CHANGED");
      expect(result.currentPrice).toBe(800);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 13. heldAt timestamp is set on hold creation
  // ─────────────────────────────────────────────────────────────
  describe("heldAt timestamp", () => {
    it("sets heldAt to current time on hold creation", async () => {
      let capturedCreateData: Record<string, unknown> | null = null;

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx();
          tx.booking.create = jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve(mockHoldBooking);
            });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const before = Date.now();
      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );
      const after = Date.now();

      expect(result.success).toBe(true);
      expect(capturedCreateData).not.toBeNull();
      expect(capturedCreateData!.heldAt).toBeInstanceOf(Date);
      const heldAt = capturedCreateData!.heldAt as Date;
      expect(heldAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(heldAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 14. Per-listing holdTtlMinutes
  // ─────────────────────────────────────────────────────────────
  describe("per-listing holdTtlMinutes", () => {
    it("uses listing.holdTtlMinutes for TTL when set to non-default value", async () => {
      const customTtlListing = { ...mockListing, holdTtlMinutes: 30 };
      let capturedCreateData: Record<string, unknown> | null = null;

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ listing: customTtlListing });
          tx.booking.create = jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve(mockHoldBooking);
            });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
      expect(capturedCreateData).not.toBeNull();

      // Verify heldUntil is ~30 min from now (not 15)
      const heldUntil = capturedCreateData!.heldUntil as Date;
      const expectedHeldUntil = Date.now() + 30 * 60 * 1000;
      expect(Math.abs(heldUntil.getTime() - expectedHeldUntil)).toBeLessThan(
        5000
      );
    });

    it("falls back to HOLD_TTL_MINUTES when listing uses default 15", async () => {
      let capturedCreateData: Record<string, unknown> | null = null;

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx(); // uses mockListing with holdTtlMinutes: 15
          tx.booking.create = jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve(mockHoldBooking);
            });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
      expect(capturedCreateData).not.toBeNull();

      // Verify heldUntil is ~15 min from now (the default)
      const heldUntil = capturedCreateData!.heldUntil as Date;
      const expectedHeldUntil = Date.now() + HOLD_TTL_MINUTES * 60 * 1000;
      expect(Math.abs(heldUntil.getTime() - expectedHeldUntil)).toBeLessThan(
        5000
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 15. Hold TTL edge cases
  // ─────────────────────────────────────────────────────────────
  describe("hold TTL edge cases", () => {
    it("holdTtlMinutes=5 (minimum allowed by DB CHECK) uses per-listing TTL", async () => {
      // DB CHECK constraint enforces holdTtlMinutes >= 5, so 0 is impossible.
      // Test the minimum allowed value to verify ?? operator uses the listing value.
      const minTtlListing = { ...mockListing, holdTtlMinutes: 5 };
      let capturedCreateData: Record<string, unknown> | null = null;

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ listing: minTtlListing });
          tx.booking.create = jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve(mockHoldBooking);
            });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );
      expect(result.success).toBe(true);
      expect(capturedCreateData).not.toBeNull();
      const heldUntil = capturedCreateData!.heldUntil as Date;
      // holdTtlMinutes=5 → heldUntil should be ~5 minutes from now
      const expectedHeldUntil = Date.now() + 5 * 60 * 1000;
      expect(Math.abs(heldUntil.getTime() - expectedHeldUntil)).toBeLessThan(
        5000
      );
    });

    it("holdTtlMinutes=null falls back to HOLD_TTL_MINUTES (15)", async () => {
      const nullTtlListing = { ...mockListing, holdTtlMinutes: null };
      let capturedCreateData: Record<string, unknown> | null = null;

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({
            listing: nullTtlListing as unknown as typeof mockListing,
          });
          tx.booking.create = jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve(mockHoldBooking);
            });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );
      expect(result.success).toBe(true);
      expect(capturedCreateData).not.toBeNull();
      const heldUntil = capturedCreateData!.heldUntil as Date;
      const expectedHeldUntil = Date.now() + HOLD_TTL_MINUTES * 60 * 1000;
      expect(Math.abs(heldUntil.getTime() - expectedHeldUntil)).toBeLessThan(
        5000
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 16. Duplicate detection with different slotsRequested
  // ─────────────────────────────────────────────────────────────
  describe("duplicate detection with different slotsRequested", () => {
    it("rejects duplicate even when slotsRequested differs", async () => {
      // User has PENDING for 1 slot → new hold for 2 slots same dates = duplicate
      // Uses a 4-slot listing so capacity allows 2 slots, ensuring the duplicate check (not capacity) fires
      const widerListing = { ...mockListing, totalSlots: 4, availableSlots: 4 };
      const existingPending = {
        id: "existing-pending",
        listingId: "listing-123",
        tenantId: "user-123",
        status: "PENDING",
        heldUntil: null,
        slotsRequested: 1,
        startDate: futureStart,
        endDate: futureEnd,
      };

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({
            listing: widerListing,
            existingHold: existingPending,
          });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      // Requesting 2 slots but user already has PENDING for 1 slot at same dates → duplicate
      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800,
        2
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("DUPLICATE_HOLD");
    });

    it("allows hold after previous one is CANCELLED", async () => {
      // existingHold = null means no active booking found (CANCELLED is filtered out by the query)
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ existingHold: null });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );
      expect(result.success).toBe(true);
    });

    it("allows hold after previous one is REJECTED", async () => {
      // Same logic: REJECTED is terminal and not in the PENDING/HELD/ACCEPTED filter
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: unknown) => {
          const tx = buildMockTx({ existingHold: null });
          return (
            callback as (tx: ReturnType<typeof buildMockTx>) => Promise<unknown>
          )(tx);
        }
      );

      const result = await createHold(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );
      expect(result.success).toBe(true);
    });
  });
});
