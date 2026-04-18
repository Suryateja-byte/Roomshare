import { checkCollisionRateLimit } from "@/lib/listings/collision-detector";
import {
  createSeedCollisionRow,
  makeCollisionDetectorTx,
} from "@/__tests__/lib/listings/collision-detector-test-utils";

const TEST_ADDRESS = "123 main st austin tx 78701";

describe("checkCollisionRateLimit", () => {
  it("flags moderation on the fourth same-address create inside 24 hours", async () => {
    const now = Date.now();
    const { tx } = makeCollisionDetectorTx([
      createSeedCollisionRow({
        id: "listing-1",
        normalizedAddress: TEST_ADDRESS,
        createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
      }),
      createSeedCollisionRow({
        id: "listing-2",
        normalizedAddress: TEST_ADDRESS,
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      }),
      createSeedCollisionRow({
        id: "listing-3",
        normalizedAddress: TEST_ADDRESS,
        createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      }),
    ]);

    const result = await checkCollisionRateLimit({
      ownerId: "owner-1",
      normalizedAddress: TEST_ADDRESS,
      tx,
    });

    expect(result).toEqual({
      windowCount: 3,
      needsModeration: true,
    });
  });

  it("does not gate the first collision in an empty window", async () => {
    const { tx } = makeCollisionDetectorTx([]);

    const result = await checkCollisionRateLimit({
      ownerId: "owner-1",
      normalizedAddress: TEST_ADDRESS,
      tx,
    });

    expect(result).toEqual({
      windowCount: 0,
      needsModeration: false,
    });
  });

  it("ignores rows older than 24 hours", async () => {
    const now = Date.now();
    const { tx } = makeCollisionDetectorTx([
      createSeedCollisionRow({
        id: "listing-stale",
        normalizedAddress: TEST_ADDRESS,
        createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      }),
      createSeedCollisionRow({
        id: "listing-recent",
        normalizedAddress: TEST_ADDRESS,
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      }),
    ]);

    const result = await checkCollisionRateLimit({
      ownerId: "owner-1",
      normalizedAddress: TEST_ADDRESS,
      tx,
    });

    expect(result).toEqual({
      windowCount: 1,
      needsModeration: false,
    });
  });

  it("excludes rows at a different normalized address", async () => {
    const now = Date.now();
    const { tx } = makeCollisionDetectorTx([
      createSeedCollisionRow({
        id: "listing-same",
        normalizedAddress: TEST_ADDRESS,
        createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
      }),
      createSeedCollisionRow({
        id: "listing-other-address",
        normalizedAddress: "456 elm ave seattle wa 98101",
        createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
      }),
    ]);

    const result = await checkCollisionRateLimit({
      ownerId: "owner-1",
      normalizedAddress: TEST_ADDRESS,
      tx,
    });

    expect(result).toEqual({
      windowCount: 1,
      needsModeration: false,
    });
  });

  it("returns zero window when normalizedAddress is empty", async () => {
    const { tx } = makeCollisionDetectorTx([]);

    const result = await checkCollisionRateLimit({
      ownerId: "owner-1",
      normalizedAddress: "",
      tx,
    });

    expect(result).toEqual({
      windowCount: 0,
      needsModeration: false,
    });
  });
});
