import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { logger } from "@/lib/logger"

async function getUser(email: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { email },
        })
        return user
    } catch (error) {
        logger.sync.error("Failed to fetch user", { error: error instanceof Error ? error.message : String(error) })
        throw new Error("Failed to fetch user.")
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma) as any,
    pages: {
        signIn: '/login',
        error: '/login', // Redirect OAuth errors to login page with error params
    },
    session: {
        strategy: "jwt",
        maxAge: 14 * 24 * 60 * 60, // 14 days (security hardening from 30 days)
        updateAge: 24 * 60 * 60,   // Refresh token once per day
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
                    logger.sync.error("JWT callback DB error", { error: error instanceof Error ? error.message : String(error) })
                    // Don't invalidate session on DB errors - keep existing token values
                }
            }
            return token
        },
        async signIn({ user, account, profile }) {
            // Check Google email verification
            if (account?.provider === "google") {
                const googleProfile = profile as { email_verified?: boolean }
                if (!googleProfile?.email_verified) {
                    return '/login?error=EmailNotVerified'
                }
            }

            // Check suspension status for ALL providers (credentials and OAuth)
            // Always check database to ensure we have the latest suspension status
            if (user?.email) {
                const dbUser = await prisma.user.findUnique({
                    where: { email: user.email },
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
        }),
        Credentials({
            async authorize(credentials) {
                const parsedCredentials = z
                    .object({ email: z.string().email(), password: z.string().min(12) })
                    .safeParse(credentials)

                if (parsedCredentials.success) {
                    const { email, password } = parsedCredentials.data
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
