/**
 * Tests for /api/nearby route - Security Edge Cases
 * Tests injection patterns, XSS, and other security concerns
 */

// Mock NextResponse before importing the route
const mockJsonFn = jest.fn()
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number; headers?: Record<string, string> }) => {
      mockJsonFn(data, init)
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(Object.entries(init?.headers || {})),
      }
    },
  },
}))

// Mock auth
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

// Mock rate limiting to return null (allow request)
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}))

// Mock fetch for Radar API calls
const mockFetch = jest.fn()
global.fetch = mockFetch

import { POST } from '@/app/api/nearby/route'
import { auth } from '@/auth'

describe('POST /api/nearby - Security Edge Cases', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  const baseRequest = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    radiusMeters: 1609,
  }

  function createRequest(body: any): Request {
    return new Request('http://localhost/api/nearby', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  function mockRadarSuccess() {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { code: 200 }, addresses: [] }),
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    process.env.RADAR_SECRET_KEY = 'test-radar-key'
  })

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY
  })

  describe('SQL Injection Patterns', () => {
    it('handles SQL injection in query parameter', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: "'; DROP TABLE users; --",
      }))

      // Should not crash, query is just passed to Radar API as-is
      expect([200, 400]).toContain(response.status)
    })

    it('handles SQL injection with UNION', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: "' UNION SELECT * FROM users --",
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles SQL injection in categories', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ["'; DROP TABLE--", "food-beverage"],
      }))

      // Should process normally, categories are just strings
      expect(response.status).toBe(200)
    })
  })

  describe('XSS Patterns', () => {
    it('handles XSS script tags in query', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '<script>alert("XSS")</script>',
      }))

      // Should not crash, just pass to API
      expect([200, 400]).toContain(response.status)
    })

    it('handles XSS with img onerror', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '<img src=x onerror=alert(1)>',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles XSS with event handlers', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '" onmouseover="alert(1)"',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles encoded XSS', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '&#60;script&#62;alert(1)&#60;/script&#62;',
      }))

      expect([200, 400]).toContain(response.status)
    })
  })

  describe('Command Injection Patterns', () => {
    it('handles command injection with backticks', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '`whoami`',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles command injection with $(...)', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '$(cat /etc/passwd)',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles command injection with pipe', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '| cat /etc/passwd',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles command injection with semicolon', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '; rm -rf /',
      }))

      expect([200, 400]).toContain(response.status)
    })
  })

  describe('Path Traversal', () => {
    it('handles path traversal in query', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '../../../etc/passwd',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles Windows path traversal', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '..\\..\\..\\windows\\system32\\config\\sam',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles URL-encoded path traversal', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      }))

      expect([200, 400]).toContain(response.status)
    })
  })

  describe('Null Byte Injection', () => {
    it('handles null byte in query', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'test\x00.php',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles multiple null bytes', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: '\x00\x00\x00test',
      }))

      expect([200, 400]).toContain(response.status)
    })
  })

  describe('Unicode Homograph Attacks', () => {
    it('handles Cyrillic a vs Latin a', async () => {
      mockRadarSuccess()

      // Cyrillic 'а' (U+0430) looks like Latin 'a' (U+0061)
      const response = await POST(createRequest({
        ...baseRequest,
        query: 'аpple', // First 'а' is Cyrillic
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles Greek omicron vs Latin o', async () => {
      mockRadarSuccess()

      // Greek 'ο' (U+03BF) looks like Latin 'o' (U+006F)
      const response = await POST(createRequest({
        ...baseRequest,
        query: 'gοοgle', // 'ο' are Greek
      }))

      expect([200, 400]).toContain(response.status)
    })
  })

  describe('Control Characters', () => {
    it('handles carriage return and newline', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'test\r\ninjected',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles tab characters', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'test\tinjected',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles bell character', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'test\x07bell',
      }))

      expect([200, 400]).toContain(response.status)
    })

    it('handles escape character', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'test\x1bescape',
      }))

      expect([200, 400]).toContain(response.status)
    })
  })

  describe('Long Input Attacks', () => {
    it('handles very long query (max 100 chars)', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'A'.repeat(100),
      }))

      expect(response.status).toBe(200)
    })

    it('rejects query exceeding max length', async () => {
      const response = await POST(createRequest({
        ...baseRequest,
        query: 'A'.repeat(101),
      }))

      expect(response.status).toBe(400)
    })

    it('handles long injection attempt within limit', async () => {
      mockRadarSuccess()

      const injection = "'; SELECT * FROM users WHERE '1'='1"
      const response = await POST(createRequest({
        ...baseRequest,
        query: injection.slice(0, 100), // Truncate to max length
      }))

      expect([200, 400]).toContain(response.status)
    })
  })

  describe('API Key Security', () => {
    it('does not include API key in error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      // Error response should not contain the API key
      expect(JSON.stringify(data)).not.toContain('test-radar-key')
    })
  })

  describe('Response Headers', () => {
    it('sets no-cache headers to prevent caching sensitive data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 }, places: [] }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))

      // Verify Cache-Control is set
      const cacheControl = response.headers.get('Cache-Control')
      expect(cacheControl).toBe('no-store, no-cache, must-revalidate')
    })
  })
})
