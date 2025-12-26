/**
 * Session Mock Utilities
 *
 * Mock utilities for testing auth/session edge cases.
 * Supports: slow sessions, expiring sessions, blocked cookies, etc.
 */

import type { Session } from 'next-auth';

/**
 * Standard mock session for authenticated tests
 */
export const mockSession: Session = {
  user: {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
  },
  expires: new Date(Date.now() + 86400000).toISOString(), // 24h from now
};

/**
 * Session without user ID (edge case)
 */
export const mockSessionNoId: Session = {
  user: {
    name: 'Test User',
    email: 'test@example.com',
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

/**
 * Create a mock that simulates slow session fetching
 * @param delay - Delay in milliseconds before returning session
 */
export function createSlowSessionMock(delay: number) {
  return {
    auth: jest.fn(
      () => new Promise<Session>((resolve) => setTimeout(() => resolve(mockSession), delay))
    ),
  };
}

/**
 * Create a mock that can be expired mid-request
 * Useful for testing token expiry during API calls
 */
export function createExpiringSessionMock() {
  let expired = false;
  return {
    auth: jest.fn(() => Promise.resolve(expired ? null : mockSession)),
    expire: () => {
      expired = true;
    },
    reset: () => {
      expired = false;
    },
  };
}

/**
 * Create a mock that throws an error (simulates auth system failure)
 */
export function createFailingSessionMock(errorMessage: string = 'Auth system unavailable') {
  return {
    auth: jest.fn(() => Promise.reject(new Error(errorMessage))),
  };
}

/**
 * Create a mock that simulates switching accounts
 */
export function createAccountSwitchMock() {
  let currentUser = 'user-123';
  return {
    auth: jest.fn(() =>
      Promise.resolve({
        ...mockSession,
        user: { ...mockSession.user, id: currentUser },
      })
    ),
    switchTo: (userId: string) => {
      currentUser = userId;
    },
    getCurrentUser: () => currentUser,
  };
}

/**
 * Mock for useSession hook
 */
export const mockUseSessionAuthenticated = {
  data: mockSession,
  status: 'authenticated' as const,
  update: jest.fn(),
};

export const mockUseSessionLoading = {
  data: null,
  status: 'loading' as const,
  update: jest.fn(),
};

export const mockUseSessionUnauthenticated = {
  data: null,
  status: 'unauthenticated' as const,
  update: jest.fn(),
};
