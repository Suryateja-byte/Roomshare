/**
 * Shared API client abstraction for consistent error handling,
 * 401 detection, and user-facing error feedback across all components.
 */

import { toast } from 'sonner';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  url: string,
  options?: RequestInit & { signal?: AbortSignal }
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = `/login?returnUrl=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError('Session expired', 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as Record<string, string>).error ||
        (body as Record<string, string>).message ||
        'Request failed',
      res.status,
      body as Record<string, unknown>
    );
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Toast helper for catch blocks — displays user-facing error via sonner. */
export function handleFetchError(error: unknown, fallbackMessage: string): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(fallbackMessage, error);
  }

  if (error instanceof ApiError) {
    toast.error(error.message);
  } else {
    toast.error(fallbackMessage);
  }
}
