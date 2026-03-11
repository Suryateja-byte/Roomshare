/**
 * Tests for WHOLE_UNIT booking mode (Phase 3)
 *
 * Verifies that:
 * 1. WHOLE_UNIT listings auto-set slotsRequested to totalSlots
 * 2. Client-provided slotsRequested is overridden for WHOLE_UNIT
 * 3. Capacity check uses totalSlots for WHOLE_UNIT
 * 4. SHARED listings are unaffected (regression)
 * 5. Sequential non-overlapping bookings are allowed
 */

// Mock dependencies before imports
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

jest.mock('@/lib/notifications', () => ({
  createInternalNotification: jest.fn(),
}));

jest.mock('@/lib/email', () => ({
  sendNotificationEmailWithPreference: jest.fn(),
}));

jest.mock('@/app/actions/block', () => ({
  checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock('@/app/actions/suspension', () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true, remaining: 9, resetAt: new Date() }),
  getClientIPFromHeaders: jest.fn().mockReturnValue('127.0.0.1'),
  RATE_LIMITS: {
    createBooking: { limit: 10, windowMs: 3600000 },
    createBookingByIp: { limit: 30, windowMs: 3600000 },
  },
}));

jest.mock('next/headers', () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
}));

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

jest.mock('@/lib/env', () => ({
  features: {
    multiSlotBooking: true,
    wholeUnitMode: true,
  },
  getServerEnv: jest.fn(() => ({})),
}));

import { createBooking } from '@/app/actions/booking';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { createInternalNotification } from '@/lib/notifications';
import { sendNotificationEmailWithPreference } from '@/lib/email';

describe('createBooking — WHOLE_UNIT mode (Phase 3)', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  };

  const mockWholeUnitListing = {
    id: 'listing-123',
    title: 'Whole Unit',
    ownerId: 'owner-123',
    totalSlots: 4,
    availableSlots: 4,
    status: 'ACTIVE',
    price: 800,
    bookingMode: 'WHOLE_UNIT',
  };

  const mockSharedListing = {
    id: 'listing-456',
    title: 'Shared Room',
    ownerId: 'owner-123',
    totalSlots: 3,
    availableSlots: 3,
    status: 'ACTIVE',
    price: 500,
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

  // Use future dates to pass validation (30+ days)
  const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000); // ~7 months from now

  const mockBooking = {
    id: 'booking-123',
    listingId: 'listing-123',
    tenantId: 'user-123',
    startDate: futureStart,
    endDate: futureEnd,
    totalPrice: 4800,
    status: 'PENDING',
  };

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null)
    // Mock user.findUnique for suspension and email verification checks
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-123',
      isSuspended: false,
      emailVerified: new Date(),
    })
    ;(createInternalNotification as jest.Mock).mockResolvedValue({ success: true })
    ;(sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({ success: true })
  });

  describe('slotsRequested auto-set', () => {
    it('auto-sets slotsRequested to totalSlots for WHOLE_UNIT listing', async () => {
      let capturedCreateData: Record<string, unknown> | null = null;

      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn()
            .mockResolvedValueOnce([mockWholeUnitListing]) // FOR UPDATE lock
            .mockResolvedValueOnce([{ total: BigInt(0) }]), // SUM(slotsRequested)
          user: {
            findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === 'owner-123') return Promise.resolve(mockOwner);
              if (where.id === 'user-123') return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
          },
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve(mockBooking);
            }),
          },
        };
        return callback(tx);
      });

      const result = await createBooking('listing-123', futureStart, futureEnd, 800);

      expect(result.success).toBe(true);
      expect(capturedCreateData).not.toBeNull();
      expect(capturedCreateData!.slotsRequested).toBe(4); // totalSlots, not default 1
    });

    it('overrides client-provided slotsRequested=2 to totalSlots=4 for WHOLE_UNIT', async () => {
      let capturedCreateData: Record<string, unknown> | null = null;

      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn()
            .mockResolvedValueOnce([mockWholeUnitListing])
            .mockResolvedValueOnce([{ total: BigInt(0) }]),
          user: {
            findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === 'owner-123') return Promise.resolve(mockOwner);
              if (where.id === 'user-123') return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
          },
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve(mockBooking);
            }),
          },
        };
        return callback(tx);
      });

      // Client sends slotsRequested=2 but WHOLE_UNIT should force it to 4
      const result = await createBooking('listing-123', futureStart, futureEnd, 800, 2);

      expect(result.success).toBe(true);
      expect(capturedCreateData).not.toBeNull();
      expect(capturedCreateData!.slotsRequested).toBe(4); // Forced to totalSlots
    });

    it('WHOLE_UNIT auto-set works without feature flag check (flag only gates creation)', async () => {
      // The WHOLE_UNIT override happens inside the transaction, independent of feature flags.
      // Feature flags only gate CREATING/CHANGING a listing to WHOLE_UNIT mode.
      let capturedCreateData: Record<string, unknown> | null = null;

      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn()
            .mockResolvedValueOnce([mockWholeUnitListing])
            .mockResolvedValueOnce([{ total: BigInt(0) }]),
          user: {
            findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === 'owner-123') return Promise.resolve(mockOwner);
              if (where.id === 'user-123') return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
          },
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve(mockBooking);
            }),
          },
        };
        return callback(tx);
      });

      const result = await createBooking('listing-123', futureStart, futureEnd, 800);

      expect(result.success).toBe(true);
      expect(capturedCreateData!.slotsRequested).toBe(4);
    });
  });

  describe('capacity check for WHOLE_UNIT', () => {
    it('fails when any overlapping accepted booking exists (usedSlots > 0)', async () => {
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn()
            .mockResolvedValueOnce([mockWholeUnitListing]) // FOR UPDATE lock
            .mockResolvedValueOnce([{ total: BigInt(1) }]), // 1 slot already used
          user: {
            findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === 'owner-123') return Promise.resolve(mockOwner);
              return Promise.resolve(null);
            }),
          },
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        };
        return callback(tx);
      });

      const result = await createBooking('listing-123', futureStart, futureEnd, 800);

      expect(result.success).toBe(false);
      // usedSlots(1) + effectiveSlotsRequested(4) > totalSlots(4) → capacity exceeded
      expect(result.error).toContain('Not enough available slots');
    });
  });

  describe('SHARED listing regression', () => {
    it('uses normal slotsRequested for SHARED listing (does not override)', async () => {
      let capturedCreateData: Record<string, unknown> | null = null;

      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn()
            .mockResolvedValueOnce([mockSharedListing])
            .mockResolvedValueOnce([{ total: BigInt(0) }]),
          user: {
            findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === 'owner-123') return Promise.resolve(mockOwner);
              if (where.id === 'user-123') return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
          },
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedCreateData = args.data;
              return Promise.resolve({
                ...mockBooking,
                listingId: 'listing-456',
              });
            }),
          },
        };
        return callback(tx);
      });

      // Client sends slotsRequested=1 for SHARED listing
      const result = await createBooking('listing-456', futureStart, futureEnd, 500, 1);

      expect(result.success).toBe(true);
      expect(capturedCreateData).not.toBeNull();
      expect(capturedCreateData!.slotsRequested).toBe(1); // Not overridden to totalSlots
    });
  });

  describe('date boundary: sequential bookings', () => {
    it('allows non-overlapping sequential bookings for WHOLE_UNIT', async () => {
      // First booking: futureStart to futureEnd occupies all slots
      // Second booking: starts after first ends → should succeed
      const secondStart = new Date(futureEnd.getTime() + 1 * 24 * 60 * 60 * 1000); // 1 day after first ends
      const secondEnd = new Date(secondStart.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days later

      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn()
            .mockResolvedValueOnce([mockWholeUnitListing]) // FOR UPDATE lock
            .mockResolvedValueOnce([{ total: BigInt(0) }]), // No overlapping accepted bookings for this date range
          user: {
            findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === 'owner-123') return Promise.resolve(mockOwner);
              if (where.id === 'user-123') return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
          },
          booking: {
            findFirst: jest.fn().mockResolvedValue(null), // No existing duplicate
            create: jest.fn().mockResolvedValue({
              ...mockBooking,
              id: 'booking-456',
              startDate: secondStart,
              endDate: secondEnd,
            }),
          },
        };
        return callback(tx);
      });

      const result = await createBooking('listing-123', secondStart, secondEnd, 800);

      expect(result.success).toBe(true);
    });
  });
});
