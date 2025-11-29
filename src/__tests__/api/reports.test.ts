/**
 * Tests for reports API route
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    report: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
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

    it('creates report successfully', async () => {
      const mockReport = {
        id: 'report-123',
        listingId: 'listing-123',
        reporterId: 'user-123',
        reason: 'Spam',
        details: 'This is spam content',
      }
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
