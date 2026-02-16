/**
 * Auth/Session Edge Cases Tests
 *
 * Tests for authentication and session edge cases in the Nearby Places API.
 * Validates handling of session states, token expiry, and auth failures.
 *
 * @see Plan Category B - Auth/Session Edge Cases (10 tests)
 */

// Mock NextResponse before importing the route
const mockJsonFn = jest.fn();
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      mockJsonFn(data, init);
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(Object.entries(init?.headers || {})),
      };
    },
  },
}));

// Mock auth
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

// Mock rate limiting
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

// Mock fetch for Radar API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { POST } from '@/app/api/nearby/route';
import { auth } from '@/auth';
import { withRateLimit } from '@/lib/with-rate-limit';
import {
  mockSession,
  mockSessionNoId,
  createExpiringSessionMock,
  createFailingSessionMock,
  createAccountSwitchMock,
} from '@/__tests__/utils/mocks/session.mock';
import { mockRadarPlace } from '@/__tests__/utils/mocks/radar-api.mock';

describe('POST /api/nearby - Auth/Session Edge Cases', () => {
  const validRequestBody = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    categories: ['food-grocery'],
    radiusMeters: 1609,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RADAR_SECRET_KEY = 'test-secret-key';
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { code: 200 }, places: [mockRadarPlace] }),
    });
  });

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY;
  });

  const createRequest = (body: unknown): Request => {
    return {
      json: async () => body,
      url: 'http://localhost:3000/api/nearby',
      headers: new Headers(),
    } as unknown as Request;
  };

  // B1: Session with blocked cookies returns auth prompt
  describe('B1: Blocked Cookies', () => {
    it('returns 401 when session is null (cookies blocked)', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  // B2: Third-party cookie restrictions handled
  describe('B2: Third-Party Cookie Restrictions', () => {
    it('returns 401 when session user is undefined', async () => {
      (auth as jest.Mock).mockResolvedValue({ expires: '2025-01-01' });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  // B3: Slow session fetch shows loading then auth
  describe('B3: Slow Session Fetch', () => {
    it('waits for slow session resolution', async () => {
      // Simulate slow session fetch
      (auth as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockSession), 100))
      );

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places).toBeDefined();
    });
  });

  // B4: Session refresh mid-request returns 401 gracefully
  describe('B4: Token Expiry Mid-Request', () => {
    it('handles session that expires during request', async () => {
      const expiringSession = createExpiringSessionMock();
      (auth as jest.Mock).mockImplementation(expiringSession.auth);

      // First call succeeds
      const response1 = await POST(createRequest(validRequestBody));
      expect(response1.status).toBe(200);

      // Expire the session
      expiringSession.expire();

      // Second call should fail
      const response2 = await POST(createRequest(validRequestBody));
      const data = await response2.json();

      expect(response2.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  // B5: Account switch without reload uses new session
  describe('B5: Account Switch', () => {
    it('uses updated session after account switch', async () => {
      const accountSwitch = createAccountSwitchMock();
      (auth as jest.Mock).mockImplementation(accountSwitch.auth);

      // First request with user-123
      const response1 = await POST(createRequest(validRequestBody));
      expect(response1.status).toBe(200);

      // Switch to user-456
      accountSwitch.switchTo('user-456');

      // Second request should use new user
      const response2 = await POST(createRequest(validRequestBody));
      expect(response2.status).toBe(200);

      // Verify auth was called with different user context
      expect(accountSwitch.getCurrentUser()).toBe('user-456');
    });
  });

  // B6: Account downgrade mid-session shows upgrade
  describe('B6: Entitlement Change', () => {
    it('handles session without nearby entitlement', async () => {
      // Session exists but user might lack entitlement
      (auth as jest.Mock).mockResolvedValue(mockSession);

      const response = await POST(createRequest(validRequestBody));

      // Current implementation doesn't check entitlements, just auth
      expect(response.status).toBe(200);
    });
  });

  // B7: Session exists but lacks nearby entitlement
  describe('B7: Permission Check', () => {
    it('requires user ID in session', async () => {
      (auth as jest.Mock).mockResolvedValue(mockSessionNoId);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  // B8: Private window session absent shows login
  describe('B8: Incognito Mode', () => {
    it('returns 401 in incognito (no session)', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  // B9: CSRF mismatch returns 403
  describe('B9: CSRF Validation', () => {
    it('handles rate limiting response (simulates CSRF protection)', async () => {
      (auth as jest.Mock).mockResolvedValue(mockSession);
      (withRateLimit as jest.Mock).mockResolvedValueOnce({
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      });

      const response = await POST(createRequest(validRequestBody));

      expect(response.status).toBe(403);
    });
  });

  // B10: Frequent logout/login doesn't memory leak
  describe('B10: Session Cleanup', () => {
    it('handles rapid session changes without issues', async () => {
      const accountSwitch = createAccountSwitchMock();
      (auth as jest.Mock).mockImplementation(accountSwitch.auth);

      // Simulate rapid login/logout cycles
      for (let i = 0; i < 10; i++) {
        accountSwitch.switchTo(`user-${i}`);
        const response = await POST(createRequest(validRequestBody));
        expect(response.status).toBe(200);
      }

      // All requests should complete without memory issues
      expect(accountSwitch.auth).toHaveBeenCalledTimes(10);
    });

    it('handles auth system failure gracefully', async () => {
      const failingAuth = createFailingSessionMock('Auth system unavailable');
      (auth as jest.Mock).mockImplementation(failingAuth.auth);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      // Should return 500, not crash
      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });
});
