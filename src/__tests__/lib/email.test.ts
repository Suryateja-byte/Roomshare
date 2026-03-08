/**
 * Tests for email service — sendEmail retry, circuit breaker, and dev mode (D2.2-B)
 */

// Use var for hoisting compatibility with jest.mock factories
/* eslint-disable no-var */
var mockFetchWithTimeout: jest.Mock;
var mockIsAllowingRequests: jest.Mock;
var mockExecute: jest.Mock;
/* eslint-enable no-var */

// These must be assigned before jest.mock factories reference them
mockFetchWithTimeout = jest.fn();
mockIsAllowingRequests = jest.fn().mockReturnValue(true);
mockExecute = jest.fn().mockImplementation((fn: () => any) => fn());

jest.mock('@/lib/fetch-with-timeout', () => {
  class FetchTimeoutError extends Error {
    url: string;
    timeout: number;
    constructor(url: string, timeout: number) {
      super(`Request to ${url} timed out after ${timeout}ms`);
      this.name = 'FetchTimeoutError';
      this.url = url;
      this.timeout = timeout;
    }
  }
  return {
    fetchWithTimeout: (...args: any[]) => mockFetchWithTimeout(...args),
    FetchTimeoutError,
  };
});

jest.mock('@/lib/circuit-breaker', () => ({
  circuitBreakers: {
    email: {
      // Use wrapper functions to defer resolution — var assignment happens after factory runs
      isAllowingRequests: (...args: any[]) => mockIsAllowingRequests(...args),
      execute: (...args: any[]) => mockExecute(...args),
    },
  },
  isCircuitOpenError: jest.fn().mockReturnValue(false),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/email-templates', () => ({
  emailTemplates: {
    welcome: jest.fn(() => ({ subject: 'Welcome', html: '<p>Welcome</p>' })),
    bookingRequest: jest.fn(() => ({ subject: 'Booking', html: '<p>Booking</p>' })),
  },
}));

// Set RESEND_API_KEY before importing sendEmail (module-level const)
process.env.RESEND_API_KEY = 'test-key-123';

import { sendEmail } from '@/lib/email';
import { FetchTimeoutError } from '@/lib/fetch-with-timeout';

describe('sendEmail retry and circuit breaker (D2.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockIsAllowingRequests.mockReturnValue(true);
    mockExecute.mockImplementation((fn: () => any) => fn());
  });

  it('retries on 5xx errors with exponential backoff', async () => {
    jest.useFakeTimers();

    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => 'Bad Gateway',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'msg-1' }),
      });

    const resultPromise = sendEmail({
      to: 'a@b.com',
      subject: 'Test',
      html: '<p>Hi</p>',
    });

    await jest.advanceTimersByTimeAsync(10000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on 4xx client errors', async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    const result = await sendEmail({
      to: 'a@b.com',
      subject: 'Test',
      html: '<p>Hi</p>',
    });

    expect(result.success).toBe(false);
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('returns error when circuit breaker is open', async () => {
    mockIsAllowingRequests.mockReturnValue(false);

    const result = await sendEmail({
      to: 'a@b.com',
      subject: 'Test',
      html: '<p>Hi</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('circuit breaker');
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it('retries on FetchTimeoutError', async () => {
    jest.useFakeTimers();

    mockFetchWithTimeout
      .mockRejectedValueOnce(
        new FetchTimeoutError('https://api.resend.com/emails', 15000)
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'msg-2' }),
      });

    const resultPromise = sendEmail({
      to: 'a@b.com',
      subject: 'Test',
      html: '<p>Hi</p>',
    });

    await jest.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  // IMPORTANT: This test MUST be last — jest.isolateModules corrupts the outer circuit-breaker mock
  it('returns success in dev mode when RESEND_API_KEY is not set', async () => {
    const originalKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    let result: any;
    jest.isolateModules(() => {
      jest.doMock('@/lib/fetch-with-timeout', () => ({
        fetchWithTimeout: mockFetchWithTimeout,
        FetchTimeoutError: class extends Error {
          constructor(url: string, timeout: number) {
            super(`Timeout ${timeout}`);
          }
        },
      }));
      jest.doMock('@/lib/circuit-breaker', () => ({
        circuitBreakers: {
          email: {
            isAllowingRequests: () => true,
            execute: (fn: () => any) => fn(),
          },
        },
        isCircuitOpenError: () => false,
      }));
      jest.doMock('@/lib/prisma', () => ({
        prisma: { user: { findUnique: jest.fn() } },
      }));
      jest.doMock('@/lib/email-templates', () => ({ emailTemplates: {} }));

      const { sendEmail: sendEmailNoKey } = require('@/lib/email');
      result = sendEmailNoKey({
        to: 'a@b.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      });
    });

    result = await result;
    expect(result).toEqual({ success: true });
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();

    process.env.RESEND_API_KEY = originalKey;
  });
});
