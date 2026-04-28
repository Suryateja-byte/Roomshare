/**
 * @jest-environment node
 */

import { createCipheriv, randomBytes } from "crypto";

jest.mock("@/lib/env", () => ({
  features: {
    publicCacheCoherence: true,
    disablePublicCachePush: false,
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      warn: jest.fn(),
    },
  },
}));

jest.mock("@/lib/public-cache/events", () => ({
  buildPublicCacheInvalidationEvent: jest.fn((row) => ({
    type: "public-cache.invalidate",
    cursor: `cursor-${row.id}`,
    cacheFloorToken: `floor-${row.id}`,
    unitCacheKey: `${row.unit_id}:${row.unit_identity_epoch}`,
    projectionEpoch: String(row.projection_epoch),
    unitIdentityEpoch: row.unit_identity_epoch,
    reason: row.reason,
    enqueuedAt: row.enqueued_at.toISOString(),
    emittedAt: "2026-04-28T00:00:00.000Z",
  })),
}));

jest.mock("web-push", () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}));

import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { drainPublicCacheFanoutOnce } from "@/lib/public-cache/push";

const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as jest.Mock;
const mockWebpush = webpush as jest.Mocked<typeof webpush>;
const encryptionKey = Buffer.alloc(32, 7);

function sqlText(template: unknown): string {
  return Array.isArray(template) ? template.join("") : String(template);
}

function encryptSubscription(subscription: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(subscription), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

function fanoutRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cache-1",
    unit_id: "unit-1",
    projection_epoch: BigInt(1),
    unit_identity_epoch: 1,
    reason: "TOMBSTONE",
    enqueued_at: new Date("2026-04-28T00:00:00.000Z"),
    fanout_attempt_count: 0,
    fanout_claimed_at: new Date("2026-04-28T00:00:01.000Z"),
    ...overrides,
  };
}

describe("drainPublicCacheFanoutOnce", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_PUBLIC_CACHE_VAPID_KEY = "public-key";
    process.env.PUBLIC_CACHE_VAPID_PRIVATE_KEY = "private-key";
    process.env.PUBLIC_CACHE_VAPID_SUBJECT = "mailto:test@example.com";
    process.env.PUBLIC_CACHE_PUSH_ENCRYPTION_KEY =
      encryptionKey.toString("base64");
    mockExecuteRaw.mockResolvedValue(1);
    mockWebpush.sendNotification.mockResolvedValue({
      statusCode: 201,
      body: "",
      headers: {},
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("claims due invalidations with row locks before fanout", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await expect(drainPublicCacheFanoutOnce(5)).resolves.toEqual({
      processed: 0,
      delivered: 0,
      skipped: 0,
      failed: 0,
    });

    const claimSql = sqlText(mockQueryRaw.mock.calls[0][0]);
    expect(claimSql).toContain("FOR UPDATE SKIP LOCKED");
    expect(claimSql).toContain("UPDATE cache_invalidations ci");
    expect(claimSql).toContain("fanout_last_attempt_at = NOW()");
    expect(claimSql).toContain("fanout_next_attempt_at = NOW()");
  });

  it("guards final delivered updates with the returned claim timestamp", async () => {
    const claimedAt = new Date("2026-04-28T00:00:01.000Z");
    const row = fanoutRow({ fanout_claimed_at: claimedAt });
    mockQueryRaw
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([
        {
          id: "sub-1",
          endpoint_hash: "endpoint-hash",
          subscription_ciphertext: encryptSubscription({
            endpoint: "https://push.example/subscription-1",
            expirationTime: null,
            keys: {
              p256dh: "p256dh-key-123456",
              auth: "auth-key-123456",
            },
          }),
        },
      ]);

    await expect(drainPublicCacheFanoutOnce(1)).resolves.toMatchObject({
      processed: 1,
      delivered: 1,
      skipped: 0,
      failed: 0,
    });

    const deliveredCall = mockExecuteRaw.mock.calls.find((call) =>
      sqlText(call[0]).includes("fanout_status = 'DELIVERED'")
    );
    expect(deliveredCall).toBeDefined();
    expect(sqlText(deliveredCall![0])).toContain(
      "AND fanout_last_attempt_at ="
    );
    expect(deliveredCall!.slice(1)).toContain(claimedAt);
  });

  it("does not report delivery when a stale claim guard wins zero rows", async () => {
    const row = fanoutRow();
    mockQueryRaw
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([
        {
          id: "sub-1",
          endpoint_hash: "endpoint-hash",
          subscription_ciphertext: encryptSubscription({
            endpoint: "https://push.example/subscription-1",
            keys: {
              p256dh: "p256dh-key-123456",
              auth: "auth-key-123456",
            },
          }),
        },
      ]);
    mockExecuteRaw.mockImplementation((template: unknown) => {
      const sql = sqlText(template);
      return Promise.resolve(sql.includes("UPDATE cache_invalidations") ? 0 : 1);
    });

    await expect(drainPublicCacheFanoutOnce(1)).resolves.toMatchObject({
      processed: 1,
      delivered: 0,
      skipped: 0,
      failed: 0,
    });
  });
});
