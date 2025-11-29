/**
 * Tests for verify API route
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) => {
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(),
      }
    },
  },
}))

import { GET } from '@/app/api/verify/route'
import { prisma } from '@/lib/prisma'

describe('Verify API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET', () => {
    it('returns 404 when listing not found', async () => {
      ;(prisma.listing.findFirst as jest.Mock).mockResolvedValue(null)

      const response = await GET()

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Listing not found')
    })

    it('returns listing with location', async () => {
      const mockListing = {
        id: 'listing-123',
        title: 'Test Room',
        location: {
          address: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
        },
      }
      ;(prisma.listing.findFirst as jest.Mock).mockResolvedValue(mockListing)

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.listing).toEqual(mockListing)
      expect(prisma.listing.findFirst).toHaveBeenCalledWith({
        where: { title: 'Test Room' },
        include: { location: true },
      })
    })

    it('handles database errors', async () => {
      ;(prisma.listing.findFirst as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const response = await GET()

      expect(response.status).toBe(500)
    })
  })
})
