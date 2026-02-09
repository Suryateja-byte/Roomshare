/**
 * Tests for booking race condition prevention (P0-03)
 *
 * Verifies that:
 * 1. SERIALIZABLE isolation level prevents race conditions
 * 2. FOR UPDATE lock is used on listing row
 * 3. Serialization failures trigger retry
 * 4. Transaction rollback on downstream failure
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

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
}));

import { createBooking } from '@/app/actions/booking';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { createInternalNotification } from '@/lib/notifications';
import { sendNotificationEmailWithPreference } from '@/lib/email';
import { Prisma } from '@prisma/client';

describe('Booking Race Condition Prevention', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
  };

  const mockListing = {
    id: 'listing-abc',
    title: 'Test Listing',
    ownerId: 'owner-456',
    totalSlots: 1,
    availableSlots: 1,
    status: 'ACTIVE',
  };

  const mockOwner = {
    id: 'owner-456',
    name: 'Owner Name',
    email: 'owner@example.com',
  };

  const mockTenant = {
    id: 'user-123',
    name: 'Tenant Name',
  };

  // Use future dates to pass validation
  const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000);

  const mockBooking = {
    id: 'booking-new',
    listingId: 'listing-abc',
    tenantId: 'user-123',
    startDate: futureStart,
    endDate: futureEnd,
    totalPrice: 4800,
    status: 'PENDING',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null);
    // Mock user.findUnique for suspension and email verification checks
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-123',
      isSuspended: false,
      emailVerified: new Date(),
    });
    (createInternalNotification as jest.Mock).mockResolvedValue({ success: true });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({ success: true });
  });

  describe('SERIALIZABLE isolation level', () => {
    it('uses SERIALIZABLE isolation level in transaction', async () => {
      let capturedOptions: { isolationLevel?: string } | undefined;

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback, options) => {
        capturedOptions = options;

        const tx = {
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockResolvedValue(mockBooking),
          },
          user: {
            findUnique: jest.fn().mockImplementation(({ where }) => {
              if (where.id === 'owner-456') return Promise.resolve(mockOwner);
              if (where.id === 'user-123') return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
          },
          $queryRaw: jest.fn().mockResolvedValue([mockListing]),
        };
        return callback(tx);
      });

      await createBooking('listing-abc', futureStart, futureEnd, 1000);

      expect(capturedOptions?.isolationLevel).toBe(Prisma.TransactionIsolationLevel.Serializable);
    });

    it('uses FOR UPDATE lock on listing query', async () => {
      let capturedQuery: string | undefined;

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockResolvedValue(mockBooking),
          },
          user: {
            findUnique: jest.fn().mockImplementation(({ where }) => {
              if (where.id === 'owner-456') return Promise.resolve(mockOwner);
              if (where.id === 'user-123') return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
          },
          $queryRaw: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
            // Capture the query string from the tagged template literal
            capturedQuery = strings.join('?');
            return [mockListing];
          }),
        };
        return callback(tx);
      });

      await createBooking('listing-abc', futureStart, futureEnd, 1000);

      // Verify FOR UPDATE is in the query
      expect(capturedQuery).toBeDefined();
      expect(capturedQuery).toContain('FOR UPDATE');
    });
  });

  describe('Concurrent booking handling', () => {
    it('retries on serialization failure (P2034)', async () => {
      let attemptCount = 0;

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        attemptCount++;
        if (attemptCount < 3) {
          // Simulate serialization failure
          const error = new Error('Transaction serialization failure') as Error & { code: string };
          error.code = 'P2034';
          throw error;
        }
        // Third attempt succeeds
        const tx = {
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockResolvedValue(mockBooking),
          },
          user: {
            findUnique: jest.fn().mockImplementation(({ where }) => {
              if (where.id === 'owner-456') return Promise.resolve(mockOwner);
              if (where.id === 'user-123') return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
          },
          $queryRaw: jest.fn().mockResolvedValue([mockListing]),
        };
        return callback(tx);
      });

      const result = await createBooking('listing-abc', futureStart, futureEnd, 1000);

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3); // Retried twice
    });

    it('fails after max retries on persistent serialization failure', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async () => {
        const error = new Error('Transaction serialization failure') as Error & { code: string };
        error.code = 'P2034';
        throw error;
      });

      const result = await createBooking('listing-abc', futureStart, futureEnd, 1000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create booking');
      // Should have tried 3 times (MAX_RETRIES)
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it('rejects booking when no slots available', async () => {
      const noSlotsListing = {
        ...mockListing,
        availableSlots: 0,
        totalSlots: 1,
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(1), // 1 accepted booking = no slots
          },
          user: {
            findUnique: jest.fn().mockResolvedValue(mockOwner),
          },
          $queryRaw: jest.fn().mockResolvedValue([noSlotsListing]),
        };
        return callback(tx);
      });

      const result = await createBooking('listing-abc', futureStart, futureEnd, 1000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No available slots');
    });
  });

  describe('Duplicate booking prevention', () => {
    it('rejects duplicate booking request for same dates', async () => {
      const existingBooking = {
        id: 'existing-booking',
        tenantId: 'user-123',
        listingId: 'listing-abc',
        status: 'PENDING',
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          booking: {
            findFirst: jest.fn().mockResolvedValue(existingBooking),
          },
          $queryRaw: jest.fn().mockResolvedValue([mockListing]),
        };
        return callback(tx);
      });

      const result = await createBooking('listing-abc', futureStart, futureEnd, 1000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already have a booking request');
    });

    it('prevents owner from booking own listing', async () => {
      // Session user is the owner
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'owner-456', email: 'owner@example.com' } });
      // Need to also update user.findUnique for suspension check
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'owner-456',
        isSuspended: false,
        emailVerified: new Date(),
      });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
          user: {
            findUnique: jest.fn().mockResolvedValue(mockOwner),
          },
          $queryRaw: jest.fn().mockResolvedValue([mockListing]),
        };
        return callback(tx);
      });

      const result = await createBooking('listing-abc', futureStart, futureEnd, 1000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot book your own listing');
    });
  });

  describe('Transaction rollback', () => {
    it('rolls back on booking creation failure', async () => {
      const createError = new Error('Database constraint violation');

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockRejectedValue(createError),
          },
          user: {
            findUnique: jest.fn().mockImplementation(({ where }) => {
              if (where.id === 'owner-456') return Promise.resolve(mockOwner);
              if (where.id === 'user-123') return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
          },
          $queryRaw: jest.fn().mockResolvedValue([mockListing]),
        };
        return callback(tx);
      });

      const result = await createBooking('listing-abc', futureStart, futureEnd, 1000);

      // Transaction should have rolled back, returning error
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create booking');
    });

    it('returns error when listing not found', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
          $queryRaw: jest.fn().mockResolvedValue([]), // No listing found
        };
        return callback(tx);
      });

      const result = await createBooking('nonexistent-listing', futureStart, futureEnd, 1000);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Listing not found');
    });

    it('returns error when listing is not ACTIVE', async () => {
      const inactiveListing = { ...mockListing, status: 'INACTIVE' };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
          user: {
            findUnique: jest.fn().mockResolvedValue(mockOwner),
          },
          $queryRaw: jest.fn().mockResolvedValue([inactiveListing]),
        };
        return callback(tx);
      });

      const result = await createBooking('listing-abc', futureStart, futureEnd, 1000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not currently available');
    });
  });
});

// NOTE: Idempotency Key Storage tests have been moved to idempotency.test.ts
// The P0-04 bug (key stored AFTER transaction) has been fixed by using the
// withIdempotency wrapper which handles idempotency atomically.
// See src/__tests__/booking/idempotency.test.ts for comprehensive idempotency tests.
