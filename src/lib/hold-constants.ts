/** Default hold duration in minutes */
export const HOLD_TTL_MINUTES = 15;
/** Maximum active holds per user across all listings */
export const MAX_HOLDS_PER_USER = 3;
/** Sweeper batch size (FOR UPDATE SKIP LOCKED) */
export const SWEEPER_BATCH_SIZE = 100;
/** Advisory lock key for sweeper (used with hashtext()) */
export const SWEEPER_ADVISORY_LOCK_KEY = "sweeper-expire-holds";
/** Advisory lock key for slot reconciler (used with hashtext()) */
export const RECONCILER_ADVISORY_LOCK_KEY = "reconcile-slots";
