import { StaleVersionError } from "@/lib/identity/errors";
import { requireRowVersion } from "@/lib/db/optimistic-lock";

describe("requireRowVersion", () => {
  it("is a no-op when the caller has no if-match version", () => {
    expect(() => requireRowVersion(BigInt(5), null)).not.toThrow();
  });

  it("is a no-op when the version matches", () => {
    expect(() => requireRowVersion(BigInt(5), BigInt(5))).not.toThrow();
  });

  it("throws a StaleVersionError on mismatch", () => {
    expect(() => requireRowVersion(BigInt(5), BigInt(4))).toThrow(
      StaleVersionError
    );
  });

  it("surfaces the expected 409 metadata on stale versions", () => {
    try {
      requireRowVersion(BigInt(5), BigInt(4));
      throw new Error("expected stale version failure");
    } catch (error) {
      expect(error).toBeInstanceOf(StaleVersionError);
      expect((error as StaleVersionError).httpStatus).toBe(409);
    }
  });
});
