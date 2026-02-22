/**
 * Tests for auth.ts (NextAuth configuration)
 *
 * Covers: session callback, JWT callback, signIn callback,
 * authorized callback, and linkAccount event.
 *
 * Strategy: capture the config passed to the mocked NextAuth() call
 * and test each callback in isolation.
 */

// ── Mocks (must be before imports) ──

jest.mock('@/lib/auth-helpers', () => ({
  isGoogleEmailVerified: jest.fn().mockReturnValue(true),
  AUTH_ROUTES: { signIn: '/login' },
  normalizeEmail: jest.fn((email: string) => email.toLowerCase().trim()),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  },
  sanitizeErrorMessage: jest.fn((e: unknown) =>
    e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error'
  ),
}));

jest.mock('@/lib/turnstile', () => ({
  verifyTurnstileToken: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

// ── Imports ──

import NextAuth from 'next-auth';
import { prisma } from '@/lib/prisma';
import { isGoogleEmailVerified } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

// Trigger auth module load (calls mocked NextAuth with real config)
import '@/auth';

// ── Extract callbacks from captured NextAuth config ──

function getAuthConfig() {
  const calls = (NextAuth as unknown as jest.Mock).mock.calls;
  if (!calls.length) throw new Error('NextAuth was not called — module load failed');
  return calls[0][0];
}

describe('auth.ts NextAuth configuration', () => {
  let config: any;

  beforeAll(() => {
    config = getAuthConfig();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Session callback ──

  describe('session callback', () => {
    it('enriches session.user with token data', async () => {
      const session = { user: {} as any };
      const token = {
        sub: 'user-123',
        emailVerified: new Date('2024-01-01'),
        isAdmin: true,
        isSuspended: false,
        image: '/avatar.jpg',
      };

      const result = await config.callbacks.session({ session, token });

      expect(result.user.id).toBe('user-123');
      expect(result.user.emailVerified).toEqual(new Date('2024-01-01'));
      expect(result.user.isAdmin).toBe(true);
      expect(result.user.isSuspended).toBe(false);
      expect(result.user.image).toBe('/avatar.jpg');
    });

    it('does not set id when token.sub is missing', async () => {
      const session = { user: {} as any };
      const token = { isAdmin: false, isSuspended: false };

      const result = await config.callbacks.session({ session, token });

      expect(result.user.id).toBeUndefined();
    });

    it('does not set image when token.image is missing', async () => {
      const session = { user: {} as any };
      const token = { sub: 'user-123', isAdmin: false, isSuspended: false };

      const result = await config.callbacks.session({ session, token });

      expect(result.user.id).toBe('user-123');
      expect(result.user.image).toBeUndefined();
    });

    it('handles null session.user gracefully', async () => {
      const session = { user: null as any };
      const token = { sub: 'user-123' };

      // Should not throw
      const result = await config.callbacks.session({ session, token });
      expect(result).toBeDefined();
    });
  });

  // ── JWT callback ──

  describe('jwt callback', () => {
    it('sets initial token values from user on sign-in', async () => {
      const token = {} as any;
      const user = {
        id: 'user-123',
        emailVerified: new Date('2024-01-01'),
        isAdmin: true,
        isSuspended: false,
        image: '/img.jpg',
        name: 'Test User',
      };

      const result = await config.callbacks.jwt({ token, user, trigger: 'signIn' });

      expect(result.sub).toBe('user-123');
      expect(result.emailVerified).toEqual(new Date('2024-01-01'));
      expect(result.isAdmin).toBe(true);
      expect(result.isSuspended).toBe(false);
      expect(result.image).toBe('/img.jpg');
      expect(result.name).toBe('Test User');
    });

    it('refreshes from DB on signIn trigger', async () => {
      const dbUser = {
        emailVerified: new Date('2024-06-01'),
        isAdmin: false,
        isSuspended: true,
        image: '/new-img.jpg',
        name: 'Updated Name',
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(dbUser);

      const token = { sub: 'user-123' } as any;
      const result = await config.callbacks.jwt({ token, trigger: 'signIn' });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { emailVerified: true, isAdmin: true, isSuspended: true, image: true, name: true },
      });
      expect(result.isSuspended).toBe(true);
      expect(result.name).toBe('Updated Name');
    });

    it('refreshes from DB on update trigger', async () => {
      const dbUser = {
        emailVerified: new Date(),
        isAdmin: false,
        isSuspended: false,
        image: '/updated.jpg',
        name: 'Updated',
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(dbUser);

      const token = { sub: 'user-456' } as any;
      const result = await config.callbacks.jwt({ token, trigger: 'update' });

      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(result.image).toBe('/updated.jpg');
    });

    it('refreshes from DB when account is present (OAuth link)', async () => {
      const dbUser = {
        emailVerified: new Date(),
        isAdmin: false,
        isSuspended: false,
        image: '/oauth.jpg',
        name: 'OAuth User',
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(dbUser);

      const token = { sub: 'user-789' } as any;
      const account = { provider: 'google' };
      const result = await config.callbacks.jwt({ token, account });

      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(result.image).toBe('/oauth.jpg');
    });

    it('does NOT refresh from DB on normal token refresh (no trigger)', async () => {
      const token = { sub: 'user-123', isAdmin: false } as any;
      const result = await config.callbacks.jwt({ token });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(result.isAdmin).toBe(false);
    });

    it('keeps existing token values on DB error', async () => {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const token = { sub: 'user-123', isAdmin: true, isSuspended: false } as any;
      const result = await config.callbacks.jwt({ token, trigger: 'signIn' });

      // Original values preserved
      expect(result.isAdmin).toBe(true);
      expect(result.isSuspended).toBe(false);
      expect(logger.sync.error).toHaveBeenCalledWith(
        'JWT callback DB error',
        expect.objectContaining({ error: 'DB Error' }),
      );
    });
  });

  // ── signIn callback ──

  describe('signIn callback', () => {
    it('blocks Google OAuth when email is not verified', async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(false);

      const result = await config.callbacks.signIn({
        user: { email: 'test@example.com' },
        account: { provider: 'google' },
        profile: { email_verified: false },
      });

      expect(result).toBe('/login?error=EmailNotVerified');
    });

    it('allows Google OAuth when email is verified', async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isSuspended: false });

      const result = await config.callbacks.signIn({
        user: { email: 'test@example.com' },
        account: { provider: 'google' },
        profile: { email_verified: true },
      });

      expect(result).toBe(true);
    });

    it('blocks suspended users (Google provider)', async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isSuspended: true });

      const result = await config.callbacks.signIn({
        user: { email: 'suspended@example.com' },
        account: { provider: 'google' },
        profile: { email_verified: true },
      });

      expect(result).toBe('/login?error=AccountSuspended');
    });

    it('blocks suspended users (credentials provider)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isSuspended: true });

      const result = await config.callbacks.signIn({
        user: { email: 'suspended@example.com' },
        account: { provider: 'credentials' },
      });

      expect(result).toBe('/login?error=AccountSuspended');
    });

    it('allows non-suspended credential users', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isSuspended: false });

      const result = await config.callbacks.signIn({
        user: { email: 'active@example.com' },
        account: { provider: 'credentials' },
      });

      expect(result).toBe(true);
    });

    it('allows sign-in when user has no email (edge case)', async () => {
      const result = await config.callbacks.signIn({
        user: {},
        account: { provider: 'credentials' },
      });

      expect(result).toBe(true);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('logs warning when Google OAuth blocked for unverified email', async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(false);

      await config.callbacks.signIn({
        user: { email: 'test@example.com' },
        account: { provider: 'google' },
        profile: { email_verified: false },
      });

      expect(logger.sync.warn).toHaveBeenCalledWith(
        'Google OAuth blocked: email not verified',
        expect.any(Object),
      );
    });
  });

  // ── authorized callback ──

  describe('authorized callback', () => {
    function createAuthArgs(pathname: string, isLoggedIn: boolean) {
      return {
        auth: isLoggedIn ? { user: { id: 'user-123' } } : null,
        request: { nextUrl: new URL(`http://localhost${pathname}`) },
      };
    }

    it('allows authenticated users to access /dashboard', () => {
      const result = config.callbacks.authorized(createAuthArgs('/dashboard', true));
      expect(result).toBe(true);
    });

    it('blocks unauthenticated users from /dashboard', () => {
      const result = config.callbacks.authorized(createAuthArgs('/dashboard', false));
      expect(result).toBe(false);
    });

    it('blocks unauthenticated users from /dashboard/settings', () => {
      const result = config.callbacks.authorized(createAuthArgs('/dashboard/settings', false));
      expect(result).toBe(false);
    });

    it('redirects authenticated users away from /login', () => {
      // Response.redirect throws in whatwg-fetch polyfill; verify intent
      try {
        const result = config.callbacks.authorized(createAuthArgs('/login', true));
        // If polyfill works, result is a Response redirect
        expect(result).toBeInstanceOf(Response);
      } catch (e: any) {
        // whatwg-fetch polyfill throws RangeError for redirect — the callback
        // reached Response.redirect which confirms the redirect intent
        expect(e.message).toContain('Invalid status code');
      }
    });

    it('redirects authenticated users away from /signup', () => {
      try {
        const result = config.callbacks.authorized(createAuthArgs('/signup', true));
        expect(result).toBeInstanceOf(Response);
      } catch (e: any) {
        expect(e.message).toContain('Invalid status code');
      }
    });

    it('allows unauthenticated users to access /login', () => {
      const result = config.callbacks.authorized(createAuthArgs('/login', false));
      expect(result).toBe(true);
    });

    it('allows all users to access non-protected routes', () => {
      expect(config.callbacks.authorized(createAuthArgs('/listings/123', true))).toBe(true);
      expect(config.callbacks.authorized(createAuthArgs('/listings/123', false))).toBe(true);
      expect(config.callbacks.authorized(createAuthArgs('/', true))).toBe(true);
      expect(config.callbacks.authorized(createAuthArgs('/', false))).toBe(true);
    });
  });

  // ── linkAccount event ──

  describe('linkAccount event', () => {
    it('clears OAuth tokens after account link (security hardening)', async () => {
      (prisma.account.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await config.events.linkAccount({
        user: { id: 'user-123' },
        account: { provider: 'google', providerAccountId: 'goog-456' },
      });

      expect(prisma.account.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          provider: 'google',
          providerAccountId: 'goog-456',
        },
        data: {
          access_token: null,
          refresh_token: null,
          id_token: null,
        },
      });
    });

    it('logs OAuth account link event', async () => {
      (prisma.account.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await config.events.linkAccount({
        user: { id: 'user-123' },
        account: { provider: 'google', providerAccountId: 'goog-456' },
      });

      expect(logger.sync.info).toHaveBeenCalledWith(
        'OAuth account linked',
        expect.objectContaining({ userId: 'user-123', provider: 'google' }),
      );
    });

    it('handles token clearing failure gracefully', async () => {
      (prisma.account.updateMany as jest.Mock).mockRejectedValue(new Error('DB Error'));

      // Should not throw
      await config.events.linkAccount({
        user: { id: 'user-123' },
        account: { provider: 'google', providerAccountId: 'goog-456' },
      });

      expect(logger.sync.warn).toHaveBeenCalledWith(
        'Failed to clear OAuth tokens after link',
        expect.objectContaining({ userId: 'user-123', provider: 'google' }),
      );
    });
  });

  // ── Session config (security) ──

  describe('session configuration', () => {
    it('uses JWT strategy', () => {
      expect(config.session.strategy).toBe('jwt');
    });

    it('has maxAge of 14 days', () => {
      expect(config.session.maxAge).toBe(14 * 24 * 60 * 60);
    });

    it('has updateAge of 1 day', () => {
      expect(config.session.updateAge).toBe(24 * 60 * 60);
    });
  });

  // ── Pages config ──

  describe('pages configuration', () => {
    it('uses /login as sign-in page', () => {
      expect(config.pages.signIn).toBe('/login');
    });

    it('uses /login as error page', () => {
      expect(config.pages.error).toBe('/login');
    });
  });
});
