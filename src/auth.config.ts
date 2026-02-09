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
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard")
      const isOnAuth =
        nextUrl.pathname.startsWith("/login")
        || nextUrl.pathname.startsWith("/signup")

      if (isOnDashboard) {
        if (isLoggedIn) return true
        return false // Redirect unauthenticated users to login page
      } else if (isLoggedIn && isOnAuth) {
        return Response.redirect(new URL("/", nextUrl))
      }

      return true
    },
  },
  providers: [],
} satisfies NextAuthConfig
