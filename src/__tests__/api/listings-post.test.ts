/**
 * Extended POST /api/listings tests
 *
 * Covers edge cases and audit features NOT covered by the base listings.test.ts:
 *   - Idempotency (X-Idempotency-Key header, cached vs fresh, 409 conflicts)
 *   - Enum validation (roomType, leaseDuration, 'any' rejection)
 *   - Image validation (empty, >10, non-Supabase URLs)
 *   - Language compliance (title / description rejection)
 *   - Price and slot boundary values
 *   - Zip code format validation
 *   - Side effects verification (search sync, alerts, dirty marker)
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: {
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    location: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/geocoding', () => ({
  geocodeAddress: jest.fn(),
}))

jest.mock('@/lib/data', () => ({
  getListings: jest.fn(),
}))

jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
    },
  },
}))

jest.mock('@/app/actions/suspension', () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}))

jest.mock('@/lib/listing-language-guard', () => ({
  checkListingLanguageCompliance: jest.fn().mockReturnValue({ allowed: true }),
}))

jest.mock('@/lib/languages', () => ({
  isValidLanguageCode: jest.fn().mockReturnValue(true),
}))

jest.mock('@/lib/idempotency', () => ({
  withIdempotency: jest.fn(),
}))

jest.mock('@/lib/search/search-doc-sync', () => ({
  upsertSearchDocSync: jest.fn().mockResolvedValue(true),
}))

jest.mock('@/lib/search-alerts', () => ({
  triggerInstantAlerts: jest.fn().mockResolvedValue({ sent: 0, errors: 0 }),
}))

jest.mock('@/lib/search/search-doc-dirty', () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/schemas', () => {
  const actual = jest.requireActual('@/lib/schemas')
  return actual
})

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const headersMap = new Map<string, string>()
      if (init?.headers) {
        Object.entries(init.headers).forEach(([k, v]) => headersMap.set(k, v))
      }
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: headersMap,
      }
    },
  },
}))

import { POST } from '@/app/api/listings/route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { geocodeAddress } from '@/lib/geocoding'
import { checkSuspension, checkEmailVerified } from '@/app/actions/suspension'
import { checkListingLanguageCompliance } from '@/lib/listing-language-guard'
import { withIdempotency } from '@/lib/idempotency'
import { upsertSearchDocSync } from '@/lib/search/search-doc-sync'
import { triggerInstantAlerts } from '@/lib/search-alerts'
import { markListingDirty } from '@/lib/search/search-doc-dirty'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockSession = {
  user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
}

const validBody = {
  title: 'Cozy Room in Downtown',
  description: 'A nice place to stay with great amenities and city views',
  price: '800',
  amenities: 'Wifi,AC',
  houseRules: '',
  address: '123 Main St',
  city: 'San Francisco',
  state: 'CA',
  zip: '94102',
  roomType: 'Private Room',
  totalSlots: '1',
  images: [
    'https://abc123.supabase.co/storage/v1/object/public/images/listings/user-123/test.jpg',
  ],
}

const mockListing = {
  id: 'listing-new',
  title: 'Cozy Room in Downtown',
  description: 'A nice place to stay with great amenities and city views',
  price: 800,
  roomType: 'Private Room',
  leaseDuration: null,
  amenities: ['Wifi', 'AC'],
  houseRules: [],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, headers?: Record<string, string>) {
  return new Request('http://localhost/api/listings', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function mockSuccessfulTransaction() {
  ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
    const tx = {
      listing: { create: jest.fn().mockResolvedValue(mockListing) },
      location: { create: jest.fn().mockResolvedValue({ id: 'loc-123' }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    }
    return callback(tx)
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/listings — extended edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(checkSuspension as jest.Mock).mockResolvedValue({ suspended: false })
    ;(checkEmailVerified as jest.Mock).mockResolvedValue({ verified: true })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-123' })
    ;(prisma.listing.count as jest.Mock).mockResolvedValue(0)
    ;(geocodeAddress as jest.Mock).mockResolvedValue({ lat: 37.7749, lng: -122.4194 })
  })

  // =========================================================================
  // 1. Idempotency
  // =========================================================================

  describe('idempotency', () => {
    it('calls withIdempotency when X-Idempotency-Key header is present', async () => {
      ;(withIdempotency as jest.Mock).mockResolvedValue({
        success: true,
        result: mockListing,
        cached: false,
      })

      const request = makeRequest(validBody, { 'X-Idempotency-Key': 'key-abc' })
      await POST(request)

      expect(withIdempotency).toHaveBeenCalledWith(
        'key-abc',
        'user-123',
        'createListing',
        expect.any(Object),
        expect.any(Function),
      )
      // prisma.$transaction should NOT be called directly
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('fires side effects when idempotency result is NOT cached', async () => {
      ;(withIdempotency as jest.Mock).mockResolvedValue({
        success: true,
        result: mockListing,
        cached: false,
      })

      const request = makeRequest(validBody, { 'X-Idempotency-Key': 'key-abc' })
      const response = await POST(request)

      expect(response.status).toBe(201)
      expect(upsertSearchDocSync).toHaveBeenCalledWith('listing-new')
      expect(triggerInstantAlerts).toHaveBeenCalled()
      expect(markListingDirty).toHaveBeenCalledWith('listing-new', 'listing_created')
    })

    it('does NOT fire side effects when idempotency result IS cached', async () => {
      ;(withIdempotency as jest.Mock).mockResolvedValue({
        success: true,
        result: mockListing,
        cached: true,
      })

      const request = makeRequest(validBody, { 'X-Idempotency-Key': 'key-abc' })
      const response = await POST(request)

      expect(response.status).toBe(201)
      expect(upsertSearchDocSync).not.toHaveBeenCalled()
      expect(triggerInstantAlerts).not.toHaveBeenCalled()
      expect(markListingDirty).not.toHaveBeenCalled()
    })

    it('returns 409 when idempotency reports a conflict', async () => {
      ;(withIdempotency as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Request body mismatch for idempotency key',
        status: 409,
      })

      const request = makeRequest(validBody, { 'X-Idempotency-Key': 'key-conflict' })
      const response = await POST(request)

      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.error).toContain('mismatch')
    })

    it('sets X-Idempotency-Replayed header when result is cached', async () => {
      ;(withIdempotency as jest.Mock).mockResolvedValue({
        success: true,
        result: mockListing,
        cached: true,
      })

      const request = makeRequest(validBody, { 'X-Idempotency-Key': 'key-replay' })
      const response = await POST(request)

      expect(response.headers.get('X-Idempotency-Replayed')).toBe('true')
    })
  })

  // =========================================================================
  // 2. Enum validation
  // =========================================================================

  describe('enum validation', () => {
    it('rejects invalid roomType "PRIVATE"', async () => {
      const response = await POST(makeRequest({ ...validBody, roomType: 'PRIVATE' }))
      expect(response.status).toBe(400)
    })

    it('rejects invalid roomType "invalid"', async () => {
      const response = await POST(makeRequest({ ...validBody, roomType: 'invalid' }))
      expect(response.status).toBe(400)
    })

    it('rejects roomType "any" (filter-only value)', async () => {
      const response = await POST(makeRequest({ ...validBody, roomType: 'any' }))
      expect(response.status).toBe(400)
    })

    it('rejects invalid leaseDuration "1 year"', async () => {
      const response = await POST(makeRequest({ ...validBody, leaseDuration: '1 year' }))
      expect(response.status).toBe(400)
    })

    it('rejects invalid leaseDuration "forever"', async () => {
      const response = await POST(makeRequest({ ...validBody, leaseDuration: 'forever' }))
      expect(response.status).toBe(400)
    })

    it('rejects leaseDuration "any" (filter-only value)', async () => {
      const response = await POST(makeRequest({ ...validBody, leaseDuration: 'any' }))
      expect(response.status).toBe(400)
    })

    it('accepts valid roomType "Shared Room"', async () => {
      mockSuccessfulTransaction()
      const response = await POST(makeRequest({ ...validBody, roomType: 'Shared Room' }))
      expect(response.status).toBe(201)
    })

    it('accepts valid leaseDuration "6 months"', async () => {
      mockSuccessfulTransaction()
      const response = await POST(makeRequest({ ...validBody, leaseDuration: '6 months' }))
      expect(response.status).toBe(201)
    })

    it('accepts null roomType (optional field)', async () => {
      mockSuccessfulTransaction()
      const response = await POST(makeRequest({ ...validBody, roomType: null }))
      expect(response.status).toBe(201)
    })

    it('accepts null leaseDuration (optional field)', async () => {
      mockSuccessfulTransaction()
      const response = await POST(makeRequest({ ...validBody, leaseDuration: null }))
      expect(response.status).toBe(201)
    })

    it('accepts omitted roomType (defaults to undefined)', async () => {
      mockSuccessfulTransaction()
      const { roomType: _removed, ...bodyWithoutRoomType } = validBody
      const response = await POST(makeRequest(bodyWithoutRoomType))
      expect(response.status).toBe(201)
    })
  })

  // =========================================================================
  // 3. Image validation
  // =========================================================================

  describe('image validation', () => {
    it('rejects empty images array', async () => {
      const response = await POST(makeRequest({ ...validBody, images: [] }))
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.fields?.images).toBeDefined()
    })

    it('rejects more than 10 images', async () => {
      const images = Array.from(
        { length: 11 },
        (_, i) =>
          `https://abc123.supabase.co/storage/v1/object/public/images/listings/user-123/img${i}.jpg`,
      )
      const response = await POST(makeRequest({ ...validBody, images }))
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.fields?.images).toBeDefined()
    })

    it('rejects non-Supabase image URL', async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          images: ['https://evil.com/malware.jpg'],
        }),
      )
      expect(response.status).toBe(400)
    })

    it('accepts valid Supabase image URL', async () => {
      mockSuccessfulTransaction()
      const response = await POST(
        makeRequest({
          ...validBody,
          images: [
            'https://abc123.supabase.co/storage/v1/object/public/images/listings/user-123/photo.png',
          ],
        }),
      )
      expect(response.status).toBe(201)
    })

    it('accepts exactly 10 images', async () => {
      mockSuccessfulTransaction()
      const images = Array.from(
        { length: 10 },
        (_, i) =>
          `https://abc123.supabase.co/storage/v1/object/public/images/listings/user-123/img${i}.jpg`,
      )
      const response = await POST(makeRequest({ ...validBody, images }))
      expect(response.status).toBe(201)
    })
  })

  // =========================================================================
  // 4. Language compliance
  // =========================================================================

  describe('language compliance', () => {
    it('returns 400 when title fails compliance', async () => {
      ;(checkListingLanguageCompliance as jest.Mock)
        .mockReturnValueOnce({ allowed: false, message: 'Title contains disallowed language' })

      const response = await POST(makeRequest(validBody))
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('disallowed language')
    })

    it('returns 400 when description fails compliance', async () => {
      // First call (title) passes, second call (description) fails
      ;(checkListingLanguageCompliance as jest.Mock)
        .mockReturnValueOnce({ allowed: true })
        .mockReturnValueOnce({ allowed: false, message: 'Description contains disallowed content' })

      const response = await POST(makeRequest(validBody))
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('disallowed content')
    })

    it('continues when both title and description pass compliance', async () => {
      ;(checkListingLanguageCompliance as jest.Mock).mockReturnValue({ allowed: true })
      mockSuccessfulTransaction()

      const response = await POST(makeRequest(validBody))
      expect(response.status).toBe(201)
      expect(checkListingLanguageCompliance).toHaveBeenCalledTimes(2)
    })
  })

  // =========================================================================
  // 5. Price and slot boundaries
  // =========================================================================

  describe('price and slot boundaries', () => {
    it('rejects price of exactly 50001', async () => {
      const response = await POST(makeRequest({ ...validBody, price: '50001' }))
      expect(response.status).toBe(400)
    })

    it('accepts price of exactly 50000', async () => {
      mockSuccessfulTransaction()
      const response = await POST(makeRequest({ ...validBody, price: '50000' }))
      expect(response.status).toBe(201)
    })

    it('rejects Infinity price', async () => {
      const response = await POST(makeRequest({ ...validBody, price: 'Infinity' }))
      expect(response.status).toBe(400)
    })

    it('rejects NaN price', async () => {
      const response = await POST(makeRequest({ ...validBody, price: 'NaN' }))
      expect(response.status).toBe(400)
    })

    it('rejects totalSlots of 21', async () => {
      const response = await POST(makeRequest({ ...validBody, totalSlots: '21' }))
      expect(response.status).toBe(400)
    })

    it('accepts totalSlots of 20 (max boundary)', async () => {
      mockSuccessfulTransaction()
      const response = await POST(makeRequest({ ...validBody, totalSlots: '20' }))
      expect(response.status).toBe(201)
    })

    it('rejects price of 0', async () => {
      const response = await POST(makeRequest({ ...validBody, price: '0' }))
      expect(response.status).toBe(400)
    })

    it('rejects negative price', async () => {
      const response = await POST(makeRequest({ ...validBody, price: '-50' }))
      expect(response.status).toBe(400)
    })
  })

  // =========================================================================
  // 6. Zip code validation
  // =========================================================================

  describe('zip code validation', () => {
    it('accepts valid 5-digit zip "94102"', async () => {
      mockSuccessfulTransaction()
      const response = await POST(makeRequest({ ...validBody, zip: '94102' }))
      expect(response.status).toBe(201)
    })

    it('accepts valid zip+4 "94102-1234"', async () => {
      mockSuccessfulTransaction()
      const response = await POST(makeRequest({ ...validBody, zip: '94102-1234' }))
      expect(response.status).toBe(201)
    })

    it('rejects 4-digit zip "9410"', async () => {
      const response = await POST(makeRequest({ ...validBody, zip: '9410' }))
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.fields?.zip).toBeDefined()
    })

    it('rejects alpha zip "ABCDE"', async () => {
      const response = await POST(makeRequest({ ...validBody, zip: 'ABCDE' }))
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.fields?.zip).toBeDefined()
    })

    it('rejects 6-digit zip "941021"', async () => {
      const response = await POST(makeRequest({ ...validBody, zip: '941021' }))
      expect(response.status).toBe(400)
    })

    it('rejects zip+4 with wrong separator "94102_1234"', async () => {
      const response = await POST(makeRequest({ ...validBody, zip: '94102_1234' }))
      expect(response.status).toBe(400)
    })
  })

  // =========================================================================
  // 7. Side effects verification
  // =========================================================================

  describe('side effects', () => {
    beforeEach(() => {
      mockSuccessfulTransaction()
    })

    it('calls upsertSearchDocSync with listing ID on success', async () => {
      const response = await POST(makeRequest(validBody))
      expect(response.status).toBe(201)
      expect(upsertSearchDocSync).toHaveBeenCalledWith('listing-new')
    })

    it('calls triggerInstantAlerts with listing data on success', async () => {
      const response = await POST(makeRequest(validBody))
      expect(response.status).toBe(201)
      expect(triggerInstantAlerts).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'listing-new',
          title: 'Cozy Room in Downtown',
          price: 800,
          city: 'San Francisco',
          state: 'CA',
        }),
      )
    })

    it('calls markListingDirty with listing ID on success', async () => {
      const response = await POST(makeRequest(validBody))
      expect(response.status).toBe(201)
      expect(markListingDirty).toHaveBeenCalledWith('listing-new', 'listing_created')
    })

    it('still returns 201 when triggerInstantAlerts fails (fire-and-forget)', async () => {
      ;(triggerInstantAlerts as jest.Mock).mockRejectedValue(new Error('Alerts service down'))

      const response = await POST(makeRequest(validBody))
      // The route catches alert failures via .catch(), so the response should still be 201
      expect(response.status).toBe(201)
    })

    it('still returns 201 when markListingDirty fails (fire-and-forget)', async () => {
      ;(markListingDirty as jest.Mock).mockRejectedValue(new Error('Redis down'))

      const response = await POST(makeRequest(validBody))
      // markListingDirty failure is caught via .catch(), so the response should still be 201
      expect(response.status).toBe(201)
    })

    it('does not call side effects when validation fails', async () => {
      const response = await POST(makeRequest({ ...validBody, price: '-1' }))
      expect(response.status).toBe(400)
      expect(upsertSearchDocSync).not.toHaveBeenCalled()
      expect(triggerInstantAlerts).not.toHaveBeenCalled()
      expect(markListingDirty).not.toHaveBeenCalled()
    })
  })
})
