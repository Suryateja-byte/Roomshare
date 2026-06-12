/**
 * Tests for the phase01 emergency-stop gate in
 * syncListingLifecycleProjectionInTx (H2).
 */

jest.mock("@/lib/listings/canonical-inventory", () => ({
  syncCanonicalListingInventory: jest.fn(),
}));

jest.mock("@/lib/projections/tombstone", () => ({
  handleTombstone: jest.fn(),
}));

import { syncListingLifecycleProjectionInTx } from "@/lib/listings/canonical-lifecycle";
import { syncCanonicalListingInventory } from "@/lib/listings/canonical-inventory";

const mockSyncCanonicalListingInventory =
  syncCanonicalListingInventory as jest.Mock;

describe("syncListingLifecycleProjectionInTx gating (H2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FEATURE_PHASE01_CANONICAL_WRITES;
  });

  afterAll(() => {
    delete process.env.FEATURE_PHASE01_CANONICAL_WRITES;
  });

  it("skips entirely (no reads, no writes) when the phase01 emergency stop is pulled", async () => {
    process.env.FEATURE_PHASE01_CANONICAL_WRITES = "false";
    const untouchableTx = new Proxy(
      {},
      {
        get(_target, prop) {
          throw new Error(
            `tx.${String(prop)} accessed during phase01 skip — no DB work allowed`
          );
        },
      }
    );

    await expect(
      syncListingLifecycleProjectionInTx(untouchableTx as never, "listing-1", {
        role: "host",
        id: "user-1",
      })
    ).resolves.toEqual({ action: "skipped_flag_off" });

    expect(mockSyncCanonicalListingInventory).not.toHaveBeenCalled();
  });

  it("proceeds normally when the flag is on (default)", async () => {
    const tx = {
      listing: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    await expect(
      syncListingLifecycleProjectionInTx(tx as never, "listing-1", {
        role: "host",
        id: "user-1",
      })
    ).resolves.toEqual({ action: "missing_listing" });

    expect(tx.listing.findUnique).toHaveBeenCalledTimes(1);
  });
});
