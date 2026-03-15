/**
 * Tests for slot boundary conditions with multi-slot bookings.
 *
 * Covers:
 * 1. Exact capacity fill — booking/hold that fills to 0, 1 over fails
 * 2. Slot restoration clamping — LEAST() ensures availableSlots never exceeds totalSlots
 * 3. slotsRequested edge values — min=1, max=20, over-available fails capacity check
 */

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
  RATE_LIMITS: { createBooking: { limit: 10, windowMs: 3600000 }, createBookingByIp: { limit: 30, windowMs: 3600000 }, createHold: { limit: 10, windowMs: 3600000 }, createHoldByIp: { limit: 30, windowMs: 3600000 }, createHoldPerListing: { limit: 3, windowMs: 3600000 }, bookingStatus: { limit: 30, windowMs: 60000 } },
}));
jest.mock('next/headers', () => ({ headers: jest.fn().mockResolvedValue(new Headers()) }));
jest.mock('@/lib/logger', () => ({ logger: { sync: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } } }));
jest.mock('@prisma/client', () => ({ Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable', ReadCommitted: 'ReadCommitted', RepeatableRead: 'RepeatableRead', ReadUncommitted: 'ReadUncommitted' } } }));
jest.mock('@/lib/env', () => ({ features: { softHoldsEnabled: true, softHoldsDraining: false, multiSlotBooking: true, wholeUnitMode: true, bookingAudit: true }, getServerEnv: jest.fn(() => ({})) }));
jest.mock('@/lib/idempotency', () => ({ withIdempotency: jest.fn() }));
jest.mock('@/lib/booking-state-machine', () => ({
  validateTransition: jest.fn(),
  isInvalidStateTransitionError: jest.fn().mockReturnValue(false),
}));

import { createBooking, createHold } from '@/app/actions/booking';
import { updateBookingStatus } from '@/app/actions/manage-booking';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { createInternalNotification } from '@/lib/notifications';
import { sendNotificationEmailWithPreference } from '@/lib/email';

const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000);

// Shared tenant session
const tenantSession = { user: { id: 'tenant-123', email: 'tenant@example.com' } };

const mockOwner = { id: 'owner-456', name: 'Owner', email: 'owner@example.com' };
const mockTenant = { id: 'tenant-123', name: 'Tenant' };

/**
 * Build a tx mock for createBooking's executeBookingTransaction:
 *   - booking.findFirst → null (no duplicate)
 *   - $queryRaw[0] → [listing] (FOR UPDATE)
 *   - $queryRaw[1] → [{ total: usedSlots }] (SUM ACCEPTED)
 *   - user.findUnique → owner or tenant by id
 *   - booking.create → createdBooking
 */
function makeBookingTx(
  listing: Record<string, unknown>,
  usedSlots: bigint,
  createdBooking: Record<string, unknown>
) {
  return {
    booking: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdBooking),
    },
    user: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'owner-456') return Promise.resolve(mockOwner);
        if (where.id === 'tenant-123') return Promise.resolve(mockTenant);
        return Promise.resolve(null);
      }),
    },
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([listing])
      .mockResolvedValueOnce([{ total: usedSlots }]),
  };
}

/**
 * Build a tx mock for createHold's executeHoldTransaction:
 *   - $queryRaw[0] → [{ count: holdCount }] (active holds COUNT)
 *   - $queryRaw[1] → [listing] (FOR UPDATE)
 *   - $queryRaw[2] → [{ total: usedSlots }] (SUM ACCEPTED+HELD)
 *   - booking.findFirst → null (no duplicate)
 *   - $executeRaw → decrementResult (1 = success, 0 = failure)
 *   - user.findUnique → owner or tenant
 *   - booking.create → createdHold
 */
function makeHoldTx(
  listing: Record<string, unknown>,
  usedSlots: bigint,
  decrementResult: number,
  createdHold: Record<string, unknown>
) {
  return {
    booking: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdHold),
    },
    user: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'owner-456') return Promise.resolve(mockOwner);
        if (where.id === 'tenant-123') return Promise.resolve(mockTenant);
        return Promise.resolve(null);
      }),
    },
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([{ count: BigInt(0) }])   // active holds for user
      .mockResolvedValueOnce([listing])                 // FOR UPDATE
      .mockResolvedValueOnce([{ total: usedSlots }]),   // SUM ACCEPTED+HELD
    $executeRaw: jest.fn().mockResolvedValue(decrementResult),
  };
}

/**
 * Build a booking record returned by prisma.booking.findUnique for cancel tests.
 * Includes the `listing` include shape that manage-booking.ts uses.
 */
function makeBookingRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-cancel-1',
    listingId: 'listing-abc',
    tenantId: 'tenant-123',
    status: 'ACCEPTED',
    slotsRequested: 3,
    version: 1,
    startDate: futureStart,
    endDate: futureEnd,
    totalPrice: 9600,
    heldUntil: null,
    listing: {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      availableSlots: 0,
      title_plain: 'Test Listing',
      owner: { name: 'Owner' },
    },
    tenant: {
      id: 'tenant-123',
      name: 'Tenant',
      email: 'tenant@example.com',
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Exact capacity fill
// ─────────────────────────────────────────────────────────────────────────────

describe('Exact capacity fill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'tenant-123',
      isSuspended: false,
      emailVerified: new Date(),
    });
    (createInternalNotification as jest.Mock).mockResolvedValue({ success: true });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({ success: true });
  });

  it('createBooking succeeds when slotsRequested exactly fills remaining capacity to 0', async () => {
    // totalSlots=4, usedSlots=2, slotsRequested=2 → 2+2 == 4 (not >4) → succeeds
    const listing = {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      totalSlots: 4,
      availableSlots: 2,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
    };
    const createdBooking = {
      id: 'booking-new',
      listingId: 'listing-abc',
      tenantId: 'tenant-123',
      startDate: futureStart,
      endDate: futureEnd,
      totalPrice: 6400,
      status: 'PENDING',
      slotsRequested: 2,
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(makeBookingTx(listing, BigInt(2), createdBooking));
    });

    const result = await createBooking('listing-abc', futureStart, futureEnd, 1000, 2);

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe('booking-new');
  });

  it('createBooking fails when slotsRequested would exceed totalSlots by 1', async () => {
    // totalSlots=4, usedSlots=2, slotsRequested=3 → 2+3=5 > 4 → fails
    const listing = {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      totalSlots: 4,
      availableSlots: 2,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue(mockOwner),
        },
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([listing])
          .mockResolvedValueOnce([{ total: BigInt(2) }]),
      };
      return callback(tx);
    });

    const result = await createBooking('listing-abc', futureStart, futureEnd, 1000, 3);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not enough available slots');
  });

  it('createHold succeeds when slotsRequested exactly fills remaining capacity to 0', async () => {
    // totalSlots=3, usedSlots=0, availableSlots=3, slotsRequested=3 → 0+3==3 → succeeds
    const listing = {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      totalSlots: 3,
      availableSlots: 3,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
      holdTtlMinutes: 60,
    };
    const createdHold = {
      id: 'hold-new',
      listingId: 'listing-abc',
      tenantId: 'tenant-123',
      startDate: futureStart,
      endDate: futureEnd,
      totalPrice: 9600,
      status: 'HELD',
      slotsRequested: 3,
      heldUntil: new Date(Date.now() + 60 * 60 * 1000),
      heldAt: new Date(),
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(makeHoldTx(listing, BigInt(0), 1, createdHold));
    });

    const result = await createHold('listing-abc', futureStart, futureEnd, 1000, 3);

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe('hold-new');
  });

  it('createHold fails when slotsRequested exceeds totalSlots', async () => {
    // totalSlots=3, usedSlots=1, slotsRequested=3 → 1+3=4 > 3 → fails
    const listing = {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      totalSlots: 3,
      availableSlots: 2,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
      holdTtlMinutes: 60,
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue(mockOwner),
        },
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ count: BigInt(0) }])
          .mockResolvedValueOnce([listing])
          .mockResolvedValueOnce([{ total: BigInt(1) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      return callback(tx);
    });

    const result = await createHold('listing-abc', futureStart, futureEnd, 1000, 3);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not enough available slots');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Slot restoration clamping
// ─────────────────────────────────────────────────────────────────────────────

describe('Slot restoration clamping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'tenant-123',
      isSuspended: false,
      emailVerified: new Date(),
    });
    (createInternalNotification as jest.Mock).mockResolvedValue({ success: true });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({ success: true });
  });

  it('restoring slots from an ACCEPTED booking does not exceed totalSlots (LEAST clamp)', async () => {
    // Simulates drift: availableSlots already at totalSlots due to prior correction,
    // but we cancel a 3-slot ACCEPTED booking. The LEAST() clamp must fire.
    const booking = makeBookingRecord({ status: 'ACCEPTED', slotsRequested: 3 });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1); // $executeRaw for slot restore
    const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockQueryRaw = jest.fn().mockResolvedValue([1]); // FOR UPDATE SELECT 1

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: mockUpdateMany,
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus('booking-cancel-1', 'CANCELLED');

    expect(result.success).toBe(true);

    // $executeRaw must have been called for the LEAST restore
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    // Verify the LEAST expression is present in the raw SQL template
    const executeRawCall = mockExecuteRaw.mock.calls[0];
    const sqlParts = Array.from(executeRawCall[0] as TemplateStringsArray);
    const fullSql = sqlParts.join('?');
    expect(fullSql).toContain('LEAST');
    expect(fullSql).toContain('availableSlots');
    expect(fullSql).toContain('totalSlots');
  });

  it('cancelling an ACCEPTED 5-slot booking when availableSlots=0 correctly calls restore', async () => {
    // availableSlots=0, totalSlots=5, slotsToRestore=5 → LEAST(0+5, 5)=5
    const booking = makeBookingRecord({
      status: 'ACCEPTED',
      slotsRequested: 5,
      listing: {
        id: 'listing-abc',
        title: 'Test Listing',
        ownerId: 'owner-456',
        availableSlots: 0,
        owner: { name: 'Owner' },
      },
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);
    const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([1]),
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: mockUpdateMany,
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus('booking-cancel-1', 'CANCELLED');

    expect(result.success).toBe(true);
    // The restore uses booking.slotsRequested = 5
    const executeRawCall = mockExecuteRaw.mock.calls[0];
    const interpolatedValues = executeRawCall.slice(1); // values after the template
    // slotsRequested (5) is interpolated into the LEAST expression
    expect(interpolatedValues).toContain(5);
  });

  it('cancelling a HELD booking restores slots via LEAST clamp', async () => {
    const booking = makeBookingRecord({
      status: 'HELD',
      slotsRequested: 2,
      heldUntil: new Date(Date.now() + 60 * 60 * 1000), // not expired
      listing: {
        id: 'listing-abc',
        title: 'Test Listing',
        ownerId: 'owner-456',
        availableSlots: 1,
        owner: { name: 'Owner' },
      },
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);
    const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([1]),
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: mockUpdateMany,
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus('booking-cancel-1', 'CANCELLED');

    expect(result.success).toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const executeRawCall = mockExecuteRaw.mock.calls[0];
    const sqlParts = Array.from(executeRawCall[0] as TemplateStringsArray);
    const fullSql = sqlParts.join('?');
    expect(fullSql).toContain('LEAST');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. slotsRequested edge values
// ─────────────────────────────────────────────────────────────────────────────

describe('slotsRequested edge values', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'tenant-123',
      isSuspended: false,
      emailVerified: new Date(),
    });
    (createInternalNotification as jest.Mock).mockResolvedValue({ success: true });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({ success: true });
  });

  it('slotsRequested=1 (minimum) creates booking successfully', async () => {
    const listing = {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      totalSlots: 5,
      availableSlots: 5,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
    };
    const createdBooking = {
      id: 'booking-min',
      listingId: 'listing-abc',
      tenantId: 'tenant-123',
      startDate: futureStart,
      endDate: futureEnd,
      totalPrice: 3200,
      status: 'PENDING',
      slotsRequested: 1,
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(makeBookingTx(listing, BigInt(0), createdBooking));
    });

    const result = await createBooking('listing-abc', futureStart, futureEnd, 1000, 1);

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe('booking-min');
  });

  it('slotsRequested=20 (maximum) creates booking when totalSlots >= 20', async () => {
    const listing = {
      id: 'listing-large',
      title: 'Large Listing',
      ownerId: 'owner-456',
      totalSlots: 20,
      availableSlots: 20,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
    };
    const createdBooking = {
      id: 'booking-max',
      listingId: 'listing-large',
      tenantId: 'tenant-123',
      startDate: futureStart,
      endDate: futureEnd,
      totalPrice: 64000,
      status: 'PENDING',
      slotsRequested: 20,
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(makeBookingTx(listing, BigInt(0), createdBooking));
    });

    const result = await createBooking('listing-large', futureStart, futureEnd, 1000, 20);

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe('booking-max');
  });

  it('slotsRequested > availableSlots but <= totalSlots fails capacity check (usedSlots blocks it)', async () => {
    // totalSlots=10, usedSlots=8, availableSlots=2, slotsRequested=5
    // → usedSlots(8) + slotsRequested(5) = 13 > totalSlots(10) → fails
    const listing = {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      totalSlots: 10,
      availableSlots: 2,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue(mockOwner),
        },
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([listing])
          .mockResolvedValueOnce([{ total: BigInt(8) }]), // 8 slots used by ACCEPTED bookings
      };
      return callback(tx);
    });

    const result = await createBooking('listing-abc', futureStart, futureEnd, 1000, 5);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not enough available slots');
  });

  it('slotsRequested=1 creates a hold successfully', async () => {
    const listing = {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      totalSlots: 4,
      availableSlots: 4,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
      holdTtlMinutes: 60,
    };
    const createdHold = {
      id: 'hold-min',
      listingId: 'listing-abc',
      tenantId: 'tenant-123',
      startDate: futureStart,
      endDate: futureEnd,
      totalPrice: 3200,
      status: 'HELD',
      slotsRequested: 1,
      heldUntil: new Date(Date.now() + 60 * 60 * 1000),
      heldAt: new Date(),
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(makeHoldTx(listing, BigInt(0), 1, createdHold));
    });

    const result = await createHold('listing-abc', futureStart, futureEnd, 1000, 1);

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe('hold-min');
  });

  it('createHold: $executeRaw returning 0 yields "No available slots" error (defense-in-depth path)', async () => {
    // The defense-in-depth check: availableSlots < effectiveSlotsRequested passes in capacity check
    // but $executeRaw returns 0 (conditional UPDATE finds no row with sufficient slots)
    const listing = {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      totalSlots: 5,
      availableSlots: 5,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
      holdTtlMinutes: 60,
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(makeHoldTx(listing, BigInt(0), 0, {}));
    });

    const result = await createHold('listing-abc', futureStart, futureEnd, 1000, 2);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No available slots for this listing.');
  });

  it('slotsRequested=3 with only 2 slots available blocks createBooking via capacity check', async () => {
    // totalSlots=5, usedSlots=3, availableSlots=2, slotsRequested=3
    // → usedSlots(3) + slotsRequested(3) = 6 > totalSlots(5) → fails
    const listing = {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      totalSlots: 5,
      availableSlots: 2,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue(mockOwner),
        },
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([listing])
          .mockResolvedValueOnce([{ total: BigInt(3) }]),
      };
      return callback(tx);
    });

    const result = await createBooking('listing-abc', futureStart, futureEnd, 1000, 3);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not enough available slots');
  });

  it('PENDING booking does not consume slots — capacity check ignores PENDING', async () => {
    // totalSlots=3, usedSlots=0 (only PENDING exist, not counted in SUM ACCEPTED)
    // slotsRequested=3 → 0+3==3 (not >3) → succeeds
    const listing = {
      id: 'listing-abc',
      title: 'Test Listing',
      ownerId: 'owner-456',
      totalSlots: 3,
      availableSlots: 3,
      status: 'ACTIVE',
      price: 1000,
      bookingMode: 'SHARED',
    };
    const createdBooking = {
      id: 'booking-pending-ok',
      listingId: 'listing-abc',
      tenantId: 'tenant-123',
      startDate: futureStart,
      endDate: futureEnd,
      totalPrice: 9600,
      status: 'PENDING',
      slotsRequested: 3,
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      // usedSlots = 0 because PENDING bookings are not counted in SUM ACCEPTED
      return callback(makeBookingTx(listing, BigInt(0), createdBooking));
    });

    const result = await createBooking('listing-abc', futureStart, futureEnd, 1000, 3);

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe('booking-pending-ok');
  });

  it('cancelling a PENDING booking does not call $executeRaw for slot restore', async () => {
    // PENDING → CANCELLED: no slots consumed, so no $executeRaw restore
    const booking = makeBookingRecord({
      status: 'PENDING',
      slotsRequested: 4,
      tenantId: 'tenant-123',
      listing: {
        id: 'listing-abc',
        title: 'Test Listing',
        ownerId: 'owner-456',
        availableSlots: 0,
        owner: { name: 'Owner' },
      },
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn(),
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: mockUpdateMany,
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus('booking-cancel-1', 'CANCELLED');

    expect(result.success).toBe(true);
    // PENDING cancel path: no $executeRaw for slot restore should be called
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});
