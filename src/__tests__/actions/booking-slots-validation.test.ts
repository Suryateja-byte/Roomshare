/**
 * Tests for slotsRequested parameter validation in createBooking (Phase 2).
 *
 * Covers:
 * - Zod schema validation (min, max, integer constraint, default)
 * - Feature flag gate for multi-slot booking
 * - SUM-based capacity check inside transaction
 */

// Mock @prisma/client FIRST to avoid SWC binary loading issues in WSL2
jest.mock('@prisma/client', () => ({
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: 'Serializable',
      ReadCommitted: 'ReadCommitted',
      RepeatableRead: 'RepeatableRead',
      ReadUncommitted: 'ReadUncommitted',
    },
  },
}));

jest.mock('@/lib/prisma', () => ({
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
  },
}));

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

jest.mock('@/lib/notifications', () => ({
  createInternalNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/lib/email', () => ({
  sendNotificationEmailWithPreference: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/app/actions/block', () => ({
  checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock('@/app/actions/suspension', () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true, remaining: 10, resetAt: new Date() }),
  getClientIPFromHeaders: jest.fn().mockReturnValue('127.0.0.1'),
  RATE_LIMITS: {
    createBooking: { limit: 10, windowMs: 3600000 },
    createBookingByIp: { limit: 30, windowMs: 3600000 },
  },
}));

// Mock @/lib/env for feature flag gate (dynamically imported)
jest.mock('@/lib/env', () => ({
  features: { multiSlotBooking: false },
}));

import { createBooking } from '@/app/actions/booking';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// Typed reference to the mocked @/lib/env for per-test mutation
const mockEnv = jest.requireMock('@/lib/env') as { features: { multiSlotBooking: boolean } };

describe('createBooking — slotsRequested validation (Phase 2)', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  };

  const mockListing = {
    id: 'listing-123',
    title: 'Cozy Room',
    ownerId: 'owner-123',
    totalSlots: 4,
    availableSlots: 4,
    status: 'ACTIVE',
    price: 800,
    bookingMode: 'SHARED',
  };

  const mockOwner = {
    id: 'owner-123',
    name: 'Host User',
    email: 'host@example.com',
  };

  const mockTenant = {
    id: 'user-123',
    name: 'Test User',
  };

  // Future dates to pass date validation
  const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000);

  const mockBooking = {
    id: 'booking-456',
    listingId: 'listing-123',
    tenantId: 'user-123',
    startDate: futureStart,
    endDate: futureEnd,
    totalPrice: 4800,
    status: 'PENDING',
  };

  /**
   * Helper: sets up prisma.$transaction mock with configurable SUM result.
   * The transaction callback receives a tx object whose $queryRaw is called
   * twice: first for the listing (FOR UPDATE), then for the SUM of accepted slots.
   */
  function setupTransactionMock(usedSlots: number) {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
      const tx = {
        $queryRaw: jest.fn()
          // First call: listing FOR UPDATE
          .mockResolvedValueOnce([mockListing])
          // Second call: SUM of overlapping accepted slots
          .mockResolvedValueOnce([{ total: BigInt(usedSlots) }]),
        user: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.id === 'owner-123') return Promise.resolve(mockOwner);
            if (where.id === 'user-123') return Promise.resolve(mockTenant);
            return Promise.resolve(null);
          }),
        },
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue(mockBooking),
        },
      };
      return callback(tx);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null);
    // Default: user not suspended, email verified
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-123',
      isSuspended: false,
      emailVerified: new Date(),
    });
    // Default: feature flag OFF
    mockEnv.features.multiSlotBooking = false;
    // Default transaction: 0 used slots
    setupTransactionMock(0);
  });

  // ─── Zod schema validation ──────────────────────────────────────────

  describe('Zod schema validation', () => {
    it('rejects slotsRequested=0 with min constraint error', async () => {
      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must request at least 1 slot');
    });

    it('rejects slotsRequested=999 with max constraint error', async () => {
      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot request more than 20 slots');
    });

    it('rejects slotsRequested=-1 with min constraint error', async () => {
      const result = await createBooking('listing-123', futureStart, futureEnd, 800, -1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must request at least 1 slot');
    });

    it('rejects slotsRequested=1.5 with integer constraint error', async () => {
      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 1.5);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Slots must be a whole number');
    });

    it('accepts slotsRequested=1 (default path)', async () => {
      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 1);

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe('booking-456');
    });
  });

  // ─── Feature flag gate ──────────────────────────────────────────────

  describe('feature flag gate (multi-slot)', () => {
    it('allows slotsRequested=3 when multiSlotBooking flag is ON', async () => {
      mockEnv.features.multiSlotBooking = true;

      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 3);

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe('booking-456');
      // Verify transaction was actually called (booking created)
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('rejects slotsRequested=3 when multiSlotBooking flag is OFF', async () => {
      mockEnv.features.multiSlotBooking = false;

      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Multi-slot booking is not currently available.');
      expect(result.code).toBe('FEATURE_DISABLED');
      // Transaction should NOT be called — rejected before reaching it
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── SUM-based capacity check ──────────────────────────────────────

  describe('SUM-based capacity check', () => {
    beforeEach(() => {
      // Multi-slot tests need the feature flag ON
      mockEnv.features.multiSlotBooking = true;
    });

    it('succeeds when slotsRequested fits within remaining capacity', async () => {
      // totalSlots=4, usedSlots=1, requesting 3 → 1+3=4 <= 4 → passes
      setupTransactionMock(1);

      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 3);

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe('booking-456');
    });

    it('fails when slotsRequested exceeds remaining capacity', async () => {
      // totalSlots=4, usedSlots=3, requesting 3 → 3+3=6 > 4 → fail
      setupTransactionMock(3);

      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough available slots');
    });

    it('fails at exact boundary (usedSlots + requested > totalSlots by 1)', async () => {
      // totalSlots=4, usedSlots=2, requesting 3 → 2+3=5 > 4 → fail
      setupTransactionMock(2);

      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough available slots');
    });

    it('succeeds at exact capacity (usedSlots + requested === totalSlots)', async () => {
      // totalSlots=4, usedSlots=1, requesting 3 → 1+3=4 === 4 → pass (not >)
      setupTransactionMock(1);

      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 3);

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe('booking-456');
    });
  });

  // ─── Block check with multi-slot ────────────────────────────────────

  describe('block check with multi-slot bookings', () => {
    const { checkBlockBeforeAction } = jest.requireMock('@/app/actions/block') as {
      checkBlockBeforeAction: jest.Mock;
    };

    afterEach(() => {
      // Restore default: allowed
      checkBlockBeforeAction.mockResolvedValue({ allowed: true });
    });

    it('blocked user cannot create multi-slot booking (slotsRequested=3)', async () => {
      mockEnv.features.multiSlotBooking = true;
      checkBlockBeforeAction.mockResolvedValue({ allowed: false, message: 'User is blocked' });

      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked');
    });

    it('block check happens before capacity check', async () => {
      // Block check runs inside the transaction (after listing lock, before capacity SUM).
      // Even when requesting 3 slots that would fit capacity, block error is returned.
      mockEnv.features.multiSlotBooking = true;
      checkBlockBeforeAction.mockResolvedValue({ allowed: false, message: 'User is blocked' });
      // Set capacity to "full" so that if block didn't short-circuit, we'd get a capacity error
      setupTransactionMock(4); // 4 used + 3 requested > 4 total — would be capacity error

      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked');
    });
  });
});
