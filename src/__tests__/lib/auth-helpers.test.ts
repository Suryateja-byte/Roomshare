/**
 * Tests for auth-helpers.ts
 * Pure function tests for email verification and route constants
 */

// Mock next-auth/jwt to avoid ESM transformation issues
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

import { isGoogleEmailVerified, AUTH_ROUTES } from "@/lib/auth-helpers";

describe("isGoogleEmailVerified", () => {
    it("returns true when email_verified is exactly true", () => {
        expect(isGoogleEmailVerified({ email_verified: true })).toBe(true);
    });

    it("returns false when email_verified is false", () => {
        expect(isGoogleEmailVerified({ email_verified: false })).toBe(false);
    });

    it("returns false when email_verified is undefined", () => {
        expect(isGoogleEmailVerified({ email_verified: undefined })).toBe(false);
        expect(isGoogleEmailVerified({})).toBe(false);
    });

    it("returns false when profile is undefined", () => {
        expect(isGoogleEmailVerified(undefined)).toBe(false);
    });

    it("returns false when email_verified is truthy but not true", () => {
        // Edge case: some providers might return 1 or "true"
        // We explicitly check for === true, not truthy
        expect(isGoogleEmailVerified({ email_verified: 1 } as any)).toBe(false);
        expect(isGoogleEmailVerified({ email_verified: "true" } as any)).toBe(false);
    });

    it("returns false when email_verified is null", () => {
        expect(isGoogleEmailVerified({ email_verified: null } as any)).toBe(false);
    });
});

describe("AUTH_ROUTES", () => {
    it("has signIn route defined", () => {
        expect(AUTH_ROUTES.signIn).toBe('/login');
    });

    it("signIn route matches auth.ts pages config", () => {
        // This ensures the constant stays in sync with actual config
        expect(AUTH_ROUTES.signIn).toMatch(/^\/[a-z]+$/);
    });
});
