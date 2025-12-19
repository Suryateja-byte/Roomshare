import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

async function getUser(email: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { email },
        })
        return user
    } catch (error) {
        console.error("Failed to fetch user:", error)
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
    },
    // Note: In NextAuth v5 (Auth.js), account linking is handled by the adapter
    // The Prisma adapter will auto-link accounts when email matches
    callbacks: {
        async session({ session, token }) {
            if (token.sub && session.user) {
                session.user.id = token.sub
                session.user.emailVerified = token.emailVerified as Date | null
                session.user.isAdmin = token.isAdmin as boolean
                // Include image from token (refreshed from DB on each request)
                if (token.image) {
                    session.user.image = token.image as string
                }
            }
            return session
        },
        async jwt({ token, user, account, trigger }) {
            if (user) {
                token.sub = user.id
                token.emailVerified = user.emailVerified
                token.isAdmin = user.isAdmin
                token.image = user.image
            }
            // Refresh user data from database on update or periodically
            // This ensures profile picture changes are reflected in the session
            if (token.sub) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: token.sub },
                    select: { emailVerified: true, isAdmin: true, image: true, name: true }
                })
                if (dbUser) {
                    token.emailVerified = dbUser.emailVerified
                    token.isAdmin = dbUser.isAdmin
                    token.image = dbUser.image
                    token.name = dbUser.name
                }
            }
            return token
        },
        async signIn({ user, account, profile }) {
            if (account?.provider === "google") {
                // Check if email is verified by Google
                // This is important for security when allowDangerousEmailAccountLinking is enabled
                const googleProfile = profile as { email_verified?: boolean }
                if (!googleProfile?.email_verified) {
                    return '/login?error=EmailNotVerified'
                }
                return true
            }
            return true
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
                    .object({ email: z.string().email(), password: z.string().min(6) })
                    .safeParse(credentials)

                if (parsedCredentials.success) {
                    const { email, password } = parsedCredentials.data
                    const user = await getUser(email)
                    if (!user) return null
                    if (!user.password) return null

                    const passwordsMatch = await bcrypt.compare(password, user.password)
                    if (passwordsMatch) return user
                }

                console.log("Invalid credentials")
                return null
            },
        }),
    ],
})
