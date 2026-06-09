import type { NextAuthConfig } from "next-auth";
import { isPrivatePagePath } from "@/lib/auth-route-policy";

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
  providers: [],
} satisfies NextAuthConfig;
