/**
 * Tests for the shared apiFetch abstraction and handleFetchError helper.
 *
 * Covers:
 * - 200: returns parsed JSON
 * - 204: returns undefined
 * - 401: redirects to login with returnUrl and throws ApiError
 * - 4xx/5xx: throws ApiError with status and parsed body
 * - Network error: bubbles up the original error
 * - handleFetchError: calls toast.error with appropriate message
 */

// Mock sonner before imports
const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: { error: mockToastError },
}));

import { apiFetch, ApiError, handleFetchError } from '@/lib/api-client';

// Mock fetch
const originalFetch = global.fetch;
const mockFetch = jest.fn();
beforeAll(() => { global.fetch = mockFetch; });
afterAll(() => { global.fetch = originalFetch; });

describe('apiFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  it('returns parsed JSON on 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '123', name: 'test' }),
    });

    const result = await apiFetch<{ id: string; name: string }>('/api/test');

    expect(result).toEqual({ id: '123', name: 'test' });
    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('returns undefined on 204 No Content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const result = await apiFetch('/api/test');

    expect(result).toBeUndefined();
  });

  it('sets Content-Type header by default', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await apiFetch('/api/test', { method: 'POST' });

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('allows overriding headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await apiFetch('/api/test', {
      headers: { 'X-Custom': 'value' },
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      headers: {
        'Content-Type': 'application/json',
        'X-Custom': 'value',
      },
    });
  });

  it('redirects to login with returnUrl on 401', async () => {
    const originalLocation = window.location;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    // Mock window.location to capture href assignment
    const hrefSetter = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { pathname: '/listings/123' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, 'href', {
      set: hrefSetter,
      configurable: true,
    });

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError);

    expect(hrefSetter).toHaveBeenCalledWith('/login?returnUrl=%2Flistings%2F123');

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('throws ApiError with "Session expired" on 401', async () => {
    const originalLocation = window.location;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    // Mock to prevent navigation
    Object.defineProperty(window, 'location', {
      value: { pathname: '/' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, 'href', {
      set: jest.fn(),
      configurable: true,
    });

    try {
      await apiFetch('/api/test');
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('Session expired');
      expect((err as ApiError).status).toBe(401);
    }

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('throws ApiError with status and body on 4xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Validation failed', fields: { email: 'invalid' } }),
    });

    try {
      await apiFetch('/api/test');
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.message).toBe('Validation failed');
      expect(apiErr.body).toEqual({ error: 'Validation failed', fields: { email: 'invalid' } });
    }
  });

  it('throws ApiError with status on 5xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal server error' }),
    });

    try {
      await apiFetch('/api/test');
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.message).toBe('Internal server error');
    }
  });

  it('falls back to "Request failed" when body has no error/message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ code: 'BAD_REQUEST' }),
    });

    try {
      await apiFetch('/api/test');
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('Request failed');
    }
  });

  it('handles non-JSON error responses gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => { throw new Error('not JSON'); },
    });

    try {
      await apiFetch('/api/test');
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(502);
      expect((err as ApiError).message).toBe('Request failed');
    }
  });

  it('passes through AbortSignal', async () => {
    const controller = new AbortController();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await apiFetch('/api/test', { signal: controller.signal });

    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      signal: controller.signal,
    }));
  });
});

describe('ApiError', () => {
  it('has correct name, message, status, and body', () => {
    const err = new ApiError('Not found', 404, { detail: 'Resource missing' });

    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.body).toEqual({ detail: 'Resource missing' });
    expect(err instanceof Error).toBe(true);
  });
});

describe('handleFetchError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls toast.error with ApiError message', () => {
    const err = new ApiError('Forbidden', 403);

    handleFetchError(err, 'Default message');

    expect(mockToastError).toHaveBeenCalledWith('Forbidden');
  });

  it('calls toast.error with fallback message for non-ApiError', () => {
    handleFetchError(new Error('Network error'), 'Something went wrong');

    expect(mockToastError).toHaveBeenCalledWith('Something went wrong');
  });

  it('calls toast.error with fallback message for unknown error types', () => {
    handleFetchError('string error', 'Fallback');

    expect(mockToastError).toHaveBeenCalledWith('Fallback');
  });

  it('logs error in development mode', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const originalEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true });

    handleFetchError(new Error('test'), 'fallback');

    expect(consoleSpy).toHaveBeenCalledWith('fallback', expect.any(Error));

    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, configurable: true });
    consoleSpy.mockRestore();
  });
});
