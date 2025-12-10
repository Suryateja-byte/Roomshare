/**
 * Tests for rate limit wrapper
 */

// Jest hoists mocks to the top, so we need to use requireActual pattern
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  getClientIP: jest.fn(() => '127.0.0.1'),
  RATE_LIMITS: {
    register: { limit: 5, windowMs: 3600000 },
    forgotPassword: { limit: 3, windowMs: 3600000 },
    login: { limit: 10, windowMs: 900000 },
  },
}))

import { withRateLimit, addRateLimitHeaders } from '@/lib/with-rate-limit'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

const mockCheckRateLimit = checkRateLimit as jest.Mock
const mockGetClientIP = getClientIP as jest.Mock

describe('Rate Limit Wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('withRateLimit', () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/test',
    } as Request

    it('returns null when rate limit not exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: true,
        remaining: 4,
        resetAt: new Date(),
      })

      const result = await withRateLimit(mockRequest, { type: 'register' })

      expect(result).toBeNull()
    })

    it('returns 429 response when rate limit exceeded', async () => {
      const resetAt = new Date()
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        retryAfter: 60,
        resetAt,
      })

      const result = await withRateLimit(mockRequest, { type: 'register' })

      expect(result).toBeInstanceOf(NextResponse)
      expect(result?.status).toBe(429)
    })

    it('includes rate limit headers in 429 response', async () => {
      const resetAt = new Date()
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        retryAfter: 120,
        resetAt,
      })

      const result = await withRateLimit(mockRequest, { type: 'register' })

      expect(result?.headers.get('Retry-After')).toBe('120')
      expect(result?.headers.get('X-RateLimit-Limit')).toBe('5')
      expect(result?.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(result?.headers.get('X-RateLimit-Reset')).toBe(resetAt.toISOString())
    })

    it('uses IP address as default identifier', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: true,
        remaining: 4,
        resetAt: new Date(),
      })

      await withRateLimit(mockRequest, { type: 'register' })

      expect(mockGetClientIP).toHaveBeenCalledWith(mockRequest)
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        '127.0.0.1',
        '/api/test',
        expect.any(Object)
      )
    })

    it('uses custom identifier when provided', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: true,
        remaining: 4,
        resetAt: new Date(),
      })

      await withRateLimit(mockRequest, {
        type: 'register',
        getIdentifier: () => 'custom-id-123',
      })

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'custom-id-123',
        '/api/test',
        expect.any(Object)
      )
    })

    it('uses custom endpoint when provided', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: true,
        remaining: 4,
        resetAt: new Date(),
      })

      await withRateLimit(mockRequest, {
        type: 'register',
        endpoint: '/custom/endpoint',
      })

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        '127.0.0.1',
        '/custom/endpoint',
        expect.any(Object)
      )
    })

    it('supports async custom identifier', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: true,
        remaining: 4,
        resetAt: new Date(),
      })

      await withRateLimit(mockRequest, {
        type: 'register',
        getIdentifier: async () => 'async-id-456',
      })

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'async-id-456',
        '/api/test',
        expect.any(Object)
      )
    })

    it('returns correct response and headers when rate limited', async () => {
      const resetAt = new Date()
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        retryAfter: 60,
        resetAt,
      })

      const result = await withRateLimit(mockRequest, { type: 'register' })

      expect(result).not.toBeNull()
      expect(result).toBeInstanceOf(NextResponse)
      expect(result?.status).toBe(429)
      expect(result?.headers.get('Retry-After')).toBe('60')
    })

    it('uses default retryAfter of 60 when not provided', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        retryAfter: undefined,
        resetAt: new Date(),
      })

      const result = await withRateLimit(mockRequest, { type: 'register' })

      expect(result?.headers.get('Retry-After')).toBe('60')
    })
  })

  describe('addRateLimitHeaders', () => {
    it('adds rate limit headers to response', () => {
      const response = NextResponse.json({ data: 'test' })
      const resetAt = new Date()

      const result = addRateLimitHeaders(response, 4, 5, resetAt)

      expect(result.headers.get('X-RateLimit-Limit')).toBe('5')
      expect(result.headers.get('X-RateLimit-Remaining')).toBe('4')
      expect(result.headers.get('X-RateLimit-Reset')).toBe(resetAt.toISOString())
    })

    it('returns the same response object', () => {
      const response = NextResponse.json({ data: 'test' })
      const resetAt = new Date()

      const result = addRateLimitHeaders(response, 4, 5, resetAt)

      expect(result).toBe(response)
    })

    it('handles zero remaining', () => {
      const response = NextResponse.json({ data: 'test' })
      const resetAt = new Date()

      const result = addRateLimitHeaders(response, 0, 5, resetAt)

      expect(result.headers.get('X-RateLimit-Remaining')).toBe('0')
    })
  })
})
