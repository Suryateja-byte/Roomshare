import "server-only";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { invalidateLiveSecurityStatusCache } from "@/lib/auth-helpers";

type PasswordWriteClient = Pick<typeof prisma, "user">;

export async function updateUserPassword(
  client: PasswordWriteClient,
  userId: string,
  newPassword: string
): Promise<{ passwordChangedAt: Date }> {
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  const passwordChangedAt = new Date();

  await client.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      passwordChangedAt,
    },
  });

  invalidateLiveSecurityStatusCache(userId);

  return { passwordChangedAt };
}
