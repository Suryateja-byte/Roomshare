import {
  getModerationWriteLockReason,
  getModerationWriteLockResult,
} from "@/lib/listings/moderation-write-lock";

describe("moderation-write-lock", () => {
  it("returns a lock result for hosts on ADMIN_PAUSED rows", () => {
    expect(
      getModerationWriteLockResult({
        actor: "host",
        statusReason: "ADMIN_PAUSED",
      })
    ).toEqual({
      code: "LISTING_LOCKED",
      error: "This listing is locked while under review.",
      httpStatus: 423,
      lockReason: "ADMIN_PAUSED",
    });
  });

  it("returns a lock result for hosts on SUPPRESSED rows", () => {
    expect(
      getModerationWriteLockResult({
        actor: "host",
        statusReason: "SUPPRESSED",
      })
    ).toEqual({
      code: "LISTING_LOCKED",
      error: "This listing is locked while under review.",
      httpStatus: 423,
      lockReason: "SUPPRESSED",
    });
  });

  it("bypasses moderation locks for admin actors", () => {
    expect(
      getModerationWriteLockResult({
        actor: "admin",
        statusReason: "ADMIN_PAUSED",
      })
    ).toBeNull();
  });

  it("does not treat migration review as a moderation write lock", () => {
    expect(getModerationWriteLockReason("MIGRATION_REVIEW")).toBeNull();
    expect(
      getModerationWriteLockResult({
        actor: "host",
        statusReason: "MIGRATION_REVIEW",
      })
    ).toBeNull();
  });
});
