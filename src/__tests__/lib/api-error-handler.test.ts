/**
 * Tests for API error handler utility
 *
 * Verifies captureApiError returns proper error responses,
 * passes context correctly to Sentry and logger, and handles
 * different error types (Error, string, unknown).
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const headers = new Map(Object.entries(init?.headers || {}))
      return {
        status: init?.status || 200,
        json: async () => data,
        headers,
      }
    },
  },
}))

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      error: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-context', () => ({
  getRequestId: jest.fn().mockReturnValue('test-req-id-123'),
}))

import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'
import { getRequestId } from '@/lib/request-context'
import { captureApiError, apiErrorResponse } from '@/lib/api-error-handler'

describe('api-error-handler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('captureApiError', () => {
    it('returns a 500 JSON response with generic error message', async () => {
      const error = new Error('Something broke')
      const context = { route: '/api/listings', method: 'GET' }

      const response = captureApiError(error, context)

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: 'Internal server error' })
    })

    it('does NOT leak internal error details in the response', async () => {
      const error = new Error('Database connection failed: password=secret123')
      const context = { route: '/api/bookings', method: 'POST' }

      const response = captureApiError(error, context)
      const body = await response.json()

      expect(body.error).toBe('Internal server error')
      expect(JSON.stringify(body)).not.toContain('secret123')
      expect(JSON.stringify(body)).not.toContain('Database connection')
    })

    it('logs the error with route and method context', () => {
      const error = new Error('test error')
      const context = { route: '/api/messages', method: 'PATCH', userId: 'user-42' }

      captureApiError(error, context)

      expect(logger.sync.error).toHaveBeenCalledWith(
        'API error in /api/messages',
        expect.objectContaining({
          error: 'test error',
          method: 'PATCH',
          userId: 'user-42',
          requestId: 'test-req-id-123',
        })
      )
    })

    it('sends the exception to Sentry with tags', () => {
      const error = new Error('sentry test')
      const context = { route: '/api/reviews', method: 'DELETE' }

      captureApiError(error, context)

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: {
            route: '/api/reviews',
            method: 'DELETE',
          },
          extra: {
            requestId: 'test-req-id-123',
          },
        })
      )
    })

    it('handles Error objects -- extracts .message for logging', () => {
      const error = new Error('typed error')
      const context = { route: '/api/test', method: 'GET' }

      captureApiError(error, context)

      expect(logger.sync.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ error: 'typed error' })
      )
    })

    it('handles string errors (non-Error thrown) as Unknown error', () => {
      const context = { route: '/api/test', method: 'GET' }

      captureApiError('string error message', context)

      expect(logger.sync.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ error: 'Unknown error' })
      )
    })

    it('handles null/undefined errors as Unknown error', () => {
      const context = { route: '/api/test', method: 'GET' }

      captureApiError(null, context)

      expect(logger.sync.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ error: 'Unknown error' })
      )

      captureApiError(undefined, context)

      expect(logger.sync.error).toHaveBeenCalledTimes(2)
    })

    it('handles numeric errors as Unknown error', () => {
      const context = { route: '/api/test', method: 'GET' }

      captureApiError(42, context)

      expect(logger.sync.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ error: 'Unknown error' })
      )
    })

    it('still sends non-Error values to Sentry', () => {
      const context = { route: '/api/test', method: 'GET' }

      captureApiError('raw string', context)

      expect(Sentry.captureException).toHaveBeenCalledWith(
        'raw string',
        expect.any(Object)
      )
    })

    it('includes userId in log when provided in context', () => {
      const error = new Error('auth error')
      const context = { route: '/api/user', method: 'GET', userId: 'user-abc' }

      captureApiError(error, context)

      expect(logger.sync.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ userId: 'user-abc' })
      )
    })

    it('handles context without userId', () => {
      const error = new Error('anon error')
      const context = { route: '/api/public', method: 'GET' }

      captureApiError(error, context)

      expect(logger.sync.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ userId: undefined })
      )
    })

    it('includes requestId from request-context module', () => {
      const error = new Error('context test')
      const context = { route: '/api/test', method: 'GET' }

      captureApiError(error, context)

      expect(getRequestId).toHaveBeenCalled()
      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: { requestId: 'test-req-id-123' },
        })
      )
    })
  })

  describe('apiErrorResponse', () => {
    it('returns a 500 response by default', async () => {
      const response = apiErrorResponse()

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: 'Internal server error' })
    })

    it('returns a response with the specified status code', async () => {
      const response = apiErrorResponse(503)

      expect(response.status).toBe(503)
      const body = await response.json()
      expect(body).toEqual({ error: 'Internal server error' })
    })

    it('returns generic error message regardless of status code', async () => {
      const response = apiErrorResponse(400)

      const body = await response.json()
      expect(body).toEqual({ error: 'Internal server error' })
    })
  })
})
