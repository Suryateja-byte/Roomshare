/**
 * Tests for GET /api/listings/[id]/status route
 *
 * This is a public endpoint that returns listing status without auth.
 * Used by ListingFreshnessCheck to verify listing availability.
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}))

import { GET } from '@/app/api/listings/[id]/status/route'
import { prisma } from '@/lib/prisma'
import { withRateLimit } from '@/lib/with-rate-limit'

describe('GET /api/listings/[id]/status', () => {
  const mockParams = Promise.resolve({ id: 'listing-123' })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(withRateLimit as jest.Mock).mockResolvedValue(null)
  })

  describe('rate limiting', () => {
    it('applies rate limiting to prevent polling abuse', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        id: 'listing-123',
        status: 'ACTIVE',
        updatedAt: new Date('2026-01-15T00:00:00Z'),
      })

      const request = new Request('http://localhost/api/listings/listing-123/status')
      await GET(request, { params: mockParams })

      expect(withRateLimit).toHaveBeenCalledWith(request, { type: 'listingStatus' })
    })

    it('returns 429 when rate limited', async () => {
      const rateLimitResponse = {
        status: 429,
        json: async () => ({ error: 'Too many requests' }),
        headers: new Map(),
      }
      ;(withRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse)

      const request = new Request('http://localhost/api/listings/listing-123/status')
      const response = await GET(request, { params: mockParams })

      expect(response.status).toBe(429)
    })
  })

  describe('successful status retrieval', () => {
    it('returns listing status for ACTIVE listing', async () => {
      const updatedAt = new Date('2026-01-15T12:00:00Z')
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        id: 'listing-123',
        status: 'ACTIVE',
        updatedAt,
      })

      const request = new Request('http://localhost/api/listings/listing-123/status')
      const response = await GET(request, { params: mockParams })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.id).toBe('listing-123')
      expect(data.status).toBe('ACTIVE')
      expect(data.updatedAt).toBe(updatedAt)
    })

    it('returns listing status for PAUSED listing', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        id: 'listing-123',
        status: 'PAUSED',
        updatedAt: new Date(),
      })

      const request = new Request('http://localhost/api/listings/listing-123/status')
      const response = await GET(request, { params: mockParams })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.status).toBe('PAUSED')
    })

    it('returns listing status for RENTED listing', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        id: 'listing-123',
        status: 'RENTED',
        updatedAt: new Date(),
      })

      const request = new Request('http://localhost/api/listings/listing-123/status')
      const response = await GET(request, { params: mockParams })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.status).toBe('RENTED')
    })

    it('queries only the necessary fields (id, status, updatedAt)', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        id: 'listing-123',
        status: 'ACTIVE',
        updatedAt: new Date(),
      })

      const request = new Request('http://localhost/api/listings/listing-123/status')
      await GET(request, { params: mockParams })

      expect(prisma.listing.findUnique).toHaveBeenCalledWith({
        where: { id: 'listing-123' },
        select: {
          id: true,
          status: true,
          updatedAt: true,
        },
      })
    })
  })

  describe('listing not found', () => {
    it('returns 404 when listing does not exist', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(null)

      const request = new Request('http://localhost/api/listings/nonexistent/status')
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Listing not found')
    })
  })

  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockRejectedValue(new Error('DB connection failed'))

      const request = new Request('http://localhost/api/listings/listing-123/status')
      const response = await GET(request, { params: mockParams })

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Internal server error')
    })
  })

  describe('no auth required (public endpoint)', () => {
    it('returns status without any authentication', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        id: 'listing-123',
        status: 'ACTIVE',
        updatedAt: new Date(),
      })

      // No session/auth mocks - this is a public endpoint
      const request = new Request('http://localhost/api/listings/listing-123/status')
      const response = await GET(request, { params: mockParams })

      expect(response.status).toBe(200)
    })
  })
})
