/**
 * Tests for reports API route
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    report: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    listing: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

// P2-5: Mock rate limiting to return null (allow request)
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
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

import { POST } from '@/app/api/reports/route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

describe('Reports API', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    // Default: listing exists and is owned by someone else
    ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({ ownerId: 'other-owner' })
  })

  describe('POST', () => {
    it('returns 401 when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const request = new Request('http://localhost/api/reports', {
        method: 'POST',
        body: JSON.stringify({ listingId: 'listing-123', reason: 'Spam' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(401)
    })

    it('returns 400 for missing listingId', async () => {
      const request = new Request('http://localhost/api/reports', {
        method: 'POST',
        body: JSON.stringify({ reason: 'Spam' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('returns 400 for missing reason', async () => {
      const request = new Request('http://localhost/api/reports', {
        method: 'POST',
        body: JSON.stringify({ listingId: 'listing-123' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('returns 404 when listing does not exist', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(null)

      const request = new Request('http://localhost/api/reports', {
        method: 'POST',
        body: JSON.stringify({ listingId: 'nonexistent', reason: 'Spam' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Listing not found')
    })

    it('returns 400 when reporting own listing (BIZ-05)', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({ ownerId: 'user-123' })

      const request = new Request('http://localhost/api/reports', {
        method: 'POST',
        body: JSON.stringify({ listingId: 'my-listing', reason: 'Spam' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('You cannot report your own listing')
    })

    it('creates report successfully', async () => {
      const mockReport = {
        id: 'report-123',
        listingId: 'listing-123',
        reporterId: 'user-123',
        reason: 'Spam',
        details: 'This is spam content',
      }
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({ ownerId: 'other-user' })
      ;(prisma.report.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.report.create as jest.Mock).mockResolvedValue(mockReport)

      const request = new Request('http://localhost/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          listingId: 'listing-123',
          reason: 'Spam',
          details: 'This is spam content',
        }),
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          listingId: 'listing-123',
          reporterId: 'user-123',
          reason: 'Spam',
          details: 'This is spam content',
        },
      })
    })

    it('handles database errors', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({ ownerId: 'other-user' })
      ;(prisma.report.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.report.create as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const request = new Request('http://localhost/api/reports', {
        method: 'POST',
        body: JSON.stringify({ listingId: 'listing-123', reason: 'Spam' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(500)
    })
  })
})
