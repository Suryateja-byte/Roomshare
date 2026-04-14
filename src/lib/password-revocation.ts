import "server-only";

import { prisma } from "@/lib/prisma";
import { sanitizeErrorMessage } from "@/lib/logger";

export type PasswordRevocationState = "valid" | "revoked" | "unknown";

export async function getPasswordRevocationState(
  userId: string,
  authTime: number
): Promise<{ state: PasswordRevocationState; error?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordChangedAt: true },
    });

    if (!user?.passwordChangedAt) {
      return { state: "valid" };
    }

    const changedAtEpoch = Math.floor(user.passwordChangedAt.getTime() / 1000);
    return { state: changedAtEpoch > authTime ? "revoked" : "valid" };
  } catch (error) {
    return {
      state: "unknown",
      error: sanitizeErrorMessage(error),
    };
  }
}
