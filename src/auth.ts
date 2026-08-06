import NextAuth, { customFetch } from "next-auth";
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

/**
 * Google's OpenID discovery document advertises RFC 9207 issuer identification
 * (`authorization_response_iss_parameter_supported: true`). oauth4webapi@3.x — pulled
 * in by the next-auth beta.31 bump — therefore hard-requires an `iss` query parameter on
 * the OAuth callback. Google's callback in this deployment arrives without it, which
 * surfaces as `CallbackRouteError` → `/login?error=Configuration` and blocks ALL Google
 * sign-in. Strip the advertised support from the discovery response so Auth.js does not
 * require `iss`. PKCE and the `signIn` callback checks still protect the flow; this
 * restores the behavior that worked before the dependency bump.
 */
const googleDiscoveryFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url.includes("/.well-known/openid-configuration")) {
    return response;
  }
  try {
    const metadata = await response.clone().json();
    delete metadata.authorization_response_iss_parameter_supported;
    return Response.json(metadata, { status: response.status });
  } catch {
    return response;
  }
};

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
    // `profile` here is the NORMALIZED profile, not the OIDC claims. `email_verified` is
    // stripped from it — reading that was the P0-R2 defect — but `email` survives, and it
    // is load-bearing for the P0-V1 ownership check below.
    async linkAccount({ user, account, profile }) {
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
      // account and emits this event. So reaching here with provider "google" proves the
      // claim for `profile.email` — and for that address ONLY, which is why the ownership
      // check below exists.
      if (account.provider === "google") {
        // P0-V1: the claim above proves Google controls the address in `profile.email`. It
        // says NOTHING about `user.id`, which @auth/core sets to whatever row the CURRENT
        // SESSION resolves to (handle-login.js:206-212 links to the signed-in user with no
        // email comparison of its own). Without the comparison below, a squatter signed in
        // on an unverified row they registered for the victim can link their OWN Google
        // account and have it stamp emailVerified on the victim's address — forging the
        // trust signal and disarming the P0-1 revoke precondition in one move.
        //
        // `profile.email` IS readable here. defaultProfile (lib/utils/providers.js:78-84)
        // keeps {id, name, email, image}; only `email_verified` is stripped. Note that
        // `profile.id` is crypto.randomUUID() (oauth/callback.js:224), NOT the Google sub —
        // do not reach for it to correlate with providerAccountId.
        const linkedEmail = profile?.email;
        const emailsMatch =
          typeof linkedEmail === "string" &&
          typeof user.email === "string" &&
          normalizeEmail(linkedEmail) === normalizeEmail(user.email);

        if (emailsMatch) {
          try {
            // The email is compared above, not in the WHERE: @auth/core lowercases the
            // profile before anyone sees it (oauth/callback.js:225), so a normalized WHERE
            // would be redundant — and would silently match zero rows, reinstating the
            // P0-R2 "no Google user is ever verified" defect, if a stored address ever
            // diverged from that form.
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
        } else {
          // Undo the adapter's link. `linkAccount` is a bare account.create that is already
          // committed, so this is a separate statement in a separate transaction and CANNOT
          // be best-effort: a surviving mislink lets that Google identity sign straight into
          // this row with no password and no session cookie (handle-login.js:190-198).
          // deleteMany is idempotent and matches at most one row —
          // @@unique([provider, providerAccountId]) — and that row is necessarily the one
          // just created, since a pre-existing one would have been caught by
          // getUserByAccount before the link.
          logger.sync.error("Google link mismatch: profile email is not this account's", {
            userId: user.id,
            provider: account.provider,
          });

          try {
            const removed = await prisma.account.deleteMany({
              where: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            });

            if (removed.count !== 1) {
              logger.sync.error(
                "Google link mismatch: mislinked account row not removed",
                { userId: user.id, provider: account.provider, removed: removed.count }
              );
            }
          } catch (error) {
            logger.sync.error(
              "Google link mismatch: mislinked account row not removed",
              {
                userId: user.id,
                provider: account.provider,
                error: sanitizeErrorMessage(error),
              }
            );
          }
          // Deliberately no early return: fall through to the token scrub below so that if
          // the undo failed, the tokens on that row are still cleared.
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

        // P0-V1 containment. When this Google identity is already linked, @auth/core
        // resolves `user` from the Account row (getUserByAccount, callback/index.js:58-67),
        // so `user.email` is THIS ROW's address while `profile.email` is the address Google
        // just proved control of. A mismatch means the link is not ours to trust — one the
        // linkAccount undo failed to remove, or one predating that guard — and
        // authenticating would hand the caller someone else's account with no password at
        // all (handle-login.js:190-198 mints a session for userByAccount).
        //
        // This CANNOT stop a mislink from being created: on that request the account is not
        // linked yet, so `user` is the Google profile itself and the comparison is
        // self-versus-self. Prevention lives in the linkAccount event.
        //
        // Known false positive: a user whose Google-side email changed is blocked from here
        // on. `sub` is stable, so they sign in fine today, and a Google-only row has no
        // password to fall back on — forgot-password mails the row's OLD address. Recovery
        // is admin-side (drop the stale Account row, or correct User.email). Fail-closed is
        // the right default while this is pre-launch; revisit before real users exist.
        if (account?.provider === "google") {
          const claimedEmail = (profile as { email?: string } | undefined)?.email;

          if (
            typeof claimedEmail !== "string" ||
            normalizeEmail(claimedEmail) !== normalizeEmail(user.email)
          ) {
            logger.sync.error("Google sign-in blocked: possible residual mislink", {
              userId: dbUser?.id,
            });
            return `${AUTH_ROUTES.signIn}?error=OAuthAccountNotLinked`;
          }
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

          // FL-3: a row that already carries THIS Google identity cannot be a squat — the
          // rightful owner linked it themselves. Without the discriminator, a Google-first
          // user who later adds a password via forgot-password (which does not require an
          // existing one, see forgot-password/route.ts:97-99) looks identical to a squat and
          // has that password silently nulled on their next Google sign-in.
          //
          // P0-V1: it must be keyed on providerAccountId, not on "any linked google
          // account". A squatter can link their OWN Google account to the row they created
          // for the victim, and a broad count then reads as "not a squat" — leaving their
          // password alive through the victim's sign-in. A sub is unforgeable; the victim's
          // is theirs alone. This is also what closes the window between the adapter's
          // committed INSERT and the undo in the linkAccount event: a concurrent victim
          // sign-in reading a broad count would see 1 and skip the eviction.
          //
          // Guard the value explicitly — Prisma DROPS an `undefined` filter instead of
          // matching nothing, which would silently restore the broad, forgeable count. Fail
          // closed by refusing the sign-in, never by falling through to the eviction.
          if (
            typeof account.providerAccountId !== "string" ||
            account.providerAccountId.length === 0
          ) {
            logger.sync.error("Google link blocked: missing providerAccountId", {
              userId: dbUser.id,
            });
            return `${AUTH_ROUTES.signIn}?error=OAuthAccountNotLinked`;
          }

          let linkedGoogleAccounts: number;
          try {
            linkedGoogleAccounts = await prisma.account.count({
              where: {
                userId: dbUser.id,
                provider: "google",
                providerAccountId: account.providerAccountId,
              },
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
      // Drop RFC 9207 `iss` enforcement for Google (see googleDiscoveryFetch above).
      [customFetch]: googleDiscoveryFetch,
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
