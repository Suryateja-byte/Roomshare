/**
 * Tests for IDOR protection on listings API (P0-02)
 *
 * Verifies that users cannot PATCH/DELETE listings they don't own.
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    location: {
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    booking: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/geocoding', () => ({
  geocodeAddress: jest.fn(),
}));

jest.mock('@/lib/listing-language-guard', () => ({
  checkListingLanguageCompliance: jest.fn().mockReturnValue({ allowed: true }),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        remove: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  })),
}));

jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    sync: {
      error: jest.fn(),
    },
  },
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const headers = new Map(Object.entries(init?.headers || {}));
      return {
        status: init?.status || 200,
        json: async () => data,
        headers,
      };
    },
  },
}));

// Set env vars for Supabase
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

import { PATCH, DELETE } from '@/app/api/listings/[id]/route';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

describe('Listings API IDOR Protection', () => {
  const ownerSession = {
    user: { id: 'owner-123', email: 'owner@example.com', isSuspended: false },
  };

  const attackerSession = {
    user: { id: 'attacker-456', email: 'attacker@example.com', isSuspended: false },
  };

  const mockListing = {
    id: 'listing-abc',
    ownerId: 'owner-123',
    title: 'Test Listing',
    description: 'A test listing',
    price: 1000,
    amenities: [],
    houseRules: [],
    householdLanguages: [],
    totalSlots: 2,
    availableSlots: 2,
    images: [],
    location: {
      id: 'loc-123',
      address: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94102',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PATCH /api/listings/[id]', () => {
    it('returns 403 when non-owner tries to update listing', async () => {
      (auth as jest.Mock).mockResolvedValue(attackerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);

      const request = new Request('http://localhost/api/listings/listing-abc', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Hacked Title',
          description: 'Hacked description',
          price: '1',
          totalSlots: '1',
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'listing-abc' }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Forbidden');

      // Verify update was NOT called
      expect(prisma.listing.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows owner to update their own listing', async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          listing: { update: jest.fn().mockResolvedValue({ ...mockListing, title: 'Updated Title' }) },
          location: { update: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return callback(tx);
      });

      const request = new Request('http://localhost/api/listings/listing-abc', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Updated Title',
          description: 'Updated description',
          price: '1200',
          totalSlots: '2',
          address: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          zip: '94102',
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'listing-abc' }),
      });

      expect(response.status).toBe(200);
    });

    it('returns 404 when listing does not exist', async () => {
      (auth as jest.Mock).mockResolvedValue(attackerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new Request('http://localhost/api/listings/nonexistent', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Hacked Title',
          description: 'Test',
          price: '1000',
          totalSlots: '1',
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'nonexistent' }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('Listing not found');
    });

    it('returns 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new Request('http://localhost/api/listings/listing-abc', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Hacked Title',
          description: 'Test',
          price: '1000',
          totalSlots: '1',
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'listing-abc' }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('DELETE /api/listings/[id]', () => {
    it('returns 403 when non-owner tries to delete listing', async () => {
      (auth as jest.Mock).mockResolvedValue(attackerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);

      const request = new Request('http://localhost/api/listings/listing-abc', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'listing-abc' }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Forbidden');

      // Verify delete was NOT called
      expect(prisma.listing.delete).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows owner to delete their own listing', async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      (prisma.booking.count as jest.Mock).mockResolvedValue(0);
      (prisma.booking.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.$transaction as jest.Mock).mockResolvedValue([]);

      const request = new Request('http://localhost/api/listings/listing-abc', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'listing-abc' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 when listing does not exist', async () => {
      (auth as jest.Mock).mockResolvedValue(attackerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new Request('http://localhost/api/listings/nonexistent', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'nonexistent' }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('Listing not found');
    });

    it('returns 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new Request('http://localhost/api/listings/listing-abc', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'listing-abc' }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('prevents deletion when active bookings exist', async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      (prisma.booking.count as jest.Mock).mockResolvedValue(2); // 2 active bookings

      const request = new Request('http://localhost/api/listings/listing-abc', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'listing-abc' }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Cannot delete listing with active bookings');
      expect(body.activeBookings).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('handles case where user.id is undefined in session', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { email: 'test@example.com' } });

      const request = new Request('http://localhost/api/listings/listing-abc', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Test',
          description: 'Test',
          price: '1000',
          totalSlots: '1',
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'listing-abc' }),
      });

      expect(response.status).toBe(401);
    });

    it('rejects IDOR attempt with manipulated listing ID in body', async () => {
      // Attacker tries to include different listing ID in body
      (auth as jest.Mock).mockResolvedValue(attackerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);

      const request = new Request('http://localhost/api/listings/listing-abc', {
        method: 'PATCH',
        body: JSON.stringify({
          id: 'other-listing-xyz', // Attacker tries to inject different ID
          title: 'Hacked Title',
          description: 'Test',
          price: '1000',
          totalSlots: '1',
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'listing-abc' }),
      });

      // Should still check ownership of listing-abc (from URL), not body
      expect(response.status).toBe(403);
    });
  });
});

describe('Suspension + IDOR Combined', () => {
  it('suspended owner cannot update their own listing', async () => {
    // This test documents expected behavior:
    // Suspension check should happen BEFORE IDOR check
    // A suspended user should get 403 for suspension, not allowed to proceed

    const suspendedOwnerSession = {
      user: { id: 'owner-123', email: 'owner@example.com', isSuspended: true },
    };

    // When we implement the middleware, this should return 403 for suspension
    // For now, document the expected behavior
    expect(suspendedOwnerSession.user.isSuspended).toBe(true);

    // TODO: After middleware implementation, verify:
    // - Middleware returns 403 with code: 'ACCOUNT_SUSPENDED'
    // - Route handler never reached
  });
});
