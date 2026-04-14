import "server-only";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { invalidateLiveSecurityStatusCache } from "@/lib/auth-helpers";

type PasswordWriteClient = Pick<typeof prisma, "user">;

export interface PreparedPasswordUpdate {
  hashedPassword: string;
  passwordChangedAt: Date;
}

export async function preparePasswordUpdate(
  newPassword: string
): Promise<PreparedPasswordUpdate> {
  return {
    hashedPassword: await bcrypt.hash(newPassword, 12),
    passwordChangedAt: new Date(),
  };
}

export async function updateUserPassword(
  client: PasswordWriteClient,
  userId: string,
  passwordUpdate: PreparedPasswordUpdate
): Promise<{ passwordChangedAt: Date }> {
  await client.user.update({
    where: { id: userId },
    data: {
      password: passwordUpdate.hashedPassword,
      passwordChangedAt: passwordUpdate.passwordChangedAt,
    },
  });

  return { passwordChangedAt: passwordUpdate.passwordChangedAt };
}

export function invalidatePasswordState(userId: string) {
  invalidateLiveSecurityStatusCache(userId);
}
