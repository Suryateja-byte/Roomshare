import { StaleVersionError } from "@/lib/identity/errors";

/**
 * Compare the caller's expected row version to the current row.
 */
export function requireRowVersion(
  currentRowVersion: bigint,
  ifMatchRowVersion: bigint | null
): void {
  if (ifMatchRowVersion === null) {
    return;
  }

  if (currentRowVersion !== ifMatchRowVersion) {
    throw new StaleVersionError(currentRowVersion);
  }
}
