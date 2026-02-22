import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { logger, sanitizeErrorMessage } from "@/lib/logger"
import { isGoogleEmailVerified, AUTH_ROUTES, normalizeEmail } from "@/lib/auth-helpers"
import { verifyTurnstileToken } from "@/lib/turnstile"

async function getUser(email: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { email: normalizeEmail(email) },
        })
        return user
    } catch (error) {
        logger.sync.error("Failed to fetch user", { error: sanitizeErrorMessage(error) })
        throw new Error("Failed to fetch user.")
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma) as any,
    pages: {
        signIn: AUTH_ROUTES.signIn,
        error: AUTH_ROUTES.signIn, // Redirect OAuth errors to login page with error params
    },
    session: {
        strategy: "jwt",
        maxAge: 14 * 24 * 60 * 60, // 14 days (security hardening from 30 days)
        updateAge: 24 * 60 * 60,   // Refresh token once per day
    },
    // Audit logging for security-sensitive events
    events: {
        async linkAccount({ user, account }) {
            // Log when OAuth account is linked to existing user (for audit trail)
            // Never log providerAccountId (PII)
            logger.sync.info("OAuth account linked", {
                userId: user.id,
                provider: account.provider,
            });

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
            if (token.sub && session.user) {
                session.user.id = token.sub
                session.user.emailVerified = token.emailVerified as Date | null
                session.user.isAdmin = token.isAdmin as boolean
                session.user.isSuspended = token.isSuspended as boolean
                // Include image from token (refreshed from DB on each request)
                if (token.image) {
                    session.user.image = token.image as string
                }
            }
            return session
        },
        async jwt({ token, user, account, trigger }) {
            // Only set initial values when user signs in
            if (user) {
                token.sub = user.id
                token.emailVerified = user.emailVerified
                token.isAdmin = user.isAdmin
                token.isSuspended = user.isSuspended
                token.image = user.image
                token.name = user.name
            }

            // Refresh from DB on sign-in, explicit update, or first OAuth link
            // This ensures fresh user data after account switching
            if (trigger === "signIn" || trigger === "update" || account) {
                try {
                    const dbUser = await prisma.user.findUnique({
                        where: { id: token.sub as string },
                        select: { emailVerified: true, isAdmin: true, isSuspended: true, image: true, name: true }
                    })
                    if (dbUser) {
                        token.emailVerified = dbUser.emailVerified
                        token.isAdmin = dbUser.isAdmin
                        token.isSuspended = dbUser.isSuspended
                        token.image = dbUser.image
                        token.name = dbUser.name
                    }
                } catch (error) {
                    logger.sync.error("JWT callback DB error", { error: sanitizeErrorMessage(error) })
                    // Don't invalidate session on DB errors - keep existing token values
                }
            }
            return token
        },
        async signIn({ user, account, profile }) {
            // HARD-FAIL: Block Google OAuth if email not verified
            // This is critical for allowDangerousEmailAccountLinking safety
            if (account?.provider === "google") {
                if (!isGoogleEmailVerified(profile as { email_verified?: boolean })) {
                    logger.sync.warn("Google OAuth blocked: email not verified", {
                        email: user?.email ? user.email.substring(0, 3) + "***" : "unknown",
                        email_verified: (profile as { email_verified?: boolean })?.email_verified,
                    });
                    return `${AUTH_ROUTES.signIn}?error=EmailNotVerified`;
                }
            }

            // Check suspension status for ALL providers (credentials and OAuth)
            // Always check database to ensure we have the latest suspension status
            if (user?.email) {
                const dbUser = await prisma.user.findUnique({
                    where: { email: normalizeEmail(user.email) },
                    select: { isSuspended: true }
                });

                if (dbUser?.isSuspended) {
                    return '/login?error=AccountSuspended';
                }
            }

            return true;
        },
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
            const isOnAuth = nextUrl.pathname.startsWith('/login') || nextUrl.pathname.startsWith('/signup');

            if (isOnDashboard) {
                if (isLoggedIn) return true;
                return false; // Redirect unauthenticated users to login page
            } else if (isLoggedIn && isOnAuth) {
                return Response.redirect(new URL('/', nextUrl));
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
            async authorize(credentials) {
                const parsedCredentials = z
                    .object({
                        email: z.string().email(),
                        password: z.string().min(12),
                        turnstileToken: z.string().optional(),
                    })
                    .safeParse(credentials)

                if (parsedCredentials.success) {
                    // Verify Turnstile token before any DB lookup
                    const turnstileResult = await verifyTurnstileToken(
                        parsedCredentials.data.turnstileToken
                    )
                    if (!turnstileResult.success) {
                        logger.sync.warn("Turnstile verification failed on login")
                        return null
                    }

                    const { password } = parsedCredentials.data
                    const email = normalizeEmail(parsedCredentials.data.email)
                    const user = await getUser(email)
                    if (!user) return null
                    if (!user.password) return null

                    const passwordsMatch = await bcrypt.compare(password, user.password)
                    if (passwordsMatch) return user
                }

                logger.sync.warn("Invalid credentials attempt")
                return null
            },
        }),
    ],
})
