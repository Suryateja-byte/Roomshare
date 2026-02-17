/**
 * Tests for POST /api/agent route
 *
 * Tests auth, rate limiting, input validation, coordinate validation,
 * webhook forwarding, timeout handling, and graceful fallback responses.
 */

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
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

jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest extends Request {
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

import { POST } from '@/app/api/agent/route'
import { auth } from '@/auth'
import { withRateLimit } from '@/lib/with-rate-limit'
import { NextRequest } from 'next/server'

describe('POST /api/agent', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  const validBody = {
    question: 'What restaurants are nearby?',
    lat: 37.7749,
    lng: -122.4194,
  }

  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(withRateLimit as jest.Mock).mockResolvedValue(null)
    process.env = { ...originalEnv, N8N_WEBHOOK_URL: 'https://n8n.example.com/webhook/agent' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  function createRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  describe('rate limiting', () => {
    it('applies rate limiting', async () => {
      const request = createRequest(validBody)
      await POST(request)

      expect(withRateLimit).toHaveBeenCalledWith(request, { type: 'agent' })
    })

    it('returns 429 when rate limited', async () => {
      const rateLimitResponse = {
        status: 429,
        json: async () => ({ error: 'Too many requests' }),
        headers: new Map(),
      }
      ;(withRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse)

      const response = await POST(createRequest(validBody))

      expect(response.status).toBe(429)
    })
  })

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const response = await POST(createRequest(validBody))

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Authentication required')
    })

    it('returns 401 when user id is missing', async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { name: 'Test' } })

      const response = await POST(createRequest(validBody))

      expect(response.status).toBe(401)
    })
  })

  describe('input validation', () => {
    it('returns 400 when question is missing', async () => {
      const response = await POST(createRequest({ lat: 37.7749, lng: -122.4194 }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Question is required')
    })

    it('returns 400 when question is not a string', async () => {
      const response = await POST(createRequest({ question: 123, lat: 37.7749, lng: -122.4194 }))

      expect(response.status).toBe(400)
    })

    it('returns 400 when question is too short (<2 chars)', async () => {
      const response = await POST(createRequest({ question: 'a', lat: 37.7749, lng: -122.4194 }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Question is too short')
    })

    it('returns 400 when question is too long (>500 chars)', async () => {
      const response = await POST(createRequest({
        question: 'x'.repeat(501),
        lat: 37.7749,
        lng: -122.4194,
      }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Question is too long (max 500 characters)')
    })

    it('returns 400 for invalid coordinates', async () => {
      const response = await POST(createRequest({
        question: 'What is nearby?',
        lat: 91,
        lng: -122.4194,
      }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid coordinates')
    })

    it('returns 400 for NaN coordinates', async () => {
      const response = await POST(createRequest({
        question: 'What is nearby?',
        lat: NaN,
        lng: -122.4194,
      }))

      expect(response.status).toBe(400)
    })
  })

  describe('webhook configuration', () => {
    it('returns 503 when N8N_WEBHOOK_URL is not configured', async () => {
      delete process.env.N8N_WEBHOOK_URL

      const response = await POST(createRequest(validBody))

      expect(response.status).toBe(503)
      const data = await response.json()
      expect(data.error).toBe('Service temporarily unavailable')
    })
  })

  describe('webhook forwarding', () => {
    let originalFetch: typeof globalThis.fetch

    beforeEach(() => {
      originalFetch = globalThis.fetch
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it('forwards request to n8n webhook and returns answer', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'There are several restaurants nearby.' }),
      })

      const response = await POST(createRequest(validBody))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.answer).toBe('There are several restaurants nearby.')
    })

    it('trims question whitespace before forwarding', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'Response' }),
      })

      await POST(createRequest({
        question: '  What is nearby?  ',
        lat: 37.7749,
        lng: -122.4194,
      }))

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/agent',
        expect.objectContaining({
          body: JSON.stringify({
            question: 'What is nearby?',
            lat: 37.7749,
            lng: -122.4194,
          }),
        })
      )
    })

    it('returns graceful fallback when webhook returns non-OK response', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      const response = await POST(createRequest(validBody))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.fallback).toBe(true)
      expect(data.answer).toBeDefined()
    })

    it('returns graceful fallback on timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      globalThis.fetch = jest.fn().mockRejectedValue(abortError)

      const response = await POST(createRequest(validBody))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.fallback).toBe(true)
    })

    it('returns graceful fallback on connection failure', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))

      const response = await POST(createRequest(validBody))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.fallback).toBe(true)
    })
  })

  describe('error handling', () => {
    it('returns 500 on unexpected errors (e.g. JSON parse failure)', async () => {
      // Passing a request whose .json() method throws
      const badRequest = {
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
        headers: { get: jest.fn().mockReturnValue(null) },
        url: 'http://localhost:3000/api/agent',
      } as unknown as NextRequest

      const response = await POST(badRequest)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Internal server error')
    })
  })
})
