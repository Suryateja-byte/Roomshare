import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      emailVerified: Date | null;
      isAdmin: boolean;
      isSuspended: boolean;
    } & DefaultSession["user"];
    authTime?: number; // P0-5: Actual sign-in timestamp (not token refresh)
  }

  interface User extends DefaultUser {
    id: string;
    emailVerified: Date | null;
    isAdmin: boolean;
    isSuspended: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    emailVerified?: Date | null;
    isAdmin?: boolean;
    isSuspended?: boolean;
    image?: string | null;
    authTime?: number; // P0-5: Actual sign-in timestamp (not token refresh)
    passwordInvalidated?: boolean; // H-1: set true when passwordChangedAt > authTime
    lastSecurityCheck?: number; // H-1: epoch seconds of last DB check in jwt callback
  }
}
