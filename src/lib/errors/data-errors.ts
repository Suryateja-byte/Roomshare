/**
 * Typed error classes for data layer failures
 * Enables proper error discrimination, structured logging, and user-friendly handling
 */

import { logger } from "@/lib/logger";

/**
 * Base error for all data layer failures
 */
export class DataError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly cause?: Error;

  constructor(
    message: string,
    options: {
      code: string;
      retryable?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = "DataError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Log the error with structured metadata
   */
  log(context?: Record<string, unknown>): void {
    logger.sync.error(this.message, {
      errorCode: this.code,
      errorName: this.name,
      retryable: this.retryable,
      cause: this.cause?.message,
      stack: this.stack,
      ...context,
    });
  }
}

/**
 * Database query execution failed
 */
export class QueryError extends DataError {
  constructor(operation: string, cause?: Error) {
    super(`Database query failed: ${operation}`, {
      code: "QUERY_ERROR",
      retryable: true,
      cause,
    });
    this.name = "QueryError";
  }
}

/**
 * Database schema does not match the code's expectations
 */
export class SchemaMismatchError extends DataError {
  constructor(operation: string, cause?: Error) {
    super(`Database schema mismatch: ${operation}`, {
      code: "SCHEMA_MISMATCH",
      retryable: false,
      cause,
    });
    this.name = "SchemaMismatchError";
  }
}

/**
 * Database connection or timeout error
 */
export class ConnectionError extends DataError {
  constructor(cause?: Error) {
    super("Database connection failed", {
      code: "CONNECTION_ERROR",
      retryable: true,
      cause,
    });
    this.name = "ConnectionError";
  }
}

/**
 * Data validation or transformation error
 */
export class DataTransformError extends DataError {
  constructor(operation: string, cause?: Error) {
    super(`Data transformation failed: ${operation}`, {
      code: "TRANSFORM_ERROR",
      retryable: false,
      cause,
    });
    this.name = "DataTransformError";
  }
}

/**
 * Helper to check if an error is a known data error
 */
export function isDataError(error: unknown): error is DataError {
  return error instanceof DataError;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return new Error(error.message);
  }

  return new Error(String(error));
}

function collectErrorDetails(
  value: unknown,
  details: string[],
  seen: Set<object>
): void {
  if (typeof value === "string" || typeof value === "number") {
    details.push(String(value));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (value instanceof Error) {
    details.push(value.name, value.message);
  }

  const record = value as Record<string, unknown>;
  const relevantKeys = [
    "code",
    "message",
    "detail",
    "hint",
    "meta",
    "cause",
    "table",
    "column",
    "reason",
  ];

  for (const key of relevantKeys) {
    collectErrorDetails(record[key], details, seen);
  }
}

function buildSearchableErrorText(error: unknown, cause: Error): string {
  const details: string[] = [];
  collectErrorDetails(error, details, new Set<object>());
  details.push(cause.message);
  return details.join(" ").toLowerCase();
}

function isSchemaMismatch(searchableText: string): boolean {
  if (
    searchableText.includes("42703") ||
    searchableText.includes("42p01") ||
    searchableText.includes("42704")
  ) {
    return true;
  }

  return (
    /column\b.*\bdoes not exist/.test(searchableText) ||
    /relation\b.*\bdoes not exist/.test(searchableText) ||
    /table\b.*\bdoes not exist/.test(searchableText) ||
    /type\b.*\bdoes not exist/.test(searchableText) ||
    /enum\b.*\bdoes not exist/.test(searchableText) ||
    searchableText.includes("undefined column") ||
    searchableText.includes("undefined table") ||
    searchableText.includes("undefined object") ||
    searchableText.includes("database schema is not in sync") ||
    searchableText.includes("schema drift")
  );
}

/**
 * Helper to wrap unknown errors into typed DataError instances
 * Detects connection-related errors and wraps appropriately
 */
export function wrapDatabaseError(
  error: unknown,
  operation: string
): DataError {
  // If already a DataError, return as-is
  if (isDataError(error)) {
    return error;
  }

  const cause = normalizeError(error);
  const searchableText = buildSearchableErrorText(error, cause);

  if (isSchemaMismatch(searchableText)) {
    return new SchemaMismatchError(operation, cause);
  }

  // Detect connection-related errors
  if (
    searchableText.includes("connection") ||
    searchableText.includes("timeout") ||
    searchableText.includes("econnrefused") ||
    searchableText.includes("econnreset") ||
    searchableText.includes("etimedout") ||
    searchableText.includes("pool") ||
    searchableText.includes("socket")
  ) {
    return new ConnectionError(cause);
  }

  // Default to QueryError for other database failures
  return new QueryError(operation, cause);
}
