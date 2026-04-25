/**
 * Deploy-time monotonic projection epoch.
 *
 * Read from the PROJECTION_EPOCH environment variable (default: 1).
 * Must be incremented (and a new deploy triggered) whenever the projection
 * schema or grouping rules change in a backward-incompatible way.
 *
 * Phase 08 will replace this with a database-backed epoch for zero-downtime
 * bumps. Until then, accept the 1-2 minute mixed-epoch window during rolling
 * deploys (documented as Edge Case 17 in the Phase 02 spec).
 */

/** @internal — override only from tests via __setProjectionEpochForTesting */
let _testOverride: bigint | null = null;

/** Returns the deploy-time projection epoch as a bigint. */
export function currentProjectionEpoch(): bigint {
  if (_testOverride !== null) return _testOverride;
  const raw = process.env.PROJECTION_EPOCH ?? "1";
  const parsed = BigInt(raw);
  return parsed;
}

/**
 * For tests only — override the env-derived value for the duration of a test.
 * Pass `null` to restore env-derived behaviour.
 */
export function __setProjectionEpochForTesting(value: bigint | null): void {
  _testOverride = value;
}
