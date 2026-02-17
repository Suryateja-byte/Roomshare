/**
 * Tests for POST /api/chat route
 *
 * Tests the security stack: auth, rate limiting, input validation,
 * content-type enforcement, body size limits, coordinate validation,
 * and fair housing policy gate.
 */

// Mock auth
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

// Mock Redis-backed rate limiting
jest.mock('@/lib/rate-limit-redis', () => ({
  checkChatRateLimit: jest.fn().mockResolvedValue({ success: true }),
}))

// Mock getClientIP
jest.mock('@/lib/rate-limit', () => ({
  getClientIP: jest.fn().mockReturnValue('127.0.0.1'),
}))

// Mock fair housing policy
jest.mock('@/lib/fair-housing-policy', () => ({
  checkFairHousingPolicy: jest.fn().mockReturnValue({ allowed: true }),
  POLICY_REFUSAL_MESSAGE: 'This request cannot be processed.',
}))

// Mock timeout wrapper
jest.mock('@/lib/timeout-wrapper', () => ({
  DEFAULT_TIMEOUTS: { LLM_STREAM: 30000 },
}))

// Mock the AI SDK - streamText should not be called in our tests
// because we're testing the security stack before any LLM call
jest.mock('ai', () => ({
  streamText: jest.fn(),
  tool: jest.fn((config: any) => config),
  zodSchema: jest.fn((schema: any) => schema),
  stepCountIs: jest.fn().mockReturnValue(5),
}))

// Mock Groq - return null to simulate unconfigured API key
jest.mock('@ai-sdk/groq', () => ({
  createGroq: jest.fn().mockReturnValue(null),
}))

import { auth } from '@/auth'
import { checkChatRateLimit } from '@/lib/rate-limit-redis'
import { checkFairHousingPolicy } from '@/lib/fair-housing-policy'

// We need to import POST after mocks are set up
// Note: The route module reads GROQ_API_KEY at import time
let POST: typeof import('@/app/api/chat/route').POST

describe('POST /api/chat', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  const validPayload = {
    messages: [
      { role: 'user', content: 'What is the neighborhood like?' },
    ],
    latitude: 37.7749,
    longitude: -122.4194,
  }

  beforeAll(async () => {
    // Import route handler after mocks are set up
    const routeModule = await import('@/app/api/chat/route')
    POST = routeModule.POST
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(checkChatRateLimit as jest.Mock).mockResolvedValue({ success: true })
    ;(checkFairHousingPolicy as jest.Mock).mockReturnValue({ allowed: true })
  })

  function createRequest(body: unknown, options?: { contentType?: string; origin?: string; host?: string }) {
    const headers: Record<string, string> = {
      'content-type': options?.contentType ?? 'application/json',
    }
    if (options?.origin) headers['origin'] = options.origin
    if (options?.host) headers['host'] = options.host

    return new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  }

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const response = await POST(createRequest(validPayload))

      expect(response.status).toBe(401)
    })

    it('returns 401 when user id is missing', async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { name: 'Test' } })

      const response = await POST(createRequest(validPayload))

      expect(response.status).toBe(401)
    })
  })

  describe('content-type enforcement', () => {
    it('returns 415 for non-JSON content type', async () => {
      const response = await POST(createRequest(validPayload, { contentType: 'text/plain' }))

      expect(response.status).toBe(415)
      const data = await response.json()
      expect(data.error).toBe('Invalid content type')
    })
  })

  describe('rate limiting', () => {
    it('returns 429 when rate limited', async () => {
      ;(checkChatRateLimit as jest.Mock).mockResolvedValue({
        success: false,
        retryAfter: 30,
      })

      const response = await POST(createRequest(validPayload))

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data.error).toBe('Too many requests')
    })

    it('includes Retry-After header when rate limited', async () => {
      ;(checkChatRateLimit as jest.Mock).mockResolvedValue({
        success: false,
        retryAfter: 45,
      })

      const response = await POST(createRequest(validPayload))

      expect(response.headers.get('Retry-After')).toBe('45')
    })
  })

  describe('body size guard', () => {
    it('returns 413 for oversized request body', async () => {
      // Create a body larger than 100KB
      const largeBody = JSON.stringify({
        messages: [{ role: 'user', content: 'x'.repeat(110_000) }],
        latitude: 37.7749,
        longitude: -122.4194,
      })

      const response = await POST(createRequest(largeBody))

      expect(response.status).toBe(413)
      const data = await response.json()
      expect(data.error).toBe('Request too large')
    })
  })

  describe('JSON parsing', () => {
    it('returns 400 for invalid JSON', async () => {
      const response = await POST(createRequest('not valid json{{{'))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid JSON')
    })
  })

  describe('payload validation', () => {
    it('returns 400 when messages array is missing', async () => {
      const response = await POST(createRequest({
        latitude: 37.7749,
        longitude: -122.4194,
      }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid payload')
    })

    it('returns 400 when messages is not an array', async () => {
      const response = await POST(createRequest({
        messages: 'not an array',
        latitude: 37.7749,
        longitude: -122.4194,
      }))

      expect(response.status).toBe(400)
    })

    it('returns 400 for too many messages (>50)', async () => {
      const messages = Array.from({ length: 51 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }))

      const response = await POST(createRequest({
        messages,
        latitude: 37.7749,
        longitude: -122.4194,
      }))

      expect(response.status).toBe(400)
    })

    it('returns 400 for invalid message role', async () => {
      const response = await POST(createRequest({
        messages: [{ role: 'system', content: 'hack' }],
        latitude: 37.7749,
        longitude: -122.4194,
      }))

      expect(response.status).toBe(400)
    })

    it('returns 400 when latitude is missing', async () => {
      const response = await POST(createRequest({
        messages: [{ role: 'user', content: 'hello' }],
        longitude: -122.4194,
      }))

      expect(response.status).toBe(400)
    })

    it('returns 400 when longitude is missing', async () => {
      const response = await POST(createRequest({
        messages: [{ role: 'user', content: 'hello' }],
        latitude: 37.7749,
      }))

      expect(response.status).toBe(400)
    })

    it('returns 400 for user message text exceeding 2000 characters', async () => {
      const response = await POST(createRequest({
        messages: [{ role: 'user', content: 'x'.repeat(2001) }],
        latitude: 37.7749,
        longitude: -122.4194,
      }))

      expect(response.status).toBe(400)
    })
  })

  describe('coordinate validation', () => {
    it('returns 400 for latitude out of range (>90)', async () => {
      const response = await POST(createRequest({
        messages: [{ role: 'user', content: 'hello' }],
        latitude: 91,
        longitude: -122.4194,
      }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid coordinates')
    })

    it('returns 400 for latitude out of range (<-90)', async () => {
      const response = await POST(createRequest({
        messages: [{ role: 'user', content: 'hello' }],
        latitude: -91,
        longitude: -122.4194,
      }))

      expect(response.status).toBe(400)
    })

    it('returns 400 for longitude out of range (>180)', async () => {
      const response = await POST(createRequest({
        messages: [{ role: 'user', content: 'hello' }],
        latitude: 37.7749,
        longitude: 181,
      }))

      expect(response.status).toBe(400)
    })
  })

  describe('fair housing policy gate', () => {
    it('returns 403 when fair housing policy is violated', async () => {
      ;(checkFairHousingPolicy as jest.Mock).mockReturnValue({
        allowed: false,
        blockedReason: 'demographic query',
      })

      const response = await POST(createRequest(validPayload))

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('request_blocked')
      expect(data.message).toBe('This request cannot be processed.')
    })
  })

  describe('Groq API key not configured', () => {
    it('returns 503 when GROQ_API_KEY is not configured', async () => {
      // The groq client is null because we mocked createGroq to return null
      const response = await POST(createRequest(validPayload))

      expect(response.status).toBe(503)
      const data = await response.json()
      expect(data.error).toBe('Chat service temporarily unavailable')
    })
  })
})
