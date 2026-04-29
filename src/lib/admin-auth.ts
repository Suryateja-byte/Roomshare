import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type AdminAuthResult =
  | {
      error: null;
      code: null;
      isAdmin: true;
      userId: string;
    }
  | {
      error: string;
      code: "SESSION_EXPIRED" | "NOT_ADMIN" | "ACCOUNT_SUSPENDED";
      isAdmin: false;
      userId: string | null;
    };

export async function requireAdminAuth(): Promise<AdminAuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: "Unauthorized",
      code: "SESSION_EXPIRED",
      isAdmin: false,
      userId: null,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isSuspended: true },
  });

  if (!user?.isAdmin) {
    return {
      error: "Unauthorized",
      code: "NOT_ADMIN",
      isAdmin: false,
      userId: session.user.id,
    };
  }

  if (user.isSuspended) {
    return {
      error: "Account suspended",
      code: "ACCOUNT_SUSPENDED",
      isAdmin: false,
      userId: session.user.id,
    };
  }

  return {
    error: null,
    code: null,
    isAdmin: true,
    userId: session.user.id,
  };
}
