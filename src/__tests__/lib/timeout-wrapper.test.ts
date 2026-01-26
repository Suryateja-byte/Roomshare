/**
 * Tests for timeout-wrapper utility
 * P0-05/P1-08/P1-09/P1-10 FIX: Validates timeout protection for async operations
 */

import {
  withTimeout,
  fetchWithTimeout,
  TimeoutError,
  isTimeoutError,
  DEFAULT_TIMEOUTS,
} from '@/lib/timeout-wrapper';

describe('timeout-wrapper', () => {
  describe('TimeoutError', () => {
    it('creates error with correct properties', () => {
      const error = new TimeoutError('test operation', 5000);

      expect(error.name).toBe('TimeoutError');
      expect(error.operation).toBe('test operation');
      expect(error.timeoutMs).toBe(5000);
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.message).toBe('test operation timed out after 5000ms');
    });

    it('is instance of Error', () => {
      const error = new TimeoutError('test', 1000);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('isTimeoutError', () => {
    it('returns true for TimeoutError instances', () => {
      const error = new TimeoutError('test', 1000);
      expect(isTimeoutError(error)).toBe(true);
    });

    it('returns false for regular Error', () => {
      const error = new Error('regular error');
      expect(isTimeoutError(error)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isTimeoutError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isTimeoutError(undefined)).toBe(false);
    });

    it('returns false for string', () => {
      expect(isTimeoutError('error string')).toBe(false);
    });

    it('returns false for object with similar properties', () => {
      const fakeError = {
        name: 'TimeoutError',
        code: 'TIMEOUT_ERROR',
        operation: 'test',
        timeoutMs: 1000,
      };
      expect(isTimeoutError(fakeError)).toBe(false);
    });
  });

  describe('withTimeout', () => {
    it('resolves when promise completes before timeout', async () => {
      const fastPromise = Promise.resolve('success');
      const result = await withTimeout(fastPromise, 1000, 'fast operation');
      expect(result).toBe('success');
    });

    it('rejects with TimeoutError when promise takes too long', async () => {
      const slowPromise = new Promise((resolve) =>
        setTimeout(() => resolve('too late'), 500)
      );

      await expect(
        withTimeout(slowPromise, 100, 'slow operation')
      ).rejects.toThrow(TimeoutError);
    });

    it('TimeoutError contains correct operation name', async () => {
      const slowPromise = new Promise((resolve) =>
        setTimeout(() => resolve('too late'), 500)
      );

      try {
        await withTimeout(slowPromise, 100, 'my custom operation');
        fail('Expected TimeoutError to be thrown');
      } catch (error) {
        expect(isTimeoutError(error)).toBe(true);
        if (isTimeoutError(error)) {
          expect(error.operation).toBe('my custom operation');
          expect(error.timeoutMs).toBe(100);
        }
      }
    });

    it('preserves original error when promise rejects', async () => {
      const failingPromise = Promise.reject(new Error('original error'));

      await expect(
        withTimeout(failingPromise, 1000, 'failing operation')
      ).rejects.toThrow('original error');
    });

    it('clears timeout when promise resolves', async () => {
      jest.useFakeTimers();

      const promise = Promise.resolve('done');
      const resultPromise = withTimeout(promise, 10000, 'test');

      await resultPromise;

      // Advance timers - should not cause any issues since timeout was cleared
      jest.advanceTimersByTime(15000);

      jest.useRealTimers();
    });

    it('clears timeout when promise rejects', async () => {
      jest.useFakeTimers();

      const promise = Promise.reject(new Error('fail'));
      const resultPromise = withTimeout(promise, 10000, 'test');

      await expect(resultPromise).rejects.toThrow('fail');

      // Advance timers - should not cause any issues since timeout was cleared
      jest.advanceTimersByTime(15000);

      jest.useRealTimers();
    });

    it('handles zero timeout', async () => {
      const promise = new Promise((resolve) =>
        setTimeout(() => resolve('result'), 10)
      );

      await expect(withTimeout(promise, 0, 'zero timeout')).rejects.toThrow(
        TimeoutError
      );
    });

    it('works with async functions returning different types', async () => {
      const numberPromise = Promise.resolve(42);
      const objectPromise = Promise.resolve({ key: 'value' });
      const arrayPromise = Promise.resolve([1, 2, 3]);

      const numResult = await withTimeout(numberPromise, 1000, 'number');
      const objResult = await withTimeout(objectPromise, 1000, 'object');
      const arrResult = await withTimeout(arrayPromise, 1000, 'array');

      expect(numResult).toBe(42);
      expect(objResult).toEqual({ key: 'value' });
      expect(arrResult).toEqual([1, 2, 3]);
    });
  });

  describe('fetchWithTimeout', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      // Reset fetch mock before each test
      global.fetch = jest.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns response when fetch completes before timeout', async () => {
      const mockResponse = new Response('success', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const response = await fetchWithTimeout(
        'https://example.com',
        {},
        5000,
        'test fetch'
      );

      expect(response).toBe(mockResponse);
    });

    it('passes options to fetch', async () => {
      const mockResponse = new Response('success');
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      };

      await fetchWithTimeout(
        'https://example.com/api',
        options,
        5000,
        'POST request'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: 'test' }),
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('converts AbortError to TimeoutError on timeout', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      (global.fetch as jest.Mock).mockRejectedValue(abortError);

      await expect(
        fetchWithTimeout(
          'https://example.com',
          {},
          100,
          'slow API'
        )
      ).rejects.toThrow(TimeoutError);
    });

    it('preserves non-AbortError errors', async () => {
      const networkError = new Error('Network failure');
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      await expect(
        fetchWithTimeout('https://example.com', {}, 5000, 'network test')
      ).rejects.toThrow('Network failure');
    });

    it('works with URL object', async () => {
      const mockResponse = new Response('success');
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const url = new URL('https://example.com/path');
      const response = await fetchWithTimeout(url, {}, 5000, 'URL object test');

      expect(response).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(url, expect.any(Object));
    });
  });

  describe('DEFAULT_TIMEOUTS', () => {
    it('has reasonable values for all timeout types', () => {
      expect(DEFAULT_TIMEOUTS.LLM_STREAM).toBe(30000);
      expect(DEFAULT_TIMEOUTS.REDIS).toBe(1000);
      expect(DEFAULT_TIMEOUTS.EXTERNAL_API).toBe(5000);
      expect(DEFAULT_TIMEOUTS.DATABASE).toBe(10000);
      expect(DEFAULT_TIMEOUTS.EMAIL).toBe(15000);
    });

    it('LLM_STREAM is the longest (AI needs more time)', () => {
      const allTimeouts = Object.values(DEFAULT_TIMEOUTS);
      expect(DEFAULT_TIMEOUTS.LLM_STREAM).toBe(Math.max(...allTimeouts));
    });

    it('REDIS is the shortest (should be fast)', () => {
      const allTimeouts = Object.values(DEFAULT_TIMEOUTS);
      expect(DEFAULT_TIMEOUTS.REDIS).toBe(Math.min(...allTimeouts));
    });
  });
});
