/**
 * Normalize email to lowercase and trimmed for consistent lookups.
 * Prevents case-variant duplicate accounts and login/reset mismatches.
 *
 * Extracted to standalone module to avoid pulling in next-auth/jwt
 * dependency chain in routes that only need email normalization.
 */
export function normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
}
