import { findCollisions } from "@/lib/listings/collision-detector";
import {
  createSeedCollisionRow,
  makeCollisionDetectorTx,
} from "@/__tests__/lib/listings/collision-detector-test-utils";

describe("findCollisions pre-backfill behavior", () => {
  it("treats null normalizedAddress rows as non-colliding false negatives", async () => {
    const { tx } = makeCollisionDetectorTx([
      createSeedCollisionRow({
        id: "listing-null-address",
        normalizedAddress: null,
      }),
    ]);

    const result = await findCollisions({
      ownerId: "owner-1",
      normalizedAddress: "123 main st austin tx 78701",
      moveInDate: "2026-06-01",
      availableUntil: "2026-07-01",
      tx,
    });

    expect(result).toEqual([]);
  });
});
