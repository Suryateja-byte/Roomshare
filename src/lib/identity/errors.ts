export class ModerationLockedError extends Error {
  readonly code = "MODERATION_LOCKED" as const;
  readonly httpStatus = 423 as const;
  readonly reason: "SUPPRESSED" | "PAUSED" | "REVIEW";

  constructor(
    reason: ModerationLockedError["reason"],
    message = "The requested row is moderation locked."
  ) {
    super(message);
    this.name = "ModerationLockedError";
    this.reason = reason;
  }
}

export class StaleVersionError extends Error {
  readonly code = "STALE_VERSION" as const;
  readonly httpStatus = 409 as const;
  readonly currentRowVersion: bigint;

  constructor(
    currentRowVersion: bigint,
    message = "The row version does not match the current record."
  ) {
    super(message);
    this.name = "StaleVersionError";
    this.currentRowVersion = currentRowVersion;
  }
}

export class AdvisoryLockContentionError extends Error {
  readonly code = "ADVISORY_LOCK_CONTENTION" as const;
  readonly httpStatus = 503 as const;

  constructor(message = "Timed out while waiting for a canonical advisory lock.") {
    super(message);
    this.name = "AdvisoryLockContentionError";
  }
}
