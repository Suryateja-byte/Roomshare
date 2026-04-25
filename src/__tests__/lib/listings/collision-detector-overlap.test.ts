import { findCollisions } from "@/lib/listings/collision-detector";
import {
  createSeedCollisionRow,
  makeCollisionDetectorTx,
} from "@/__tests__/lib/listings/collision-detector-test-utils";

describe("findCollisions overlap detection", () => {
  it("returns a sibling when the availability windows overlap", async () => {
    const { tx } = makeCollisionDetectorTx([
      createSeedCollisionRow({
        id: "listing-overlap",
        status: "PAUSED",
        statusReason: "HOST_PAUSED",
      }),
    ]);

    const result = await findCollisions({
      ownerId: "owner-1",
      normalizedAddress: "123 main st austin tx 78701",
      moveInDate: "2026-06-01",
      availableUntil: "2026-07-01",
      tx,
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "listing-overlap",
        moveInDate: "2026-05-01",
        availableUntil: "2026-08-01",
        canUpdate: true,
      }),
    ]);
  });

  it("returns no siblings when the windows do not overlap", async () => {
    const { tx } = makeCollisionDetectorTx([
      createSeedCollisionRow({
        id: "listing-no-overlap",
        availableUntil: "2026-06-01",
      }),
    ]);

    const result = await findCollisions({
      ownerId: "owner-1",
      normalizedAddress: "123 main st austin tx 78701",
      moveInDate: "2026-07-01",
      availableUntil: "2026-08-01",
      tx,
    });

    expect(result).toEqual([]);
  });

  it("treats open-ended existing listings as overlapping later requests", async () => {
    const { tx } = makeCollisionDetectorTx([
      createSeedCollisionRow({
        id: "listing-open-ended",
        availableUntil: null,
      }),
    ]);

    const result = await findCollisions({
      ownerId: "owner-1",
      normalizedAddress: "123 main st austin tx 78701",
      moveInDate: "2026-09-01",
      availableUntil: "2026-12-01",
      tx,
    });

    expect(result.map((row) => row.id)).toEqual(["listing-open-ended"]);
  });

  it("returns no collisions when the incoming listing omits moveInDate", async () => {
    const { tx, queryRawMock } = makeCollisionDetectorTx([
      createSeedCollisionRow({
        id: "listing-open-ended",
        availableUntil: null,
      }),
    ]);

    const result = await findCollisions({
      ownerId: "owner-1",
      normalizedAddress: "123 main st austin tx 78701",
      moveInDate: null,
      availableUntil: "2026-12-01",
      tx,
    });

    expect(result).toEqual([]);
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
