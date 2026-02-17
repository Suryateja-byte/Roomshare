/**
 * Tests for allowDangerousEmailAccountLinking safety guard
 *
 * Verifies that:
 * 1. The auth config has allowDangerousEmailAccountLinking set on Google provider
 * 2. The signIn callback blocks Google OAuth when email_verified !== true
 * 3. isGoogleEmailVerified is a strict boolean check
 *
 * This flag allows Google OAuth sign-in to automatically link to an existing
 * password-based account that shares the same email. It is "dangerous" because
 * without the email_verified guard, an attacker could register a Google account
 * with someone else's email and hijack their password-based account.
 *
 * Our safety contract:
 * - allowDangerousEmailAccountLinking: true (enables seamless UX)
 * - signIn callback HARD-FAILS if Google profile.email_verified !== true
 * - isGoogleEmailVerified only returns true for strict boolean true
 */

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

import { isGoogleEmailVerified } from '@/lib/auth-helpers'

describe('allowDangerousEmailAccountLinking safety', () => {
  describe('isGoogleEmailVerified guard', () => {
    it('returns true when email_verified is exactly true', () => {
      expect(isGoogleEmailVerified({ email_verified: true })).toBe(true)
    })

    it('returns false when email_verified is false', () => {
      expect(isGoogleEmailVerified({ email_verified: false })).toBe(false)
    })

    it('returns false when email_verified is undefined', () => {
      expect(isGoogleEmailVerified({ email_verified: undefined })).toBe(false)
    })

    it('returns false when profile is undefined', () => {
      expect(isGoogleEmailVerified(undefined)).toBe(false)
    })

    it('returns false when profile is empty object', () => {
      expect(isGoogleEmailVerified({})).toBe(false)
    })

    it('returns false for truthy non-boolean values (strict check)', () => {
      // These are all truthy but should NOT pass the strict === true check
      expect(isGoogleEmailVerified({ email_verified: 1 } as any)).toBe(false)
      expect(isGoogleEmailVerified({ email_verified: 'true' } as any)).toBe(false)
      expect(isGoogleEmailVerified({ email_verified: 'yes' } as any)).toBe(false)
    })

    it('returns false for null profile', () => {
      expect(isGoogleEmailVerified(null as any)).toBe(false)
    })
  })

  describe('auth.ts config contract', () => {
    /**
     * This test reads the auth.ts source to verify the flag is set.
     * This is a structural/contract test, not a unit test, because NextAuth
     * config construction is hard to unit-test in isolation.
     */
    it('Google provider has allowDangerousEmailAccountLinking enabled', async () => {
      // We verify this by reading the source file — the flag must be present
      const fs = await import('fs')
      const path = await import('path')
      const authSource = fs.readFileSync(
        path.join(process.cwd(), 'src/auth.ts'),
        'utf-8'
      )

      // The flag must be explicitly set to true
      expect(authSource).toContain('allowDangerousEmailAccountLinking: true')
    })

    it('signIn callback checks isGoogleEmailVerified for Google provider', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const authSource = fs.readFileSync(
        path.join(process.cwd(), 'src/auth.ts'),
        'utf-8'
      )

      // The signIn callback must call isGoogleEmailVerified
      expect(authSource).toContain('isGoogleEmailVerified')

      // The signIn callback must check for google provider
      expect(authSource).toContain("account?.provider === \"google\"")
    })

    it('signIn callback blocks unverified Google email with redirect', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const authSource = fs.readFileSync(
        path.join(process.cwd(), 'src/auth.ts'),
        'utf-8'
      )

      // On failure, must redirect to login with error (not silently allow)
      expect(authSource).toContain('EmailNotVerified')
    })

    it('signIn callback checks suspension status for all providers', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const authSource = fs.readFileSync(
        path.join(process.cwd(), 'src/auth.ts'),
        'utf-8'
      )

      // Suspension check must happen after the email verification check
      expect(authSource).toContain('isSuspended')
      expect(authSource).toContain('AccountSuspended')
    })

    it('OAuth tokens are cleared after account linking (minimizes exposure)', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const authSource = fs.readFileSync(
        path.join(process.cwd(), 'src/auth.ts'),
        'utf-8'
      )

      // The linkAccount event should clear tokens
      expect(authSource).toContain('access_token: null')
      expect(authSource).toContain('refresh_token: null')
      expect(authSource).toContain('id_token: null')
    })

    it('session strategy is JWT (not database sessions)', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const authSource = fs.readFileSync(
        path.join(process.cwd(), 'src/auth.ts'),
        'utf-8'
      )

      expect(authSource).toContain('strategy: "jwt"')
    })

    it('session maxAge is hardened to 14 days (not default 30)', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const authSource = fs.readFileSync(
        path.join(process.cwd(), 'src/auth.ts'),
        'utf-8'
      )

      // 14 days = 14 * 24 * 60 * 60
      expect(authSource).toContain('14 * 24 * 60 * 60')
    })
  })
})
