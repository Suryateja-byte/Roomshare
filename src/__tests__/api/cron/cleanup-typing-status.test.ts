/**
 * Tests for GET /api/cron/cleanup-typing-status route
 *
 * Tests cron secret authentication, defense-in-depth secret validation,
 * stale typing status cleanup, and error handling.
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    typingStatus: {
      deleteMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  },
}))

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}))

jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest extends Request {
    declare headers: Headers
    constructor(url: string, init?: RequestInit) {
      super(url, init)
    }
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}))

import { GET } from '@/app/api/cron/cleanup-typing-status/route'
import { prisma } from '@/lib/prisma'
import * as Sentry from '@sentry/nextjs'
import { NextRequest } from 'next/server'

describe('GET /api/cron/cleanup-typing-status', () => {
  const VALID_CRON_SECRET = 'a-very-long-and-secure-cron-secret-that-is-at-least-32-characters'
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, CRON_SECRET: VALID_CRON_SECRET }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  function createRequest(authHeader?: string): NextRequest {
    const headers: Record<string, string> = {}
    if (authHeader) {
      headers['authorization'] = authHeader
    }
    return new NextRequest('http://localhost:3000/api/cron/cleanup-typing-status', {
      method: 'GET',
      headers,
    })
  }

  describe('authentication', () => {
    it('returns 401 when authorization header is missing', async () => {
      const response = await GET(createRequest())

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 401 when authorization header has wrong secret', async () => {
      const response = await GET(createRequest('Bearer wrong-secret'))

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 401 when authorization header format is wrong', async () => {
      const response = await GET(createRequest(`Basic ${VALID_CRON_SECRET}`))

      expect(response.status).toBe(401)
    })
  })

  describe('defense in depth - secret validation', () => {
    it('returns 500 when CRON_SECRET is not configured', async () => {
      delete process.env.CRON_SECRET

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Server configuration error')
    })

    it('returns 500 when CRON_SECRET is too short (< 32 chars)', async () => {
      process.env.CRON_SECRET = 'too-short'

      const response = await GET(createRequest('Bearer too-short'))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Server configuration error')
    })

    it('returns 500 when CRON_SECRET contains placeholder value', async () => {
      process.env.CRON_SECRET = 'change-in-production-aaaa-bbbb-cccc-dddd-eeee'

      const response = await GET(createRequest('Bearer change-in-production-aaaa-bbbb-cccc-dddd-eeee'))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Server configuration error')
    })

    it('returns 500 when CRON_SECRET starts with "your-"', async () => {
      process.env.CRON_SECRET = 'your-secret-key-here-aaaa-bbbb-cccc-dddd'

      const response = await GET(createRequest('Bearer your-secret-key-here-aaaa-bbbb-cccc-dddd'))

      expect(response.status).toBe(500)
    })

    it('returns 500 when CRON_SECRET starts with "generate-"', async () => {
      process.env.CRON_SECRET = 'generate-a-new-key-aaaa-bbbb-cccc-dddd'

      const response = await GET(createRequest('Bearer generate-a-new-key-aaaa-bbbb-cccc-dddd'))

      expect(response.status).toBe(500)
    })
  })

  describe('successful cleanup', () => {
    it('deletes stale typing status entries and returns count', async () => {
      ;(prisma.typingStatus.deleteMany as jest.Mock).mockResolvedValue({ count: 12 })

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.deleted).toBe(12)
      expect(data.timestamp).toBeDefined()
    })

    it('handles empty table (zero stale entries)', async () => {
      ;(prisma.typingStatus.deleteMany as jest.Mock).mockResolvedValue({ count: 0 })

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.deleted).toBe(0)
    })

    it('deletes entries where updatedAt < 5 minutes ago', async () => {
      ;(prisma.typingStatus.deleteMany as jest.Mock).mockResolvedValue({ count: 3 })

      const before = Date.now()
      await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`))
      const after = Date.now()

      expect(prisma.typingStatus.deleteMany).toHaveBeenCalledWith({
        where: {
          updatedAt: { lt: expect.any(Date) },
        },
      })

      // Verify the cutoff date is approximately 5 minutes ago
      const callArgs = (prisma.typingStatus.deleteMany as jest.Mock).mock.calls[0][0]
      const cutoffTime = callArgs.where.updatedAt.lt.getTime()
      const expectedMin = before - 5 * 60 * 1000
      const expectedMax = after - 5 * 60 * 1000
      expect(cutoffTime).toBeGreaterThanOrEqual(expectedMin)
      expect(cutoffTime).toBeLessThanOrEqual(expectedMax)
    })
  })

  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      ;(prisma.typingStatus.deleteMany as jest.Mock).mockRejectedValue(
        new Error('Database connection lost')
      )

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Cleanup failed')
    })

    it('reports errors to Sentry', async () => {
      const dbError = new Error('Database timeout')
      ;(prisma.typingStatus.deleteMany as jest.Mock).mockRejectedValue(dbError)

      await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`))

      expect(Sentry.captureException).toHaveBeenCalledWith(
        dbError,
        { tags: { cron: 'cleanup-typing-status' } }
      )
    })
  })
})
