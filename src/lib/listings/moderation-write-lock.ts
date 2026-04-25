export const MODERATION_WRITE_LOCK_REASONS = [
  "ADMIN_PAUSED",
  "SUPPRESSED",
] as const;

export type ModerationWriteLockReason =
  (typeof MODERATION_WRITE_LOCK_REASONS)[number];

export const LISTING_LOCKED_ERROR_MESSAGE =
  "This listing is locked while under review.";

export interface ModerationWriteLockResult {
  code: "LISTING_LOCKED";
  error: string;
  httpStatus: 423;
  lockReason: ModerationWriteLockReason;
}

export function getModerationWriteLockReason(
  statusReason: string | null | undefined
): ModerationWriteLockReason | null {
  if (statusReason === "ADMIN_PAUSED" || statusReason === "SUPPRESSED") {
    return statusReason;
  }

  return null;
}

export function getModerationWriteLockResult(options: {
  actor: "host" | "admin";
  statusReason: string | null | undefined;
}): ModerationWriteLockResult | null {
  if (options.actor !== "host") {
    return null;
  }

  const lockReason = getModerationWriteLockReason(options.statusReason);
  if (!lockReason) {
    return null;
  }

  return {
    code: "LISTING_LOCKED",
    error: LISTING_LOCKED_ERROR_MESSAGE,
    httpStatus: 423,
    lockReason,
  };
}
