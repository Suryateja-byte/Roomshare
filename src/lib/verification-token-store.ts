import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTokenPair } from "@/lib/token-security";

export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const VERIFICATION_TOKEN_PENDING_FRESHNESS_MS = 60 * 1000;

export type VerificationTokenSlot = "active" | "pending";

type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

type VerificationTokenRow = {
  identifier: string;
  tokenHash: string | null;
  expires: Date | null;
  pendingTokenHash: string | null;
  pendingExpires: Date | null;
  pendingPreparedAt: Date | null;
};

type PreparedVerificationToken =
  | { status: "conflict" }
  | {
      status: "prepared";
      token: string;
      tokenHash: string;
      expires: Date;
    };

const SERIALIZABLE_RETRIES = 3;

function isRetryableSerializableError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

async function runSerializableTransaction<T>(
  callback: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        isRetryableSerializableError(error) &&
        attempt < SERIALIZABLE_RETRIES
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Verification token transaction retries exhausted");
}

export async function prepareVerificationTokenRotation(
  identifier: string,
  now = new Date()
): Promise<PreparedVerificationToken> {
  const { token, tokenHash } = createTokenPair();
  const expires = new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS);
  const freshnessCutoff = new Date(
    now.getTime() - VERIFICATION_TOKEN_PENDING_FRESHNESS_MS
  );

  return runSerializableTransaction(async (tx) => {
    const existing = (await tx.verificationToken.findUnique({
      where: { identifier },
    })) as VerificationTokenRow | null;

    if (
      existing?.pendingPreparedAt &&
      existing.pendingPreparedAt > freshnessCutoff
    ) {
      return { status: "conflict" };
    }

    const pendingData = {
      pendingTokenHash: tokenHash,
      pendingExpires: expires,
      pendingPreparedAt: now,
    };

    if (existing) {
      await tx.verificationToken.update({
        where: { identifier },
        data: pendingData,
      });
    } else {
      await tx.verificationToken.create({
        data: {
          identifier,
          tokenHash: null,
          expires: null,
          ...pendingData,
        },
      });
    }

    return {
      status: "prepared",
      token,
      tokenHash,
      expires,
    };
  });
}

export async function findVerificationTokenByHash(tokenHash: string): Promise<{
  record: VerificationTokenRow;
  slot: VerificationTokenSlot;
  expires: Date;
} | null> {
  const record = (await prisma.verificationToken.findFirst({
    where: {
      OR: [{ tokenHash }, { pendingTokenHash: tokenHash }],
    },
  })) as VerificationTokenRow | null;

  if (!record) return null;

  if (record.tokenHash === tokenHash && record.expires) {
    return {
      record,
      slot: "active",
      expires: record.expires,
    };
  }

  if (record.pendingTokenHash === tokenHash && record.pendingExpires) {
    return {
      record,
      slot: "pending",
      expires: record.pendingExpires,
    };
  }

  return null;
}

export async function promotePendingVerificationToken(
  identifier: string,
  expectedPendingTokenHash: string
): Promise<boolean> {
  return runSerializableTransaction(async (tx) => {
    const record = (await tx.verificationToken.findUnique({
      where: { identifier },
    })) as VerificationTokenRow | null;

    if (
      !record ||
      record.pendingTokenHash !== expectedPendingTokenHash ||
      !record.pendingExpires
    ) {
      return false;
    }

    await tx.verificationToken.update({
      where: { identifier },
      data: {
        tokenHash: record.pendingTokenHash,
        expires: record.pendingExpires,
        pendingTokenHash: null,
        pendingExpires: null,
        pendingPreparedAt: null,
      },
    });

    return true;
  });
}

export async function clearVerificationTokenSlot(
  identifier: string,
  slot: VerificationTokenSlot,
  expectedTokenHash: string
): Promise<boolean> {
  return runSerializableTransaction(async (tx) => {
    const record = (await tx.verificationToken.findUnique({
      where: { identifier },
    })) as VerificationTokenRow | null;

    if (!record) {
      return false;
    }

    const currentHash =
      slot === "active" ? record.tokenHash : record.pendingTokenHash;

    if (currentHash !== expectedTokenHash) {
      return false;
    }

    const hasRemainingActive =
      slot === "pending" && Boolean(record.tokenHash && record.expires);
    const hasRemainingPending =
      slot === "active" &&
      Boolean(record.pendingTokenHash && record.pendingExpires);

    if (!hasRemainingActive && !hasRemainingPending) {
      await tx.verificationToken.delete({
        where: { identifier },
      });
      return true;
    }

    await tx.verificationToken.update({
      where: { identifier },
      data:
        slot === "active"
          ? { tokenHash: null, expires: null }
          : {
              pendingTokenHash: null,
              pendingExpires: null,
              pendingPreparedAt: null,
            },
    });

    return true;
  });
}

export function clearPendingVerificationToken(
  identifier: string,
  expectedPendingTokenHash: string
): Promise<boolean> {
  return clearVerificationTokenSlot(
    identifier,
    "pending",
    expectedPendingTokenHash
  );
}
