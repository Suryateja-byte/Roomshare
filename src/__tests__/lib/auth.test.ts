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

jest.mock("@/lib/auth-helpers", () => ({
  isGoogleEmailVerified: jest.fn().mockReturnValue(true),
  AUTH_ROUTES: { signIn: "/login" },
  normalizeEmail: jest.fn((email: string) => email.toLowerCase().trim()),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  },
  sanitizeErrorMessage: jest.fn((e: unknown) =>
    e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error"
  ),
}));

jest.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
}));

// ── Imports ──

import NextAuth from "next-auth";
import { prisma } from "@/lib/prisma";
import { isGoogleEmailVerified } from "@/lib/auth-helpers";
import { logger } from "@/lib/logger";

// Trigger auth module load (calls mocked NextAuth with real config)
import "@/auth";

// ── Extract callbacks from captured NextAuth config ──

function getAuthConfig() {
  const calls = (NextAuth as unknown as jest.Mock).mock.calls;
  if (!calls.length)
    throw new Error("NextAuth was not called — module load failed");
  return calls[0][0];
}

describe("auth.ts NextAuth configuration", () => {
  let config: any;

  beforeAll(() => {
    config = getAuthConfig();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Session callback ──

  describe("session callback", () => {
    it("clears the authenticated user when token is passwordInvalidated", async () => {
      const session = { user: { id: "user-123" } as any };
      const token = { passwordInvalidated: true };

      const result = await config.callbacks.session({ session, token });

      expect(result.user).toBeUndefined();
    });

    it("enriches session.user with token data", async () => {
      const session = { user: {} as any };
      const token = {
        sub: "user-123",
        emailVerified: new Date("2024-01-01"),
        isAdmin: true,
        isSuspended: false,
        image: "/avatar.jpg",
      };

      const result = await config.callbacks.session({ session, token });

      expect(result.user.id).toBe("user-123");
      expect(result.user.emailVerified).toEqual(new Date("2024-01-01"));
      expect(result.user.isAdmin).toBe(true);
      expect(result.user.isSuspended).toBe(false);
      expect(result.user.image).toBe("/avatar.jpg");
    });

    it("does not set id when token.sub is missing", async () => {
      const session = { user: {} as any };
      const token = { isAdmin: false, isSuspended: false };

      const result = await config.callbacks.session({ session, token });

      expect(result.user.id).toBeUndefined();
    });

    it("does not set image when token.image is missing", async () => {
      const session = { user: {} as any };
      const token = { sub: "user-123", isAdmin: false, isSuspended: false };

      const result = await config.callbacks.session({ session, token });

      expect(result.user.id).toBe("user-123");
      expect(result.user.image).toBeUndefined();
    });

    it("handles null session.user gracefully", async () => {
      const session = { user: null as any };
      const token = { sub: "user-123" };

      // Should not throw
      const result = await config.callbacks.session({ session, token });
      expect(result).toBeDefined();
    });
  });

  // ── JWT callback ──

  describe("jwt callback", () => {
    it("sets initial token values from user on sign-in", async () => {
      const token = {} as any;
      const user = {
        id: "user-123",
        emailVerified: new Date("2024-01-01"),
        isAdmin: true,
        isSuspended: false,
        image: "/img.jpg",
        name: "Test User",
      };

      const result = await config.callbacks.jwt({
        token,
        user,
        trigger: "signIn",
      });

      expect(result.sub).toBe("user-123");
      expect(result.emailVerified).toEqual(new Date("2024-01-01"));
      expect(result.isAdmin).toBe(true);
      expect(result.isSuspended).toBe(false);
      expect(result.image).toBe("/img.jpg");
      expect(result.name).toBe("Test User");
    });

    it("refreshes from DB on signIn trigger", async () => {
      const dbUser = {
        emailVerified: new Date("2024-06-01"),
        isAdmin: false,
        isSuspended: true,
        image: "/new-img.jpg",
        name: "Updated Name",
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(dbUser);

      const token = { sub: "user-123" } as any;
      const result = await config.callbacks.jwt({ token, trigger: "signIn" });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-123" },
        select: {
          emailVerified: true,
          isAdmin: true,
          isSuspended: true,
          image: true,
          name: true,
        },
      });
      expect(result.isSuspended).toBe(true);
      expect(result.name).toBe("Updated Name");
    });

    it("refreshes from DB on update trigger", async () => {
      const dbUser = {
        emailVerified: new Date(),
        isAdmin: false,
        isSuspended: false,
        image: "/updated.jpg",
        name: "Updated",
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(dbUser);

      const token = { sub: "user-456" } as any;
      const result = await config.callbacks.jwt({ token, trigger: "update" });

      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(result.image).toBe("/updated.jpg");
    });

    it("refreshes from DB when account is present (OAuth link)", async () => {
      const dbUser = {
        emailVerified: new Date(),
        isAdmin: false,
        isSuspended: false,
        image: "/oauth.jpg",
        name: "OAuth User",
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(dbUser);

      const token = { sub: "user-789" } as any;
      const account = { provider: "google" };
      const result = await config.callbacks.jwt({ token, account });

      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(result.image).toBe("/oauth.jpg");
    });

    it("does NOT refresh from DB on normal token refresh (no trigger)", async () => {
      const token = { sub: "user-123", isAdmin: false } as any;
      const result = await config.callbacks.jwt({ token });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(result.isAdmin).toBe(false);
    });

    it("invalidates the token immediately when passwordChangedAt is newer than authTime", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        passwordChangedAt: new Date(200 * 1000),
      });

      const token = {
        sub: "user-123",
        authTime: 100,
      } as any;
      const result = await config.callbacks.jwt({ token });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-123" },
        select: { passwordChangedAt: true },
      });
      expect(result.passwordInvalidated).toBe(true);
    });

    it("preserves the token when password revocation lookup errors", async () => {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const token = {
        sub: "user-123",
        authTime: 100,
      } as any;
      const result = await config.callbacks.jwt({ token });

      expect(result.passwordInvalidated).toBeUndefined();
      expect(logger.sync.error).toHaveBeenCalledWith(
        "JWT passwordChangedAt check failed",
        expect.objectContaining({ error: "DB Error" })
      );
    });

    it("keeps existing token values on DB error", async () => {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const token = {
        sub: "user-123",
        isAdmin: true,
        isSuspended: false,
      } as any;
      const result = await config.callbacks.jwt({ token, trigger: "signIn" });

      // Original values preserved
      expect(result.isAdmin).toBe(true);
      expect(result.isSuspended).toBe(false);
      expect(logger.sync.error).toHaveBeenCalledWith(
        "JWT callback DB error",
        expect.objectContaining({ error: "DB Error" })
      );
    });
  });

  // ── signIn callback ──

  describe("signIn callback", () => {
    it("blocks Google OAuth when email is not verified", async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(false);

      const result = await config.callbacks.signIn({
        user: { email: "test@example.com" },
        account: { provider: "google" },
        profile: { email_verified: false },
      });

      expect(result).toBe("/login?error=EmailNotVerified");
    });

    it("allows Google OAuth when email is verified", async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isSuspended: false,
      });

      const result = await config.callbacks.signIn({
        user: { email: "test@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
      });

      expect(result).toBe(true);
    });

    // ── P0-1: account pre-hijacking ──
    //
    // Threat: an attacker registers with the victim's email and never verifies it, so the
    // row carries an attacker-chosen password and emailVerified: null. The victim's first
    // Google sign-in would otherwise be auto-linked onto that row by
    // allowDangerousEmailAccountLinking, leaving the attacker with permanent password
    // access to the victim's account.

    it("revokes the squatted password when Google claims an unverified credential account", async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-squatted",
        email: "victim@example.com",
        isSuspended: false,
        emailVerified: null,
        password: "$2a$12$attacker-chosen-hash",
      });
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await config.callbacks.signIn({
        user: { email: "victim@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
      });

      expect(result).toBe(true);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: "user-squatted",
          emailVerified: null,
          password: { not: null },
        },
        data: {
          password: null,
          passwordChangedAt: expect.any(Date),
          emailVerified: expect.any(Date),
        },
      });
    });

    // ── FL-3: the revoke must not fire on the user's OWN account ──
    //
    // A Google-first user can add a password via forgot-password, which does not require
    // an existing one (forgot-password/route.ts:97-99). Their row then looks exactly like
    // a squat to the check above — emailVerified null (before P0-R2) and password set — so
    // their own password was silently nulled on the next Google sign-in. A row that
    // already carries a linked Google account cannot be a squat: the victim would have had
    // to link it themselves.

    it("does not revoke when the row already has a linked Google account", async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-google-first",
        email: "owner@example.com",
        isSuspended: false,
        emailVerified: null,
        password: "$2a$12$owner-chosen-hash",
      });
      (prisma.account.count as jest.Mock).mockResolvedValue(1);

      const result = await config.callbacks.signIn({
        user: { email: "owner@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
      });

      expect(result).toBe(true);
      expect(prisma.account.count).toHaveBeenCalledWith({
        where: { userId: "user-google-first", provider: "google" },
      });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("still revokes when no Google account is linked yet (positive control)", async () => {
      // Same row shape as above; only the linked-account count differs. Without this
      // control the assertion above could pass because the branch never ran at all.
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-squatted",
        email: "victim@example.com",
        isSuspended: false,
        emailVerified: null,
        password: "$2a$12$attacker-chosen-hash",
      });
      (prisma.account.count as jest.Mock).mockResolvedValue(0);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await config.callbacks.signIn({
        user: { email: "victim@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
      });

      expect(result).toBe(true);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: "user-squatted",
          emailVerified: null,
          password: { not: null },
        },
        data: {
          password: null,
          passwordChangedAt: expect.any(Date),
          emailVerified: expect.any(Date),
        },
      });
    });

    it("blocks the link without mutating when the linked-account lookup fails", async () => {
      // Fail closed: refusing one sign-in is recoverable; nulling a legitimate password
      // or admitting a squat is not.
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-unknown",
        email: "victim@example.com",
        isSuspended: false,
        emailVerified: null,
        password: "$2a$12$some-hash",
      });
      (prisma.account.count as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await config.callbacks.signIn({
        user: { email: "victim@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
      });

      expect(result).toBe("/login?error=OAuthAccountNotLinked");
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("leaves an already-verified account untouched on Google sign-in", async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-legit",
        email: "legit@example.com",
        isSuspended: false,
        emailVerified: new Date("2026-01-01"),
        password: "$2a$12$owner-hash",
      });

      const result = await config.callbacks.signIn({
        user: { email: "legit@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
      });

      expect(result).toBe(true);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("blocks the link without mutating when normalisation disagrees with the raw Google email", async () => {
      // Our lookup normalises; the Prisma adapter's getUserByEmail does not. If they
      // resolve differently we would revoke a password on a row the adapter will not
      // link, locking out an innocent user.
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-other",
        email: "victim@example.com",
        isSuspended: false,
        emailVerified: null,
        password: "$2a$12$some-hash",
      });

      const result = await config.callbacks.signIn({
        user: { email: "Victim@Example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
      });

      expect(result).toBe("/login?error=OAuthAccountNotLinked");
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("blocks the link when the guarded update matches no rows", async () => {
      // A concurrent password reset (or a second Google sign-in) changed the row between
      // our read and the write. Fail closed rather than proceed on a stale read.
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-raced",
        email: "raced@example.com",
        isSuspended: false,
        emailVerified: null,
        password: "$2a$12$some-hash",
      });
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await config.callbacks.signIn({
        user: { email: "raced@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
      });

      expect(result).toBe("/login?error=OAuthAccountNotLinked");
    });

    it("does not revoke a credentials sign-in against an unverified account", async () => {
      // Only the Google path proves control of the address; credentials must not trigger
      // eviction or a legitimate unverified user would lose their own password.
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-unverified",
        email: "unverified@example.com",
        isSuspended: false,
        emailVerified: null,
        password: "$2a$12$owner-hash",
      });

      const result = await config.callbacks.signIn({
        user: { email: "unverified@example.com" },
        account: { provider: "credentials" },
      });

      expect(result).toBe(true);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("blocks suspended users (Google provider)", async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(true);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isSuspended: true,
      });

      const result = await config.callbacks.signIn({
        user: { email: "suspended@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
      });

      expect(result).toBe("/login?error=AccountSuspended");
    });

    it("blocks suspended users (credentials provider)", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isSuspended: true,
      });

      const result = await config.callbacks.signIn({
        user: { email: "suspended@example.com" },
        account: { provider: "credentials" },
      });

      expect(result).toBe("/login?error=AccountSuspended");
    });

    it("allows non-suspended credential users", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isSuspended: false,
      });

      const result = await config.callbacks.signIn({
        user: { email: "active@example.com" },
        account: { provider: "credentials" },
      });

      expect(result).toBe(true);
    });

    it("allows sign-in when user has no email (edge case)", async () => {
      const result = await config.callbacks.signIn({
        user: {},
        account: { provider: "credentials" },
      });

      expect(result).toBe(true);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("logs warning when Google OAuth blocked for unverified email", async () => {
      (isGoogleEmailVerified as jest.Mock).mockReturnValue(false);

      await config.callbacks.signIn({
        user: { email: "test@example.com" },
        account: { provider: "google" },
        profile: { email_verified: false },
      });

      expect(logger.sync.warn).toHaveBeenCalledWith(
        "Google OAuth blocked: email not verified",
        expect.any(Object)
      );
    });
  });

  // ── authorized callback ──

  describe("authorized callback", () => {
    function createAuthArgs(pathname: string, isLoggedIn: boolean) {
      return {
        auth: isLoggedIn ? { user: { id: "user-123" } } : null,
        request: { nextUrl: new URL(`http://localhost${pathname}`) },
      };
    }

    it("allows authenticated users to access /dashboard", () => {
      const result = config.callbacks.authorized(
        createAuthArgs("/dashboard", true)
      );
      expect(result).toBe(true);
    });

    it("blocks unauthenticated users from /dashboard", () => {
      const result = config.callbacks.authorized(
        createAuthArgs("/dashboard", false)
      );
      expect(result).toBe(false);
    });

    it("blocks unauthenticated users from /dashboard/settings", () => {
      const result = config.callbacks.authorized(
        createAuthArgs("/dashboard/settings", false)
      );
      expect(result).toBe(false);
    });

    it("redirects authenticated users away from /login", () => {
      // Response.redirect throws in whatwg-fetch polyfill; verify intent
      try {
        const result = config.callbacks.authorized(
          createAuthArgs("/login", true)
        );
        // If polyfill works, result is a Response redirect
        expect(result).toBeInstanceOf(Response);
      } catch (e: any) {
        // whatwg-fetch polyfill throws RangeError for redirect — the callback
        // reached Response.redirect which confirms the redirect intent
        expect(e.message).toContain("Invalid status code");
      }
    });

    it("redirects authenticated users away from /signup", () => {
      try {
        const result = config.callbacks.authorized(
          createAuthArgs("/signup", true)
        );
        expect(result).toBeInstanceOf(Response);
      } catch (e: any) {
        expect(e.message).toContain("Invalid status code");
      }
    });

    it("allows unauthenticated users to access /login", () => {
      const result = config.callbacks.authorized(
        createAuthArgs("/login", false)
      );
      expect(result).toBe(true);
    });

    it("allows all users to access non-protected routes", () => {
      expect(
        config.callbacks.authorized(createAuthArgs("/listings/123", true))
      ).toBe(true);
      expect(
        config.callbacks.authorized(createAuthArgs("/listings/123", false))
      ).toBe(true);
      expect(config.callbacks.authorized(createAuthArgs("/", true))).toBe(true);
      expect(config.callbacks.authorized(createAuthArgs("/", false))).toBe(
        true
      );
    });
  });

  // ── linkAccount event ──

  describe("linkAccount event", () => {
    it("clears OAuth tokens after account link (security hardening)", async () => {
      (prisma.account.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await config.events.linkAccount({
        user: { id: "user-123" },
        account: { provider: "google", providerAccountId: "goog-456" },
      });

      expect(prisma.account.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "user-123",
          provider: "google",
          providerAccountId: "goog-456",
        },
        data: {
          access_token: null,
          refresh_token: null,
          id_token: null,
        },
      });
    });

    // ── P0-R2 (supersedes the original P0-1b tests) ──
    //
    // The first P0-1b fix read `email_verified` off THIS event's `profile`. It could
    // never work: @auth/core passes linkAccount the NORMALIZED profile — Google declares
    // no custom profile(), so defaultProfile (lib/utils/providers.js:78-84) returns only
    // {id, name, email, image} and the OIDC claim is stripped before the event fires.
    // isGoogleEmailVerified therefore always saw undefined, the write never ran, and every
    // Google account stayed permanently unverified — blocked from messaging, reviewing and
    // reporting. The old tests passed only because the module mock at the top of this file
    // returns true unconditionally, which is exactly what hid the defect.
    //
    // The claim IS asserted, one step earlier: the signIn callback hard-returns
    // /login?error=EmailNotVerified for any Google profile without email_verified === true,
    // and @auth/core runs handleAuthorized (callback/index.js:63) BEFORE
    // handleLoginOrRegister (:70), which is what links and emits this event. Reaching here
    // with provider "google" IS the proof. The two signIn tests above ("blocks Google OAuth
    // when email is not verified" / "allows Google OAuth when email is verified") pin that
    // gate — do not delete them, this event depends on them.
    //
    // jest.setup.js spreads one shared mockPrismaModel into every model, so
    // prisma.user.updateMany and prisma.account.updateMany are the SAME jest.fn(); the
    // token-clearing write lands on it too. Assert on call shape, never on call count.

    /** Only the writes that actually set emailVerified. */
    function emailVerifiedWrites() {
      return (prisma.user.updateMany as jest.Mock).mock.calls.filter(
        ([args]) => args?.data?.emailVerified !== undefined
      );
    }

    /** Give the helper its real semantics; the default mock returns true always. */
    function useRealClaimSemantics() {
      (isGoogleEmailVerified as jest.Mock).mockImplementation(
        (p?: { email_verified?: boolean }) => p?.email_verified === true
      );
    }

    it("marks the email verified from the normalized profile @auth/core actually passes", async () => {
      useRealClaimSemantics();
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await config.events.linkAccount({
        user: { id: "user-google" },
        account: { provider: "google", providerAccountId: "goog-1" },
        // Exactly what defaultProfile produces — note the absence of email_verified.
        profile: {
          id: "goog-1",
          name: "Ada",
          email: "ada@example.com",
          image: null,
        },
      });

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: "user-google", emailVerified: null },
        data: { emailVerified: expect.any(Date) },
      });
    });

    it("does not consult the email_verified claim, which is unreadable here", async () => {
      useRealClaimSemantics();
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await config.events.linkAccount({
        user: { id: "user-google" },
        account: { provider: "google", providerAccountId: "goog-1" },
        profile: { id: "goog-1", email: "ada@example.com" },
      });

      expect(isGoogleEmailVerified).not.toHaveBeenCalled();
      expect(emailVerifiedWrites()).toHaveLength(1);
    });

    it("leaves an already-verified row untouched via the where guard", async () => {
      useRealClaimSemantics();
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await config.events.linkAccount({
        user: { id: "user-google" },
        account: { provider: "google", providerAccountId: "goog-1" },
        profile: { id: "goog-1", email: "ada@example.com" },
      });

      // The guard lives in the query, so assert the query carries it.
      expect(emailVerifiedWrites()[0][0].where).toEqual({
        id: "user-google",
        emailVerified: null,
      });
    });

    it("does not touch emailVerified for a non-Google provider", async () => {
      useRealClaimSemantics();

      await config.events.linkAccount({
        user: { id: "user-other" },
        account: { provider: "github", providerAccountId: "gh-1" },
        profile: { id: "gh-1", email: "ada@example.com" },
      });

      expect(emailVerifiedWrites()).toHaveLength(0);
    });

    it("does not throw when the emailVerified write fails", async () => {
      useRealClaimSemantics();
      (prisma.user.updateMany as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      await expect(
        config.events.linkAccount({
          user: { id: "user-google" },
          account: { provider: "google", providerAccountId: "goog-1" },
          profile: { id: "goog-1", email: "ada@example.com" },
        })
      ).resolves.toBeUndefined();

      expect(logger.sync.warn).toHaveBeenCalledWith(
        "Failed to mark Google email as verified",
        expect.objectContaining({ userId: "user-google" })
      );
    });

    it("logs OAuth account link event", async () => {
      (prisma.account.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await config.events.linkAccount({
        user: { id: "user-123" },
        account: { provider: "google", providerAccountId: "goog-456" },
      });

      expect(logger.sync.info).toHaveBeenCalledWith(
        "OAuth account linked",
        expect.objectContaining({ userId: "user-123", provider: "google" })
      );
    });

    it("handles token clearing failure gracefully", async () => {
      (prisma.account.updateMany as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      // Should not throw
      await config.events.linkAccount({
        user: { id: "user-123" },
        account: { provider: "google", providerAccountId: "goog-456" },
      });

      expect(logger.sync.warn).toHaveBeenCalledWith(
        "Failed to clear OAuth tokens after link",
        expect.objectContaining({ userId: "user-123", provider: "google" })
      );
    });
  });

  // ── Session config (security) ──

  describe("session configuration", () => {
    it("uses JWT strategy", () => {
      expect(config.session.strategy).toBe("jwt");
    });

    it("has maxAge of 14 days", () => {
      expect(config.session.maxAge).toBe(14 * 24 * 60 * 60);
    });

    it("has updateAge of 1 day", () => {
      expect(config.session.updateAge).toBe(24 * 60 * 60);
    });
  });

  // ── Pages config ──

  describe("pages configuration", () => {
    it("uses /login as sign-in page", () => {
      expect(config.pages.signIn).toBe("/login");
    });

    it("uses /login as error page", () => {
      expect(config.pages.error).toBe("/login");
    });
  });
});
