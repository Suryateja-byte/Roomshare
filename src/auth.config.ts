import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 14 * 24 * 60 * 60, // 14 days (aligned with src/auth.ts)
    updateAge: 24 * 60 * 60, // Refresh token once per day
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const pathname = nextUrl.pathname
      const isAdmin = !!auth?.user?.isAdmin

      const protectedPaths = [
        '/dashboard', '/bookings', '/messages', '/settings', '/profile',
        '/notifications', '/saved', '/recently-viewed', '/saved-searches'
      ]
      const isProtected = protectedPaths.some(p => pathname.startsWith(p))
      const isAdminRoute = pathname.startsWith('/admin')
      const isOnAuth = pathname.startsWith('/login') || pathname.startsWith('/signup')

      if (isAdminRoute) {
        if (!isLoggedIn) return false
        if (!isAdmin) return Response.redirect(new URL('/', nextUrl))
        return true
      }
      if (isProtected) {
        if (isLoggedIn) return true
        return false
      }
      if (isLoggedIn && isOnAuth) {
        return Response.redirect(new URL('/', nextUrl))
      }
      return true
    },
  },
  providers: [],
} satisfies NextAuthConfig
