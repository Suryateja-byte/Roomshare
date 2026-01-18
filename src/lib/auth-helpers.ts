/**
 * Authentication helper functions
 * Pure functions for auth validation, easily testable
 */

/**
 * Validates Google OAuth profile has verified email.
 * Returns true only if email_verified === true (not truthy).
 *
 * SECURITY: This is a hard-fail check - we reject any profile where
 * email_verified is not exactly true (false, undefined, or truthy non-boolean).
 */
export function isGoogleEmailVerified(
    profile: { email_verified?: boolean } | undefined
): boolean {
    return profile?.email_verified === true;
}

/** Auth route paths - must match auth.ts pages config */
export const AUTH_ROUTES = {
    signIn: '/login',
} as const;
