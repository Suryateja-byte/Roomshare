/**
 * Feature flag interaction matrix tests for multi-slot bookings.
 *
 * Covers:
 * 1. multiSlotBooking=OFF: slotsRequested=1 bypasses the flag; slotsRequested>1 is blocked.
 * 2. softHoldsEnabled=OFF: all createHold calls return FEATURE_DISABLED; existing HELD
 *    bookings can still be accepted/cancelled via updateBookingStatus (flag-independent).
 * 3. softHoldsEnabled=DRAIN: same as OFF for new holds; existing HELD managed as normal.
 */

// ---------------------------------------------------------------------------
// Mocks BEFORE imports (Jest hoisting requirement)
// ---------------------------------------------------------------------------

jest.mock('@/lib/booking-audit', () => ({ logBookingAudit: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    booking: { create: jest.fn(), findFirst: jest.fn(), count: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    idempotencyKey: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/notifications', () => ({ createInternalNotification: jest.fn() }));
jest.mock('@/lib/email', () => ({ sendNotificationEmailWithPreference: jest.fn() }));
jest.mock('@/app/actions/block', () => ({ checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }) }));
jest.mock('@/app/actions/suspension', () => ({ checkSuspension: jest.fn().mockResolvedValue({ suspended: false }), checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }) }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true, remaining: 9, resetAt: new Date() }),
  getClientIPFromHeaders: jest.fn().mockReturnValue('127.0.0.1'),
  RATE_LIMITS: {
    createBooking: { limit: 10, windowMs: 3600000 },
    createBookingByIp: { limit: 30, windowMs: 3600000 },
    createHold: { limit: 10, windowMs: 3600000 },
    createHoldByIp: { limit: 30, windowMs: 3600000 },
    createHoldPerListing: { limit: 3, windowMs: 3600000 },
    bookingStatus: { limit: 30, windowMs: 60000 },
  },
}));
jest.mock('next/headers', () => ({ headers: jest.fn().mockResolvedValue(new Headers()) }));
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
    softHoldsEnabled: true,
    softHoldsDraining: false,
    multiSlotBooking: true,
    wholeUnitMode: true,
    bookingAudit: true,
  },
  getServerEnv: jest.fn(() => ({})),
}));
jest.mock('@/lib/idempotency', () => ({ withIdempotency: jest.fn() }));
jest.mock('@/lib/booking-state-machine', () => ({
  validateTransition: jest.fn(),
  isInvalidStateTransitionError: jest.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Imports (after all mocks)
// ---------------------------------------------------------------------------

import { createBooking, createHold } from '@/app/actions/booking';
import { updateBookingStatus } from '@/app/actions/manage-booking';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { createInternalNotification } from '@/lib/notifications';
import { sendNotificationEmailWithPreference } from '@/lib/email';

// ---------------------------------------------------------------------------
// Typed reference for per-test feature flag mutation
// ---------------------------------------------------------------------------

const mockEnv = jest.requireMock('@/lib/env') as {
  features: {
    softHoldsEnabled: boolean;
    softHoldsDraining: boolean;
    multiSlotBooking: boolean;
    wholeUnitMode: boolean;
    bookingAudit: boolean;
  };
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000);

const tenantSession = { user: { id: 'tenant-1', email: 'tenant@example.com' } };
const ownerSession = { user: { id: 'owner-1', email: 'owner@example.com' } };

const mockOwner = { id: 'owner-1', name: 'Owner Name', email: 'owner@example.com' };
const mockTenant = { id: 'tenant-1', name: 'Tenant Name' };

/** Shared listing used by createBooking/createHold tests */
const sharedListing = {
  id: 'listing-ff-1',
  title: 'Feature Flag Listing',
  ownerId: 'owner-1',
  totalSlots: 5,
  availableSlots: 5,
  status: 'ACTIVE',
  price: 1000,
  bookingMode: 'SHARED',
  holdTtlMinutes: 60,
};

/**
 * Build a booking object that updateBookingStatus loads via prisma.booking.findUnique.
 * Includes nested listing + tenant selects expected by manage-booking.ts.
 */
function makeHeldBookingForStatus(overrides: {
  id?: string;
  tenantId?: string;
  status?: string;
  slotsRequested?: number;
  heldUntil?: Date | null;
  listingOwnerId?: string;
} = {}) {
  const futureHeldUntil = new Date(Date.now() + 60 * 60 * 1000);
  return {
    id: overrides.id ?? 'booking-held-1',
    listingId: 'listing-ff-1',
    tenantId: overrides.tenantId ?? 'tenant-1',
    status: overrides.status ?? 'HELD',
    slotsRequested: overrides.slotsRequested ?? 2,
    version: 1,
    startDate: futureStart,
    endDate: futureEnd,
    totalPrice: 2000,
    heldUntil: overrides.heldUntil !== undefined ? overrides.heldUntil : futureHeldUntil,
    listing: {
      id: 'listing-ff-1',
      title: 'Feature Flag Listing',
      ownerId: overrides.listingOwnerId ?? 'owner-1',
      availableSlots: 3,
      totalSlots: 5,
      bookingMode: 'SHARED',
      owner: { name: 'Owner Name' },
    },
    tenant: {
      id: overrides.tenantId ?? 'tenant-1',
      name: 'Tenant Name',
      email: 'tenant@example.com',
    },
  };
}

// ---------------------------------------------------------------------------
// 1. multiSlotBooking=OFF
// ---------------------------------------------------------------------------

describe('multiSlotBooking=OFF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset all flags to known defaults, then disable multiSlotBooking
    mockEnv.features.softHoldsEnabled = true;
    mockEnv.features.softHoldsDraining = false;
    mockEnv.features.multiSlotBooking = false;
    mockEnv.features.wholeUnitMode = true;
    mockEnv.features.bookingAudit = true;

    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'tenant-1',
      isSuspended: false,
      emailVerified: new Date(),
    });
    (createInternalNotification as jest.Mock).mockResolvedValue({ success: true });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({ success: true });
  });

  it('createBooking with slotsRequested=1 succeeds (no flag check for single slot)', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'booking-single-1',
            status: 'PENDING',
            slotsRequested: 1,
          }),
        },
        user: {
          findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            if (where.id === 'owner-1') return Promise.resolve(mockOwner);
            if (where.id === 'tenant-1') return Promise.resolve(mockTenant);
            return Promise.resolve(null);
          }),
        },
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([sharedListing])
          .mockResolvedValueOnce([{ total: BigInt(0) }]),
        $executeRaw: jest.fn(),
      };
      return callback(tx);
    });

    const result = await createBooking('listing-ff-1', futureStart, futureEnd, 1000, 1);

    expect(result.success).toBe(true);
  });

  it('createBooking with slotsRequested=2 returns FEATURE_DISABLED', async () => {
    const result = await createBooking('listing-ff-1', futureStart, futureEnd, 1000, 2);

    expect(result.success).toBe(false);
    expect(result.code).toBe('FEATURE_DISABLED');
    expect(result.error).toContain('Multi-slot booking is not currently available');
    // Transaction must NOT be called — flag check is before transaction
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('createHold with slotsRequested=1 succeeds (softHoldsEnabled=true, multiSlotBooking irrelevant)', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'hold-single-1',
            status: 'HELD',
            slotsRequested: 1,
          }),
        },
        user: {
          findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            if (where.id === 'owner-1') return Promise.resolve(mockOwner);
            if (where.id === 'tenant-1') return Promise.resolve(mockTenant);
            return Promise.resolve(null);
          }),
        },
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ count: BigInt(0) }])
          .mockResolvedValueOnce([sharedListing])
          .mockResolvedValueOnce([{ total: BigInt(0) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      return callback(tx);
    });

    const result = await createHold('listing-ff-1', futureStart, futureEnd, 1000, 1);

    expect(result.success).toBe(true);
  });

  it('createHold with slotsRequested=2 returns FEATURE_DISABLED', async () => {
    const result = await createHold('listing-ff-1', futureStart, futureEnd, 1000, 2);

    expect(result.success).toBe(false);
    expect(result.code).toBe('FEATURE_DISABLED');
    expect(result.error).toContain('Multi-slot holds are not currently available');
    // Transaction must NOT be called — flag check is before transaction
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updateBookingStatus works for existing multi-slot HELD booking (flag-independent)', async () => {
    // updateBookingStatus does NOT check any feature flags — it manages existing bookings
    // regardless of flag state. This prevents orphaned bookings when flags are toggled.
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeHeldBookingForStatus({ slotsRequested: 2 });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ ownerId: 'owner-1' }]),
        booking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus('booking-held-1', 'ACCEPTED');

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. softHoldsEnabled=OFF
// ---------------------------------------------------------------------------

describe('softHoldsEnabled=OFF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.features.softHoldsEnabled = false;
    mockEnv.features.softHoldsDraining = false;
    mockEnv.features.multiSlotBooking = true;
    mockEnv.features.wholeUnitMode = true;
    mockEnv.features.bookingAudit = true;

    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'tenant-1',
      isSuspended: false,
      emailVerified: new Date(),
    });
    (createInternalNotification as jest.Mock).mockResolvedValue({ success: true });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({ success: true });
  });

  it('createHold returns FEATURE_DISABLED regardless of slotsRequested', async () => {
    const result = await createHold('listing-ff-1', futureStart, futureEnd, 1000, 1);

    expect(result.success).toBe(false);
    expect(result.code).toBe('FEATURE_DISABLED');
    expect(result.error).toContain('Hold feature is not currently available');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('existing HELD booking can still be accepted via updateBookingStatus (flag-independent)', async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeHeldBookingForStatus({ slotsRequested: 2 });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ ownerId: 'owner-1' }]),
        booking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus('booking-held-1', 'ACCEPTED');

    expect(result.success).toBe(true);
  });

  it('existing HELD booking can still be cancelled via updateBookingStatus (flag-independent)', async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);

    const booking = makeHeldBookingForStatus({ tenantId: 'tenant-1', slotsRequested: 2 });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{}]),
        booking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      return callback(tx);
    });

    const result = await updateBookingStatus('booking-held-1', 'CANCELLED');

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. softHoldsEnabled=DRAIN (drain sets softHoldsEnabled=false, softHoldsDraining=true)
// ---------------------------------------------------------------------------

describe('softHoldsEnabled=DRAIN', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // When ENABLE_SOFT_HOLDS=drain: softHoldsEnabled is false (only "on" makes it true),
    // softHoldsDraining is true. The createHold guard checks !softHoldsEnabled, so drain
    // blocks new holds identically to OFF.
    mockEnv.features.softHoldsEnabled = false;
    mockEnv.features.softHoldsDraining = true;
    mockEnv.features.multiSlotBooking = true;
    mockEnv.features.wholeUnitMode = true;
    mockEnv.features.bookingAudit = true;

    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'tenant-1',
      isSuspended: false,
      emailVerified: new Date(),
    });
    (createInternalNotification as jest.Mock).mockResolvedValue({ success: true });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({ success: true });
  });

  it('createHold returns FEATURE_DISABLED (drain blocks new holds)', async () => {
    const result = await createHold('listing-ff-1', futureStart, futureEnd, 1000, 1);

    expect(result.success).toBe(false);
    expect(result.code).toBe('FEATURE_DISABLED');
    expect(result.error).toContain('Hold feature is not currently available');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('existing HELD booking can still be managed (accepted or cancelled) during drain', async () => {
    // During drain, new holds are blocked but existing HELD bookings must remain manageable
    // so owners can accept/reject and tenants can cancel without losing their booking.
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeHeldBookingForStatus({ slotsRequested: 1 });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ ownerId: 'owner-1' }]),
        booking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus('booking-held-1', 'ACCEPTED');

    expect(result.success).toBe(true);
  });
});
