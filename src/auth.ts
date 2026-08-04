import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import {
  isGoogleEmailVerified,
  AUTH_ROUTES,
  normalizeEmail,
} from "@/lib/auth-helpers";
import { isPrivatePagePath } from "@/lib/auth-route-policy";
import { getPasswordRevocationState } from "@/lib/password-revocation";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";

async function getUser(email: string) {
  try {
    // Defense-in-depth: select only fields needed for credential auth + session seeding.
    // Avoids loading every column (e.g. notificationPreferences, bio) into memory.
    const user = await prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: {
        id: true,
        email: true,
        name: true,
        password: true, // needed for bcrypt.compare in authorize()
        emailVerified: true,
        isAdmin: true,
        isSuspended: true,
        image: true,
      },
    });
    return user;
  } catch (error) {
    logger.sync.error("Failed to fetch user", {
      error: sanitizeErrorMessage(error),
    });
    throw new Error("Failed to fetch user.");
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: "/api/auth",
  debug: process.env.NODE_ENV === "development",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PrismaAdapter return type doesn't match NextAuth Adapter exactly
  adapter: PrismaAdapter(prisma) as any,
  pages: {
    signIn: AUTH_ROUTES.signIn,
    error: AUTH_ROUTES.signIn, // Redirect OAuth errors to login page with error params
  },
  session: {
    strategy: "jwt",
    maxAge: 14 * 24 * 60 * 60, // 14 days (security hardening from 30 days)
    updateAge: 24 * 60 * 60, // Refresh token once per day
  },
  // Audit logging for security-sensitive events
  events: {
    // `profile` is deliberately not destructured: it is the normalized profile here, not
    // the OIDC claims, and reading email_verified off it is the P0-R2 defect. See below.
    async linkAccount({ user, account }) {
      // Log when OAuth account is linked to existing user (for audit trail)
      // Never log providerAccountId (PII)
      logger.sync.info("OAuth account linked", {
        userId: user.id,
        provider: account.provider,
      });

      // P0-R2: @auth/core hardcodes createUser({ ...profile, emailVerified: null })
      // (handle-login.js:260), and the only other writer of emailVerified is the emailed
      // verification token — which a Google user never receives. Without this, every
      // Google-only account stays permanently unverified and is blocked from messaging,
      // reviewing and reporting.
      //
      // Do NOT gate this on `profile.email_verified`. This event receives the NORMALIZED
      // profile: Google declares no custom profile(), so @auth/core's defaultProfile
      // (lib/utils/providers.js:78-84) returns only {id, name, email, image} and strips the
      // OIDC claim before the event fires. The first version of this fix checked it here
      // and was therefore dead code — the write never ran once in production.
      //
      // The claim is asserted one step earlier instead: the signIn callback below hard-
      // returns `${AUTH_ROUTES.signIn}?error=EmailNotVerified` for any Google profile
      // without email_verified === true, and @auth/core runs handleAuthorized
      // (callback/index.js:63) BEFORE handleLoginOrRegister (:70) — which is what links the
      // account and emits this event. Reaching here with provider "google" IS the proof.
      if (account.provider === "google") {
        try {
          await prisma.user.updateMany({
            where: { id: user.id, emailVerified: null },
            data: { emailVerified: new Date() },
          });
        } catch (error) {
          logger.sync.warn("Failed to mark Google email as verified", {
            userId: user.id,
            error: sanitizeErrorMessage(error),
          });
        }
      }

      // Minimize token retention: this app does not call provider APIs after sign-in.
      // Clearing OAuth tokens reduces impact if database records are exposed.
      try {
        await prisma.account.updateMany({
          where: {
            userId: user.id,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
          data: {
            access_token: null,
            refresh_token: null,
            id_token: null,
          },
        });
      } catch (error) {
        logger.sync.warn("Failed to clear OAuth tokens after link", {
          userId: user.id,
          provider: account.provider,
          error: sanitizeErrorMessage(error),
        });
      }
    },
  },
  // Note: In NextAuth v5 (Auth.js), account linking is handled by the adapter
  // The Prisma adapter will auto-link accounts when email matches
  callbacks: {
    async session({ session, token }) {
      // H-1: Force logout if password was changed after session creation
      if (token.passwordInvalidated) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { ...session, user: undefined } as any;
      }

      if (token.sub && session.user) {
        session.user.id = token.sub;
        session.user.emailVerified = token.emailVerified as Date | null;
        session.user.isAdmin = token.isAdmin as boolean;
        session.user.isSuspended = token.isSuspended as boolean;
        // Include image from token (refreshed from DB on each request)
        if (token.image) {
          session.user.image = token.image as string;
        }
        // P0-5 FIX: Forward authTime to session for freshness checks
        session.authTime = token.authTime as number | undefined;
      }
      return session;
    },
    async jwt({ token, user, account, trigger }) {
      // Only set initial values when user signs in
      if (user) {
        token.sub = user.id;
        token.emailVerified = user.emailVerified;
        token.isAdmin = user.isAdmin;
        token.isSuspended = user.isSuspended;
        token.image = user.image;
        token.name = user.name;
        // P0-5 FIX: Track actual authentication time (NOT token refresh time)
        // Set ONLY on initial sign-in, never updated during refreshes
        token.authTime = Math.floor(Date.now() / 1000);
      }

      // Refresh from DB on sign-in, explicit update, or first OAuth link
      // This ensures fresh user data after account switching
      if (trigger === "signIn" || trigger === "update" || account) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub as string },
            select: {
              emailVerified: true,
              isAdmin: true,
              isSuspended: true,
              image: true,
              name: true,
            },
          });
          if (dbUser) {
            token.emailVerified = dbUser.emailVerified;
            token.isAdmin = dbUser.isAdmin;
            token.isSuspended = dbUser.isSuspended;
            token.image = dbUser.image;
            token.name = dbUser.name;
          }
        } catch (error) {
          logger.sync.error("JWT callback DB error", {
            error: sanitizeErrorMessage(error),
          });
          // Don't invalidate session on DB errors - keep existing token values
        }
      }

      const authTime =
        typeof token.authTime === "number" ? token.authTime : undefined;
      const userId = typeof token.sub === "string" ? token.sub : undefined;

      // Check every authenticated JWT round-trip so password changes revoke
      // stale sessions immediately while DB lookup failures remain fail-open.
      if (authTime && userId && !token.passwordInvalidated) {
        const revocationCheck = await getPasswordRevocationState(
          userId,
          authTime
        );

        if (revocationCheck.state === "revoked") {
          token.passwordInvalidated = true;
          return token;
        }

        if (revocationCheck.state === "unknown") {
          logger.sync.error("JWT passwordChangedAt check failed", {
            error:
              revocationCheck.error || "Password revocation state unavailable",
          });
        }
      }

      return token;
    },
    async signIn({ user, account, profile }) {
      // HARD-FAIL: Block Google OAuth if email not verified
      // This is critical for allowDangerousEmailAccountLinking safety
      if (account?.provider === "google") {
        if (!isGoogleEmailVerified(profile as { email_verified?: boolean })) {
          logger.sync.warn("Google OAuth blocked: email not verified", {
            email: user?.email ? user.email.substring(0, 3) + "***" : "unknown",
            email_verified: (profile as { email_verified?: boolean })
              ?.email_verified,
          });
          return `${AUTH_ROUTES.signIn}?error=EmailNotVerified`;
        }
      }

      // Check suspension status for ALL providers (credentials and OAuth)
      // Always check database to ensure we have the latest suspension status
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: normalizeEmail(user.email) },
          select: {
            id: true,
            email: true,
            isSuspended: true,
            emailVerified: true,
            password: true,
          },
        });

        if (dbUser?.isSuspended) {
          return "/login?error=AccountSuspended";
        }

        // P0-1: account pre-hijacking defence.
        //
        // allowDangerousEmailAccountLinking lets the adapter bind this Google identity to
        // ANY existing row with a matching email. An attacker can create that row first by
        // registering with the victim's address and never verifying it — /api/register
        // accepts a caller-chosen password and writes emailVerified: null. The victim's
        // first real Google sign-in would then land on the attacker's row, and the
        // attacker's password would keep working against the victim's account forever.
        //
        // Google has just proven control of this address, so the unverified password on
        // that row cannot belong to its rightful owner. Revoke it before the link.
        // passwordChangedAt is what evicts the attacker: getPasswordRevocationState
        // compares it against the JWT's authTime on every round-trip, so their existing
        // sessions stop resolving. Note that check is fail-open on DB error, and eviction
        // lands on the attacker's next request rather than instantly.
        //
        // This runs BEFORE the link: @auth/core calls handleAuthorized (this callback) at
        // callback/index.js:63, and handleLoginOrRegister (which links) only at :70.
        if (
          account?.provider === "google" &&
          dbUser &&
          dbUser.emailVerified === null &&
          dbUser.password !== null
        ) {
          // The adapter's getUserByEmail does NOT normalise, so it will look this row up
          // by the raw Google address. If our normalised lookup found a row the adapter
          // would not, revoking its password would lock out an innocent user for nothing.
          if (dbUser.email !== user.email) {
            logger.sync.error("Google link blocked: email normalisation mismatch", {
              userId: dbUser.id,
            });
            return `${AUTH_ROUTES.signIn}?error=OAuthAccountNotLinked`;
          }

          // FL-3: a row that ALREADY carries a linked Google account cannot be a squat —
          // the rightful owner would have had to link it themselves. Without this
          // discriminator, a Google-first user who later adds a password via
          // forgot-password (which does not require an existing one, see
          // forgot-password/route.ts:97-99) looks identical to a squat, and has that
          // password silently nulled on their next Google sign-in.
          let linkedGoogleAccounts: number;
          try {
            linkedGoogleAccounts = await prisma.account.count({
              where: { userId: dbUser.id, provider: "google" },
            });
          } catch (error) {
            // Fail closed WITHOUT mutating. Refusing one sign-in is recoverable; nulling a
            // legitimate password, or admitting a squat, is not.
            logger.sync.error("Google link blocked: linked-account lookup failed", {
              userId: dbUser.id,
              error: sanitizeErrorMessage(error),
            });
            return `${AUTH_ROUTES.signIn}?error=OAuthAccountNotLinked`;
          }

          if (linkedGoogleAccounts > 0) {
            // Returning user who added a password to their own Google account. The
            // remainder of this callback is just `return true`.
            return true;
          }

          // Guarded update, not a blind one: re-assert the preconditions in the WHERE so
          // this is atomic against a concurrent password reset by the squatter. A second
          // concurrent Google sign-in simply matches 0 rows and no-ops.
          const evicted = await prisma.user.updateMany({
            where: {
              id: dbUser.id,
              emailVerified: null,
              password: { not: null },
            },
            data: {
              password: null,
              passwordChangedAt: new Date(),
              // Google asserted email_verified above, so control is proven.
              emailVerified: new Date(),
            },
          });

          if (evicted.count !== 1) {
            logger.sync.error("Google link blocked: account state changed mid-sign-in", {
              userId: dbUser.id,
            });
            return `${AUTH_ROUTES.signIn}?error=OAuthAccountNotLinked`;
          }

          // High severity: the victim is about to inherit whatever this row already
          // contains (listings, profile, saved searches) from whoever created it.
          logger.sync.error("Unverified password account claimed via Google sign-in", {
            userId: dbUser.id,
            provider: account.provider,
          });
        }
      }

      return true;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;
      const isAdmin = !!auth?.user?.isAdmin;
      const isSuspended = auth?.user?.isSuspended === true;

      const isProtected = isPrivatePagePath(pathname);
      const isAdminRoute = pathname.startsWith("/admin");
      const isOnAuth =
        pathname.startsWith("/login") || pathname.startsWith("/signup");

      if (isAdminRoute) {
        if (!isLoggedIn) return false;
        if (!isAdmin || isSuspended)
          return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      if (isProtected) {
        if (!isLoggedIn) return false;
        if (isSuspended) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      if (isLoggedIn && isOnAuth) {
        return Response.redirect(new URL("/", nextUrl));
      }
      return true;
    },
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Enable account linking for users who registered with password then try Google OAuth
      // SAFE: email_verified === true is enforced in signIn callback above
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      async authorize(credentials, request) {
        const parsedCredentials = z
          .object({
            email: z.string().email(),
            password: z.string().min(12),
            turnstileToken: z.string().optional(),
          })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { password } = parsedCredentials.data;
          // Normalize email BEFORE rate limit to prevent casing bypass
          const email = normalizeEmail(parsedCredentials.data.email);

          // P0-1 FIX: Rate limit before Turnstile (which has a kill-switch)
          try {
            const emailRl = await checkRateLimit(
              email,
              "loginByEmail",
              RATE_LIMITS.login
            );
            if (!emailRl.success) {
              logger.sync.warn("Login rate limited (email)");
              return null;
            }
            const ip = getClientIP(request);
            const ipRl = await checkRateLimit(
              ip,
              "loginByIp",
              RATE_LIMITS.loginByIp
            );
            if (!ipRl.success) {
              logger.sync.warn("Login rate limited (IP)");
              return null;
            }
          } catch {
            logger.sync.error("Login rate limit check failed, failing closed");
            return null;
          }

          // Verify Turnstile token before any DB lookup
          const turnstileResult = await verifyTurnstileToken(
            parsedCredentials.data.turnstileToken
          );
          if (!turnstileResult.success) {
            logger.sync.warn("Turnstile verification failed on login");
            return null;
          }

          const user = await getUser(email);
          if (!user) return null;
          if (!user.password) return null;

          const passwordsMatch = await bcrypt.compare(password, user.password);
          if (passwordsMatch) return user;
        }

        logger.sync.warn("Invalid credentials attempt");
        return null;
      },
    }),
  ],
});
