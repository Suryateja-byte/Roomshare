/**
 * CFM-003 — Messaging precondition: conversation-start dedup + race safety.
 *
 * Covers the DoD checklist in docs/migration/cfm-messaging-precondition.md:
 *   (a) 10-way concurrent startConversation → exactly one conversation row.
 *       Plus determinism: 20 consecutive runs all yield a single row.
 *   (c) serialization failure on first attempt → transparent retry.
 *   (d) per-user-deleted conversation is resurrected (same id returned).
 *   (e) rate-limited caller receives the generic message.
 *   PII: every log/metric id is hashed (no raw listingId / userId in output).
 *
 * The Prisma layer is mocked. The advisory lock is exercised by asserting
 * that `$executeRaw` is invoked on every attempt; the SERIALIZABLE semantics
 * are simulated by having the mocked `conversation.findFirst` return null
 * once and then the row created by the "winner".
 */

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
  unstable_cache: jest.fn((fn) => fn),
}));

type ListingMock = {
  id: string;
  ownerId: string;
  physicalUnitId: string;
  status: "ACTIVE" | "PAUSED" | "RENTED";
  statusReason: string | null;
  needsMigrationReview: boolean;
  availableSlots: number;
  totalSlots: number;
  openSlots: number;
  moveInDate: Date | null;
  availableUntil: Date | null;
  minStayMonths: number;
  lastConfirmedAt: Date | null;
};
type ConversationRow = { id: string; listingId: string; participantIds: string[] };

type PrismaMock = {
  listing: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
  physicalUnit: { findUnique: jest.Mock };
  conversation: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  conversationDeletion: {
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
};

const conversationStore: ConversationRow[] = [];
const perUserDeletions: Array<{ conversationId: string; userId: string }> = [];

let listingRow: ListingMock = makeListingRow();

function makeListingRow(overrides: Partial<ListingMock> = {}): ListingMock {
  return {
    id: "listing-1",
    ownerId: "host-1",
    physicalUnitId: "unit-1",
    status: "ACTIVE",
    statusReason: null,
    needsMigrationReview: false,
    availableSlots: 1,
    totalSlots: 1,
    openSlots: 1,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availableUntil: null,
    minStayMonths: 1,
    lastConfirmedAt: null,
    ...overrides,
  };
}

jest.mock("@/lib/prisma", () => {
  const findFirstMock = jest.fn(
    async (args: {
      where: {
        listingId: string;
        AND?: Array<{ participants: { some: { id: string } } }>;
      };
    }) => {
      const { listingId, AND } = args.where;
      const participantIds = (AND ?? []).map(
        (clause) => clause.participants.some.id
      );
      const row = conversationStore.find(
        (r) =>
          r.listingId === listingId &&
          participantIds.every((pid) => r.participantIds.includes(pid))
      );
      return row ? { id: row.id, listingId: row.listingId } : null;
    }
  );

  const createMock = jest.fn(
    async (args: {
      data: {
        listingId: string;
        participants: { connect: Array<{ id: string }> };
      };
    }) => {
      const row: ConversationRow = {
        id: `conv-${conversationStore.length + 1}`,
        listingId: args.data.listingId,
        participantIds: args.data.participants.connect.map((p) => p.id),
      };
      conversationStore.push(row);
      return { id: row.id, listingId: row.listingId };
    }
  );

  const deleteManyMock = jest.fn(
    async (args: { where: { conversationId: string; userId: string } }) => {
      const before = perUserDeletions.length;
      for (let i = perUserDeletions.length - 1; i >= 0; i--) {
        if (
          perUserDeletions[i].conversationId === args.where.conversationId &&
          perUserDeletions[i].userId === args.where.userId
        ) {
          perUserDeletions.splice(i, 1);
        }
      }
      return { count: before - perUserDeletions.length };
    }
  );

  const mockPrisma: PrismaMock = {
    listing: {
      findUnique: jest.fn(async () => listingRow),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: "user-1",
        emailVerified: new Date("2026-04-01T00:00:00.000Z"),
        isSuspended: false,
      }),
    },
    physicalUnit: {
      findUnique: jest.fn().mockResolvedValue({
        unitIdentityEpoch: 1,
        supersededByUnitId: null,
      }),
    },
    conversation: {
      findFirst: findFirstMock,
      create: createMock,
    },
    conversationDeletion: {
      deleteMany: deleteManyMock,
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };

  // Simulate the advisory-lock serialization: the real postgres
  // `pg_advisory_xact_lock` + SERIALIZABLE tx guarantees at most one
  // winner per key. We emulate that by chaining tx callbacks behind a
  // single promise — concurrent invocations run sequentially.
  let txChain: Promise<unknown> = Promise.resolve();
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: PrismaMock) => Promise<unknown>) => {
      const next = txChain.then(() => fn(mockPrisma));
      txChain = next.catch(() => undefined);
      return next;
    }
  );

  return { prisma: mockPrisma };
});

jest.mock("@/app/actions/block", () => ({
  checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: jest.fn(),
  }),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    chatStartConversation: {},
    chatSendMessage: {},
  },
}));

const mockConsumeMessageStartEntitlement = jest.fn();
const mockAttachConsumptionToConversation = jest.fn();
jest.mock("@/lib/payments/contact-paywall", () => ({
  consumeMessageStartEntitlement: (...args: unknown[]) =>
    mockConsumeMessageStartEntitlement(...args),
  attachConsumptionToConversation: (...args: unknown[]) =>
    mockAttachConsumptionToConversation(...args),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

const logCalls: Array<{ level: string; message: string; meta: unknown }> = [];
jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn((message: string, meta: unknown) =>
        logCalls.push({ level: "info", message, meta })
      ),
      warn: jest.fn((message: string, meta: unknown) =>
        logCalls.push({ level: "warn", message, meta })
      ),
      error: jest.fn((message: string, meta: unknown) =>
        logCalls.push({ level: "error", message, meta })
      ),
      debug: jest.fn((message: string, meta: unknown) =>
        logCalls.push({ level: "debug", message, meta })
      ),
    },
  },
  sanitizeErrorMessage: jest.fn((e: Error) => e.message),
}));

import { startConversation } from "@/app/actions/chat";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  _resetCfmMessagingTelemetryForTests,
  getCfmMessagingTelemetrySnapshot,
} from "@/lib/messaging/cfm-messaging-telemetry";

const mockedAuth = auth as unknown as jest.Mock;
const mockedPrisma = prisma as unknown as PrismaMock;
const mockedCheckRateLimit = checkRateLimit as unknown as jest.Mock;

function seedListing(overrides: Partial<ListingMock> = {}): void {
  listingRow = makeListingRow(overrides);
}

function installSerializedTransaction(): void {
  let txChain: Promise<unknown> = Promise.resolve();
  (mockedPrisma.$transaction as jest.Mock).mockImplementation(
    async (fn: (tx: PrismaMock) => Promise<unknown>) => {
      const next = txChain.then(() => fn(mockedPrisma));
      txChain = next.catch(() => undefined);
      return next;
    }
  );
}

function resetState(): void {
  conversationStore.length = 0;
  perUserDeletions.length = 0;
  logCalls.length = 0;
  seedListing();
  _resetCfmMessagingTelemetryForTests();
  mockedAuth.mockResolvedValue({ user: { id: "user-1" } });
  mockedCheckRateLimit.mockResolvedValue({ success: true });
  mockConsumeMessageStartEntitlement.mockResolvedValue({
    ok: true,
    summary: {
      enabled: false,
      mode: "OPEN",
      freeContactsRemaining: 2,
      packContactsRemaining: 0,
      activePassExpiresAt: null,
      requiresPurchase: false,
      offers: [],
    },
    unitId: "unit-1",
    unitIdentityEpoch: 1,
    source: "ENFORCEMENT_DISABLED",
    consumptionId: null,
  });
  mockAttachConsumptionToConversation.mockResolvedValue(undefined);
  installSerializedTransaction();
  (mockedPrisma.$executeRaw as jest.Mock).mockResolvedValue(undefined);
}

describe("CFM-003 — startConversation dedup & race safety", () => {
  beforeEach(() => {
    resetState();
  });

  describe("(a) concurrent dedup", () => {
    it("10-way concurrent startConversation returns a single conversation id", async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => startConversation("listing-1"))
      );

      expect(conversationStore).toHaveLength(1);
      const uniqueIds = new Set(
        results.map((r) =>
          "conversationId" in r ? r.conversationId : "ERROR"
        )
      );
      expect(uniqueIds.size).toBe(1);
      expect(uniqueIds.has("conv-1")).toBe(true);

      // Advisory lock MUST be acquired on every attempt. Other contact-first
      // audit writes also use $executeRaw, so filter for the lock statement.
      const advisoryLockCalls = mockedPrisma.$executeRaw.mock.calls.filter(
        (call) => String(call[0]).includes("pg_advisory_xact_lock")
      );
      expect(advisoryLockCalls).toHaveLength(10);
    });

    it("20 consecutive runs of the concurrent scenario all yield exactly one row", async () => {
      for (let run = 1; run <= 20; run++) {
        resetState();
        const results = await Promise.all(
          Array.from({ length: 10 }, () => startConversation("listing-1"))
        );
        expect(conversationStore).toHaveLength(1);
        const ids = new Set(
          results.map((r) =>
            "conversationId" in r ? r.conversationId : "ERROR"
          )
        );
        expect(ids.size).toBe(1);
      }
    });
  });

  describe("(c) serialization failure retry", () => {
    it("serialization failure on first attempt triggers transparent retry", async () => {
      const error = Object.assign(new Error("serialization failure: 40001"), {
        code: "P2034",
      });
      let attempt = 0;
      (mockedPrisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: PrismaMock) => Promise<unknown>) => {
          attempt++;
          if (attempt === 1) throw error;
          return fn(mockedPrisma);
        }
      );

      const result = await startConversation("listing-1");

      expect("conversationId" in result).toBe(true);
      if ("conversationId" in result) {
        expect(result.conversationId).toBe("conv-1");
      }
      expect(attempt).toBe(2);
      const debugEntries = logCalls.filter((c) => c.level === "debug");
      expect(debugEntries).toHaveLength(1);
      expect(debugEntries[0].message).toMatch(
        /serialization conflict, retrying/
      );
    });
  });

  describe("(d) resurrection path", () => {
    it("per-user-deleted conversation is resurrected and returns same id under concurrent re-contact", async () => {
      // Seed an existing conversation + per-user deletion for user-1.
      conversationStore.push({
        id: "conv-existing",
        listingId: "listing-1",
        participantIds: ["user-1", "host-1"],
      });
      perUserDeletions.push({
        conversationId: "conv-existing",
        userId: "user-1",
      });

      const results = await Promise.all(
        Array.from({ length: 5 }, () => startConversation("listing-1"))
      );

      // All 5 concurrent re-contacts MUST resolve to the same existing id —
      // no new conversation row is ever created.
      expect(conversationStore).toHaveLength(1);
      expect(conversationStore[0].id).toBe("conv-existing");
      for (const r of results) {
        expect("conversationId" in r && r.conversationId).toBe("conv-existing");
      }

      // The per-user deletion is cleared exactly once by the winner; the
      // remaining attempts see zero rows cleared and therefore emit the
      // "existing" path rather than "resurrected".
      expect(perUserDeletions).toHaveLength(0);
      const snapshot = getCfmMessagingTelemetrySnapshot();
      expect(snapshot.startPathCounts.resurrected).toBe(1);
      expect(snapshot.startPathCounts.existing).toBe(4);
      expect(snapshot.startPathCounts.created).toBe(0);
    });
  });

  describe("(e) rate limit privacy", () => {
    it("rate-limited caller receives generic message even when conversation exists", async () => {
      // Seed an existing conversation — a leaky implementation might say
      // "already have a conversation" or otherwise reveal the state.
      conversationStore.push({
        id: "conv-existing",
        listingId: "listing-1",
        participantIds: ["user-1", "host-1"],
      });
      mockedCheckRateLimit.mockResolvedValueOnce({ success: false });

      const result = await startConversation("listing-1");

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("Too many attempts. Please wait.");
      }
      // Must not proceed to findFirst — would leak existence via timing.
      expect(mockedPrisma.conversation.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("PII discipline — hashed ids in logs", () => {
    it("structured log uses hashed userId and listingId", async () => {
      await startConversation("listing-PII-RAW");

      const resolved = logCalls.find(
        (c) =>
          c.level === "info" && c.message === "startConversation:resolved"
      );
      expect(resolved).toBeDefined();

      const meta = resolved!.meta as Record<string, unknown>;
      // Hash contract: 16 lowercase hex characters.
      expect(meta.listingIdHash).toMatch(/^[0-9a-f]{16}$/);
      expect(meta.userIdHash).toMatch(/^[0-9a-f]{16}$/);

      // Raw ids MUST NOT appear in the metadata payload.
      const serialized = JSON.stringify(meta);
      expect(serialized).not.toContain("listing-PII-RAW");
      expect(serialized).not.toContain("user-1");
    });

    it("serialization-retry debug log also hashes ids", async () => {
      const error = Object.assign(new Error("40001"), { code: "P2034" });
      let attempt = 0;
      (mockedPrisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: PrismaMock) => Promise<unknown>) => {
          attempt++;
          if (attempt === 1) throw error;
          return fn(mockedPrisma);
        }
      );

      await startConversation("listing-retry");

      const retryLog = logCalls.find(
        (c) =>
          c.level === "debug" &&
          c.message ===
            "startConversation serialization conflict, retrying"
      );
      expect(retryLog).toBeDefined();
      const meta = retryLog!.meta as Record<string, unknown>;
      expect(meta.listingIdHash).toMatch(/^[0-9a-f]{16}$/);
      expect(meta.userIdHash).toMatch(/^[0-9a-f]{16}$/);
      expect(JSON.stringify(meta)).not.toContain("listing-retry");
      expect(JSON.stringify(meta)).not.toContain("user-1");
    });
  });
});
