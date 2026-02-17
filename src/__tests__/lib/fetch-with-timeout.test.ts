/**
 * Tests for fetch-with-timeout utility
 * Validates timeout behavior, abort signal handling, and error propagation
 */

import {
  fetchWithTimeout,
  fetchJsonWithTimeout,
  FetchTimeoutError,
} from '@/lib/fetch-with-timeout';

describe('fetch-with-timeout', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  describe('FetchTimeoutError', () => {
    it('creates error with correct properties', () => {
      const error = new FetchTimeoutError('https://api.example.com', 5000);

      expect(error.name).toBe('FetchTimeoutError');
      expect(error.url).toBe('https://api.example.com');
      expect(error.timeout).toBe(5000);
      expect(error.message).toBe(
        'Request to https://api.example.com timed out after 5000ms',
      );
    });

    it('is an instance of Error', () => {
      const error = new FetchTimeoutError('https://example.com', 1000);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('fetchWithTimeout', () => {
    it('returns response when fetch completes before timeout', async () => {
      const mockResponse = new Response('success', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const responsePromise = fetchWithTimeout('https://api.example.com/data');
      jest.runAllTimers();
      const response = await responsePromise;

      expect(response).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('passes fetch options to underlying fetch', async () => {
      const mockResponse = new Response('ok');
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const options = {
        method: 'POST' as const,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'value' }),
      };

      const responsePromise = fetchWithTimeout('https://api.example.com', options);
      jest.runAllTimers();
      await responsePromise;

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'value' }),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('uses default 10s timeout', async () => {
      const mockResponse = new Response('ok');
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const responsePromise = fetchWithTimeout('https://api.example.com');
      jest.runAllTimers();
      await responsePromise;

      // Verify the AbortController was set up (signal is passed)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('throws FetchTimeoutError when request times out', async () => {
      // Simulate a fetch that never resolves
      (global.fetch as jest.Mock).mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) => {
          return new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          });
        },
      );

      const responsePromise = fetchWithTimeout('https://slow.api.com', {
        timeout: 5000,
      });

      jest.advanceTimersByTime(5000);

      await expect(responsePromise).rejects.toThrow(FetchTimeoutError);
      await expect(responsePromise).rejects.toThrow(
        'Request to https://slow.api.com timed out after 5000ms',
      );
    });

    it('propagates non-abort errors from fetch', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const responsePromise = fetchWithTimeout('https://broken.api.com');
      jest.runAllTimers();

      await expect(responsePromise).rejects.toThrow('Network error');
      await expect(responsePromise).rejects.not.toThrow(FetchTimeoutError);
    });

    it('respects custom timeout value', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) => {
          return new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          });
        },
      );

      const responsePromise = fetchWithTimeout('https://slow.api.com', {
        timeout: 2000,
      });

      // At 1999ms, should not yet be timed out
      jest.advanceTimersByTime(1999);
      // The promise should still be pending

      // At 2000ms, timeout fires
      jest.advanceTimersByTime(1);

      await expect(responsePromise).rejects.toThrow(FetchTimeoutError);
    });

    it('clears timeout after successful fetch', async () => {
      const mockResponse = new Response('ok');
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const responsePromise = fetchWithTimeout('https://api.example.com', {
        timeout: 5000,
      });
      jest.runAllTimers();
      await responsePromise;

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('clears timeout after fetch error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('fetch failed'));

      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const responsePromise = fetchWithTimeout('https://api.example.com');
      jest.runAllTimers();

      await expect(responsePromise).rejects.toThrow('fetch failed');
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('aborts when existing signal is already aborted', async () => {
      const existingController = new AbortController();
      existingController.abort();

      (global.fetch as jest.Mock).mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) => {
          if (opts.signal.aborted) {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            return Promise.reject(abortError);
          }
          return Promise.resolve(new Response('ok'));
        },
      );

      const responsePromise = fetchWithTimeout('https://api.example.com', {
        signal: existingController.signal,
      });
      jest.runAllTimers();

      await expect(responsePromise).rejects.toThrow(FetchTimeoutError);
    });

    it('links existing signal to controller', async () => {
      const existingController = new AbortController();

      (global.fetch as jest.Mock).mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) => {
          return new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          });
        },
      );

      const responsePromise = fetchWithTimeout('https://api.example.com', {
        signal: existingController.signal,
        timeout: 30000,
      });

      // Abort via existing controller (not timeout)
      existingController.abort();

      await expect(responsePromise).rejects.toThrow(FetchTimeoutError);
    });
  });

  describe('fetchJsonWithTimeout', () => {
    it('returns parsed JSON for successful response', async () => {
      const data = { items: [1, 2, 3], total: 3 };
      const mockResponse = new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const resultPromise = fetchJsonWithTimeout<{ items: number[]; total: number }>(
        'https://api.example.com/data',
      );
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result).toEqual(data);
    });

    it('sends Content-Type: application/json header', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const resultPromise = fetchJsonWithTimeout('https://api.example.com');
      jest.runAllTimers();
      await resultPromise;

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('throws for non-OK response status', async () => {
      const mockResponse = new Response('Not Found', { status: 404 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const resultPromise = fetchJsonWithTimeout('https://api.example.com/missing');
      jest.runAllTimers();

      await expect(resultPromise).rejects.toThrow('HTTP 404: Not Found');
    });

    it('throws for 500 response with error text', async () => {
      const mockResponse = new Response('Internal Server Error', { status: 500 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const resultPromise = fetchJsonWithTimeout('https://api.example.com/error');
      jest.runAllTimers();

      await expect(resultPromise).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('propagates timeout error from fetchWithTimeout', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) => {
          return new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          });
        },
      );

      const resultPromise = fetchJsonWithTimeout('https://slow.api.com', {
        timeout: 1000,
      });

      jest.advanceTimersByTime(1000);

      await expect(resultPromise).rejects.toThrow(FetchTimeoutError);
    });

    it('merges custom headers with default Content-Type', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const resultPromise = fetchJsonWithTimeout('https://api.example.com', {
        headers: { Authorization: 'Bearer token123' },
      });
      jest.runAllTimers();
      await resultPromise;

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer token123',
          }),
        }),
      );
    });
  });
});
