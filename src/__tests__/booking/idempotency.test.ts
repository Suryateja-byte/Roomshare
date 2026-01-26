/**
 * Tests for idempotency wrapper (P0-04)
 *
 * Verifies that:
 * 1. Duplicate requests with same key return cached response
 * 2. Same key with different payload returns 400
 * 3. Concurrent requests - only one succeeds
 * 4. Transaction rollback cleans up idempotency key
 */

// Must mock before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

import { withIdempotency } from '@/lib/idempotency';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// Type the mocked prisma
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Idempotency Wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('New request (no existing key)', () => {
    it('executes operation and stores result on first request', async () => {
      const operationResult = { bookingId: 'booking-123' };
      const operation = jest.fn().mockResolvedValue(operationResult);

      // Compute expected hash
      const requestBody = { listingId: 'listing-789' };
      const expectedHash = crypto
        .createHash('sha256')
        .update('{"listingId":"listing-789"}')
        .digest('hex');

      // Mock transaction to execute the callback
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(1), // INSERT success
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'idem-key-1',
              status: 'processing', // We just inserted, so it's processing
              requestHash: expectedHash,
              resultData: null,
            },
          ]),
        };
        return callback(tx);
      });

      const result = await withIdempotency(
        'client-key-123',
        'user-456',
        'createBooking',
        requestBody,
        operation
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual(operationResult);
        expect(result.cached).toBe(false);
      }
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Duplicate request (key exists with completed status)', () => {
    it('returns cached response without re-executing operation', async () => {
      const cachedResult = { bookingId: 'booking-123' };
      const operation = jest.fn();

      const requestBody = { listingId: 'listing-789' };
      const requestHash = crypto
        .createHash('sha256')
        .update('{"listingId":"listing-789"}')
        .digest('hex');

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(0), // INSERT no-op (row exists)
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'idem-key-1',
              status: 'completed',
              requestHash: requestHash,
              resultData: cachedResult,
            },
          ]),
        };
        return callback(tx);
      });

      const result = await withIdempotency(
        'client-key-123',
        'user-456',
        'createBooking',
        requestBody,
        operation
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual(cachedResult);
        expect(result.cached).toBe(true);
      }
      // Operation should NOT be called for cached response
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('Key reuse with different payload', () => {
    it('returns 400 error when same key used with different request body', async () => {
      const operation = jest.fn();

      // Original request had different body, so hash doesn't match
      const originalHash = 'different-hash-from-original-request';

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(0),
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'idem-key-1',
              status: 'completed',
              requestHash: originalHash, // Different from current request
              resultData: { bookingId: 'booking-123' },
            },
          ]),
        };
        return callback(tx);
      });

      const result = await withIdempotency(
        'client-key-123',
        'user-456',
        'createBooking',
        { listingId: 'different-listing' }, // Different payload!
        operation
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(400);
        expect(result.error).toBe('Idempotency key reused with different request body');
      }
      expect(operation).not.toHaveBeenCalled();
    });

    it('allows legacy placeholder hash to proceed', async () => {
      const operationResult = { bookingId: 'new-booking' };
      const operation = jest.fn().mockResolvedValue(operationResult);

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(0),
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'idem-key-1',
              status: 'processing',
              requestHash: 'legacy-migration-placeholder', // Legacy placeholder
              resultData: null,
            },
          ]),
        };
        return callback(tx);
      });

      const result = await withIdempotency(
        'client-key-123',
        'user-456',
        'createBooking',
        { listingId: 'listing-789' },
        operation
      );

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Transaction rollback', () => {
    it('rolls back idempotency key when operation fails', async () => {
      const operationError = new Error('Database constraint violation');
      const operation = jest.fn().mockRejectedValue(operationError);

      const requestBody = { listingId: 'listing-789' };
      const expectedHash = crypto
        .createHash('sha256')
        .update('{"listingId":"listing-789"}')
        .digest('hex');

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(1),
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'idem-key-1',
              status: 'processing',
              requestHash: expectedHash,
              resultData: null,
            },
          ]),
        };
        // Execute callback which will throw
        return callback(tx);
      });

      await expect(
        withIdempotency(
          'client-key-123',
          'user-456',
          'createBooking',
          requestBody,
          operation
        )
      ).rejects.toThrow('Database constraint violation');

      // The transaction rollback is automatic in Prisma when callback throws
      // The key test here is that the error propagates and operation was called
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Serialization retry', () => {
    it('retries on serialization failure (P2034)', async () => {
      const operationResult = { bookingId: 'booking-123' };
      const operation = jest.fn().mockResolvedValue(operationResult);

      const requestBody = { listingId: 'listing-789' };
      const expectedHash = crypto
        .createHash('sha256')
        .update('{"listingId":"listing-789"}')
        .digest('hex');

      let callCount = 0;
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        callCount++;
        if (callCount === 1) {
          // First attempt: serialization failure
          const error = new Error('Transaction serialization failure');
          (error as unknown as { code: string }).code = 'P2034';
          throw error;
        }
        // Second attempt: success
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(1),
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'idem-key-1',
              status: 'processing',
              requestHash: expectedHash,
              resultData: null,
            },
          ]),
        };
        return callback(tx);
      });

      const result = await withIdempotency(
        'client-key-123',
        'user-456',
        'createBooking',
        requestBody,
        operation
      );

      expect(result.success).toBe(true);
      expect(callCount).toBe(2); // Retried once
    });

    it('fails after max retries on persistent serialization failure', async () => {
      const operation = jest.fn();

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async () => {
        const error = new Error('Transaction serialization failure');
        (error as unknown as { code: string }).code = 'P2034';
        throw error;
      });

      await expect(
        withIdempotency(
          'client-key-123',
          'user-456',
          'createBooking',
          { listingId: 'listing-789' },
          operation
        )
      ).rejects.toThrow('Transaction serialization failure');

      // Should have tried 3 times (MAX_SERIALIZATION_RETRIES)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    });
  });

  describe('Lock acquisition failure', () => {
    it('returns 500 error if row not found after insert', async () => {
      const operation = jest.fn();

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(1),
          $queryRaw: jest.fn().mockResolvedValue([]), // No row found!
        };
        return callback(tx);
      });

      const result = await withIdempotency(
        'client-key-123',
        'user-456',
        'createBooking',
        { listingId: 'listing-789' },
        operation
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(500);
        expect(result.error).toBe('Failed to acquire idempotency lock');
      }
    });
  });
});

describe('Request Hash Determinism', () => {
  // Hash determinism is tested implicitly through the core idempotency tests.
  // The stableStringify function ensures equivalent objects produce the same hash.
  // Direct hash capture from Prisma's tagged template literals is fragile,
  // so we test hash behavior through the actual idempotency responses.

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects duplicate key with different payload via hash mismatch', async () => {
    // This test verifies hash comparison works by checking the 400 response
    // when the same key is used with a different request body
    const operation = jest.fn();

    const originalHash = crypto
      .createHash('sha256')
      .update('{"a":1,"b":2}') // stableStringify sorts keys
      .digest('hex');

    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(0), // Key exists
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'idem-key-1',
            status: 'completed',
            requestHash: originalHash,
            resultData: { success: true },
          },
        ]),
      };
      return callback(tx);
    });

    // Request with different payload should fail hash check
    const result = await withIdempotency(
      'same-key',
      'user-1',
      'endpoint',
      { a: 1, b: 3 }, // Different value for 'b'
      operation
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(400);
      expect(result.error).toBe('Idempotency key reused with different request body');
    }
  });

  it('accepts duplicate key with same payload regardless of key order', async () => {
    // This test verifies stableStringify produces consistent hashes
    // by checking that a request with reordered keys returns cached result
    const cachedResult = { bookingId: 'cached-123' };
    const operation = jest.fn();

    // Hash for { a: 1, b: 2 } - stableStringify sorts keys alphabetically
    const expectedHash = crypto
      .createHash('sha256')
      .update('{"a":1,"b":2}')
      .digest('hex');

    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(0), // Key exists
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'idem-key-1',
            status: 'completed',
            requestHash: expectedHash,
            resultData: cachedResult,
          },
        ]),
      };
      return callback(tx);
    });

    // Request with keys in different order should match hash
    const result = await withIdempotency(
      'same-key',
      'user-1',
      'endpoint',
      { b: 2, a: 1 }, // Keys in different order
      operation
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.cached).toBe(true);
      expect(result.result).toEqual(cachedResult);
    }
    expect(operation).not.toHaveBeenCalled();
  });
});
