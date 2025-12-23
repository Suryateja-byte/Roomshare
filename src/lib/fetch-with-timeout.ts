/**
 * Fetch wrapper with timeout support using AbortController
 * Prevents hanging requests from blocking the application
 */

export class FetchTimeoutError extends Error {
  constructor(
    public readonly url: string,
    public readonly timeout: number
  ) {
    super(`Request to ${url} timed out after ${timeout}ms`);
    this.name = 'FetchTimeoutError';
  }
}

export interface FetchWithTimeoutOptions extends RequestInit {
  /** Timeout in milliseconds. Default: 10000 (10 seconds) */
  timeout?: number;
}

/**
 * Fetch with automatic timeout support
 *
 * @param url - The URL to fetch
 * @param options - Fetch options plus optional timeout
 * @returns Promise<Response>
 * @throws FetchTimeoutError if request times out
 *
 * @example
 * ```ts
 * // Basic usage with default 10s timeout
 * const response = await fetchWithTimeout('https://api.example.com/data');
 *
 * // Custom timeout
 * const response = await fetchWithTimeout('https://api.example.com/slow', {
 *   timeout: 30000, // 30 seconds
 *   method: 'POST',
 *   body: JSON.stringify(data),
 * });
 * ```
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = 10000, signal: existingSignal, ...fetchOptions } = options;

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // If an existing signal was provided, link it to our controller
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    // Check if this was a timeout abort
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeout);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch JSON with timeout and automatic parsing
 *
 * @param url - The URL to fetch
 * @param options - Fetch options plus optional timeout
 * @returns Promise<T> - Parsed JSON response
 */
export async function fetchJsonWithTimeout<T = unknown>(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<T> {
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
