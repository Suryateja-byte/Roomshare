import { findCollisions } from "@/lib/listings/collision-detector";
import {
  createSeedCollisionRow,
  makeCollisionDetectorTx,
} from "@/__tests__/lib/listings/collision-detector-test-utils";

describe("findCollisions owner boundary", () => {
  it("never returns sibling rows owned by another user", async () => {
    const { tx } = makeCollisionDetectorTx([
      createSeedCollisionRow({
        id: "listing-owner-b",
        ownerId: "owner-b",
      }),
    ]);

    const result = await findCollisions({
      ownerId: "owner-a",
      normalizedAddress: "123 main st austin tx 78701",
      moveInDate: "2026-06-01",
      availableUntil: "2026-07-01",
      tx,
    });

    expect(result).toEqual([]);
  });
});
