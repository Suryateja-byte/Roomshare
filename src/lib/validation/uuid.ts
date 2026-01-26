/**
 * P2-04 FIX: UUID validation utility
 * Provides consistent UUID validation across all API routes
 * to prevent invalid ID injection and improve error handling.
 */

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// CUID regex pattern (used by Prisma default)
const CUID_REGEX = /^c[a-z0-9]{24,}$/i;

// CUID2 regex pattern (newer Prisma default)
const CUID2_REGEX = /^[a-z0-9]{24,}$/i;

/**
 * Validates that a string is a valid UUID v4
 */
export function isValidUUID(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id);
}

/**
 * Validates that a string is a valid CUID (Prisma default)
 */
export function isValidCUID(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return CUID_REGEX.test(id) || CUID2_REGEX.test(id);
}

/**
 * Validates that a string is a valid ID (UUID or CUID)
 * Use this for Prisma IDs which could be either format
 */
export function isValidId(id: string): boolean {
  return isValidUUID(id) || isValidCUID(id);
}

/**
 * Validates an ID and throws a standardized error if invalid
 * @throws Error with message "Invalid ID format"
 */
export function validateId(id: string, fieldName: string = 'id'): void {
  if (!isValidId(id)) {
    throw new ValidationError(`Invalid ${fieldName} format`);
  }
}

/**
 * Validates multiple IDs and throws if any are invalid
 */
export function validateIds(ids: string[], fieldName: string = 'ids'): void {
  for (const id of ids) {
    if (!isValidId(id)) {
      throw new ValidationError(`Invalid ${fieldName} format`);
    }
  }
}

/**
 * Custom validation error class for consistent error handling
 */
export class ValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Type guard to check if an error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}
