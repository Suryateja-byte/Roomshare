/** Identifier encoding the active normalization ruleset. */
export const CANONICALIZER_VERSION = "v1.0-2026-04" as const;

/** Returns true when the provided version matches the current canonicalizer. */
export function isCurrentCanonicalizerVersion(version: string): boolean {
  return version === CANONICALIZER_VERSION;
}
