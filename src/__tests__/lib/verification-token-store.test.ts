jest.mock("@/lib/prisma", () => ({
  prisma: {
    verificationToken: {
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/token-security", () => ({
  createTokenPair: jest.fn(),
}));

import { prisma } from "@/lib/prisma";
import { createTokenPair } from "@/lib/token-security";
import {
  clearPendingVerificationToken,
  findVerificationTokenByHash,
  prepareVerificationTokenRotation,
  promotePendingVerificationToken,
  VERIFICATION_TOKEN_TTL_MS,
} from "@/lib/verification-token-store";

describe("verification-token-store", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createTokenPair as jest.Mock).mockReturnValue({
      token: "plain-token",
      tokenHash: "hash-token",
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback({
        verificationToken: {
          create: (prisma.verificationToken.create as jest.Mock).mock
            ? prisma.verificationToken.create
            : jest.fn(),
          delete: (prisma.verificationToken.delete as jest.Mock).mock
            ? prisma.verificationToken.delete
            : jest.fn(),
          findUnique: (prisma.verificationToken.findUnique as jest.Mock).mock
            ? prisma.verificationToken.findUnique
            : jest.fn(),
          update: (prisma.verificationToken.update as jest.Mock).mock
            ? prisma.verificationToken.update
            : jest.fn(),
        },
      })
    );
  });

  it("stages a pending token on an existing identifier row", async () => {
    const now = new Date("2026-04-13T12:00:00.000Z");
    (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
      identifier: "test@example.com",
      tokenHash: "active-hash",
      expires: new Date("2026-04-14T12:00:00.000Z"),
      pendingTokenHash: null,
      pendingExpires: null,
      pendingPreparedAt: null,
    });
    (prisma.verificationToken.update as jest.Mock).mockResolvedValue({});

    const result = await prepareVerificationTokenRotation(
      "test@example.com",
      now
    );

    expect(result).toEqual({
      status: "prepared",
      token: "plain-token",
      tokenHash: "hash-token",
      expires: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
    });
    expect(prisma.verificationToken.update).toHaveBeenCalledWith({
      where: { identifier: "test@example.com" },
      data: {
        pendingTokenHash: "hash-token",
        pendingExpires: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
        pendingPreparedAt: now,
      },
    });
  });

  it("returns conflict when a fresh pending token already exists", async () => {
    const now = new Date("2026-04-13T12:00:00.000Z");
    (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
      identifier: "test@example.com",
      tokenHash: "active-hash",
      expires: new Date("2026-04-14T12:00:00.000Z"),
      pendingTokenHash: "pending-hash",
      pendingExpires: new Date("2026-04-14T12:00:00.000Z"),
      pendingPreparedAt: new Date("2026-04-13T11:59:30.000Z"),
    });

    const result = await prepareVerificationTokenRotation(
      "test@example.com",
      now
    );

    expect(result).toEqual({ status: "conflict" });
    expect(prisma.verificationToken.update).not.toHaveBeenCalled();
    expect(prisma.verificationToken.create).not.toHaveBeenCalled();
  });

  it("creates a repair row when the identifier is missing", async () => {
    const now = new Date("2026-04-13T12:00:00.000Z");
    (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.verificationToken.create as jest.Mock).mockResolvedValue({});

    const result = await prepareVerificationTokenRotation(
      "test@example.com",
      now
    );

    expect(result.status).toBe("prepared");
    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: {
        identifier: "test@example.com",
        tokenHash: null,
        expires: null,
        pendingTokenHash: "hash-token",
        pendingExpires: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
        pendingPreparedAt: now,
      },
    });
  });

  it("promotes the matching pending token to active", async () => {
    const pendingExpires = new Date("2026-04-14T12:00:00.000Z");
    (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
      identifier: "test@example.com",
      tokenHash: "active-hash",
      expires: new Date("2026-04-13T12:00:00.000Z"),
      pendingTokenHash: "hash-token",
      pendingExpires,
      pendingPreparedAt: new Date("2026-04-13T12:00:00.000Z"),
    });
    (prisma.verificationToken.update as jest.Mock).mockResolvedValue({});

    const result = await promotePendingVerificationToken(
      "test@example.com",
      "hash-token"
    );

    expect(result).toBe(true);
    expect(prisma.verificationToken.update).toHaveBeenCalledWith({
      where: { identifier: "test@example.com" },
      data: {
        tokenHash: "hash-token",
        expires: pendingExpires,
        pendingTokenHash: null,
        pendingExpires: null,
        pendingPreparedAt: null,
      },
    });
  });

  it("clears the pending slot and preserves the active token", async () => {
    (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
      identifier: "test@example.com",
      tokenHash: "active-hash",
      expires: new Date("2026-04-13T12:00:00.000Z"),
      pendingTokenHash: "hash-token",
      pendingExpires: new Date("2026-04-14T12:00:00.000Z"),
      pendingPreparedAt: new Date("2026-04-13T12:00:00.000Z"),
    });
    (prisma.verificationToken.update as jest.Mock).mockResolvedValue({});

    const result = await clearPendingVerificationToken(
      "test@example.com",
      "hash-token"
    );

    expect(result).toBe(true);
    expect(prisma.verificationToken.update).toHaveBeenCalledWith({
      where: { identifier: "test@example.com" },
      data: {
        pendingTokenHash: null,
        pendingExpires: null,
        pendingPreparedAt: null,
      },
    });
    expect(prisma.verificationToken.delete).not.toHaveBeenCalled();
  });

  it("deletes the row when clearing the final pending slot", async () => {
    (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
      identifier: "test@example.com",
      tokenHash: null,
      expires: null,
      pendingTokenHash: "hash-token",
      pendingExpires: new Date("2026-04-14T12:00:00.000Z"),
      pendingPreparedAt: new Date("2026-04-13T12:00:00.000Z"),
    });
    (prisma.verificationToken.delete as jest.Mock).mockResolvedValue({});

    const result = await clearPendingVerificationToken(
      "test@example.com",
      "hash-token"
    );

    expect(result).toBe(true);
    expect(prisma.verificationToken.delete).toHaveBeenCalledWith({
      where: { identifier: "test@example.com" },
    });
  });

  it("finds an active token by hash", async () => {
    const expires = new Date("2026-04-14T12:00:00.000Z");
    (prisma.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier: "test@example.com",
      tokenHash: "hash-token",
      expires,
      pendingTokenHash: null,
      pendingExpires: null,
      pendingPreparedAt: null,
    });

    const result = await findVerificationTokenByHash("hash-token");

    expect(result).toEqual({
      record: {
        identifier: "test@example.com",
        tokenHash: "hash-token",
        expires,
        pendingTokenHash: null,
        pendingExpires: null,
        pendingPreparedAt: null,
      },
      slot: "active",
      expires,
    });
  });

  it("finds a pending token by hash", async () => {
    const pendingExpires = new Date("2026-04-14T12:00:00.000Z");
    (prisma.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier: "test@example.com",
      tokenHash: "active-hash",
      expires: new Date("2026-04-13T12:00:00.000Z"),
      pendingTokenHash: "hash-token",
      pendingExpires,
      pendingPreparedAt: new Date("2026-04-13T12:00:00.000Z"),
    });

    const result = await findVerificationTokenByHash("hash-token");

    expect(result).toEqual({
      record: {
        identifier: "test@example.com",
        tokenHash: "active-hash",
        expires: new Date("2026-04-13T12:00:00.000Z"),
        pendingTokenHash: "hash-token",
        pendingExpires,
        pendingPreparedAt: new Date("2026-04-13T12:00:00.000Z"),
      },
      slot: "pending",
      expires: pendingExpires,
    });
  });
});
