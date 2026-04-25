/**
 * Centralized SQL safety helpers for raw-query validation.
 *
 * Use these utilities in any file that builds WHERE clauses for
 * $queryRawUnsafe / $executeRawUnsafe so that the parameterization
 * invariant is enforced in one place.
 *
 * SECURITY INVARIANT (repeat in every raw-query call site):
 *   - ALL user-supplied values MUST be in the `params` array as $N placeholders.
 *   - `conditions` entries must contain ONLY hard-coded SQL fragments.
 *   - Never interpolate a value from user input directly into the query string.
 */

import "server-only";

/**
 * SQL string literals that are allowed to appear verbatim inside a
 * WHERE clause produced by this module.
 *
 * ACTIVE  — listing status enum value (hard-coded in condition strings)
 * english — PostgreSQL text-search configuration name
 * %       — LIKE wildcard
 * HELD    — booking status enum value (hard-coded in condition strings)
 */
const ALLOWED_SQL_STRING_LITERALS = new Set(["ACTIVE", "english", "%", "HELD"]);

function buildAllowedSqlStringLiterals(
  allowedLiterals?: Iterable<string>
): Set<string> {
  const effectiveAllowedLiterals = new Set(ALLOWED_SQL_STRING_LITERALS);

  if (!allowedLiterals) {
    return effectiveAllowedLiterals;
  }

  for (const literal of allowedLiterals) {
    effectiveAllowedLiterals.add(literal);
  }

  return effectiveAllowedLiterals;
}

/**
 * Assert that a WHERE clause string contains no raw user-supplied string
 * literals.  Scans for single-quoted values and rejects any that are not in
 * the explicit allow-list above.
 *
 * Use `allowedLiterals` for scoped additions at trusted call sites that need a
 * few extra hard-coded SQL literals without relaxing the global default.
 *
 * @throws if a disallowed literal is detected.
 */
export function assertParameterizedWhereClause(
  whereClause: string,
  allowedLiterals?: Iterable<string>
): void {
  const effectiveAllowedLiterals =
    buildAllowedSqlStringLiterals(allowedLiterals);
  const literalPattern = /'([^']*)'/g;
  for (const match of whereClause.matchAll(literalPattern)) {
    const literalValue = match[1];
    if (!effectiveAllowedLiterals.has(literalValue)) {
      throw new Error(
        "SECURITY: Raw string detected in whereClause — use parameterized $N placeholders"
      );
    }
  }
}

/**
 * Join an array of hard-coded SQL condition fragments with AND, then verify
 * that the resulting WHERE clause contains no disallowed string literals.
 *
 * Prefer this helper over `conditions.join(' AND ')` at every raw-query
 * call site so the security assertion is never accidentally skipped.
 */
export function joinWhereClauseWithSecurityInvariant(
  conditions: string[],
  allowedLiterals?: Iterable<string>
): string {
  const whereClause = conditions.join(" AND ");
  assertParameterizedWhereClause(whereClause, allowedLiterals);
  return whereClause;
}

/**
 * Assert that `column` is in the provided allow-list.
 * Use this before interpolating a sort column into a raw SQL ORDER BY clause.
 *
 * @throws if column is not in allowedColumns.
 */
export function assertValidSortColumn(
  column: string,
  allowedColumns: string[]
): void {
  if (!allowedColumns.includes(column)) {
    throw new Error(
      `SECURITY: Invalid sort column "${column}". Allowed: ${allowedColumns.join(", ")}`
    );
  }
}

/**
 * Assert that `direction` is either 'asc' or 'desc' (case-insensitive).
 * Use this before interpolating a sort direction into a raw SQL ORDER BY clause.
 *
 * @throws if direction is not 'asc' or 'desc'.
 */
export function assertValidSortDirection(direction: string): void {
  const normalized = direction.toLowerCase();
  if (normalized !== "asc" && normalized !== "desc") {
    throw new Error(
      `SECURITY: Invalid sort direction "${direction}". Must be "asc" or "desc"`
    );
  }
}

/**
 * Assert that `value` is in the provided allow-list.
 * Generic version of assertValidSortColumn for any enumerable string field.
 *
 * @throws if value is not in allowedValues.
 */
export function assertValidEnum(value: string, allowedValues: string[]): void {
  if (!allowedValues.includes(value)) {
    throw new Error(
      `SECURITY: Invalid enum value "${value}". Allowed: ${allowedValues.join(", ")}`
    );
  }
}
