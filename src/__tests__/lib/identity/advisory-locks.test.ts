import {
  acquireXactLock,
  canonicalUnitLockKey,
  identityMutationLockKey,
  LOCK_PREFIX_CANONICAL_UNIT,
  LOCK_PREFIX_IDENTITY_MUTATION,
} from "@/lib/identity/advisory-locks";
import { AdvisoryLockContentionError } from "@/lib/identity/errors";

describe("advisory-locks", () => {
  it("uses the Phase 01 lock prefixes", () => {
    expect(canonicalUnitLockKey("abc123")).toBe(`${LOCK_PREFIX_CANONICAL_UNIT}abc123`);
    expect(identityMutationLockKey("unit-1")).toBe(
      `${LOCK_PREFIX_IDENTITY_MUTATION}unit-1`
    );
  });

  it("translates lock timeout failures into AdvisoryLockContentionError", async () => {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      $executeRaw: jest
        .fn()
        .mockRejectedValue(new Error("canceling statement due to lock timeout")),
    };

    await expect(acquireXactLock(tx as never, "p1:unit:abc")).rejects.toBeInstanceOf(
      AdvisoryLockContentionError
    );
  });
});
