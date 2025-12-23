/**
 * Typed error classes for data layer failures
 * Enables proper error discrimination, structured logging, and user-friendly handling
 */

import { logger } from '@/lib/logger';

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
        this.name = 'DataError';
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
            code: 'QUERY_ERROR',
            retryable: true,
            cause,
        });
        this.name = 'QueryError';
    }
}

/**
 * Database connection or timeout error
 */
export class ConnectionError extends DataError {
    constructor(cause?: Error) {
        super('Database connection failed', {
            code: 'CONNECTION_ERROR',
            retryable: true,
            cause,
        });
        this.name = 'ConnectionError';
    }
}

/**
 * Data validation or transformation error
 */
export class DataTransformError extends DataError {
    constructor(operation: string, cause?: Error) {
        super(`Data transformation failed: ${operation}`, {
            code: 'TRANSFORM_ERROR',
            retryable: false,
            cause,
        });
        this.name = 'DataTransformError';
    }
}

/**
 * Helper to check if an error is a known data error
 */
export function isDataError(error: unknown): error is DataError {
    return error instanceof DataError;
}

/**
 * Helper to wrap unknown errors into typed DataError instances
 * Detects connection-related errors and wraps appropriately
 */
export function wrapDatabaseError(error: unknown, operation: string): DataError {
    // If already a DataError, return as-is
    if (isDataError(error)) {
        return error;
    }

    const cause = error instanceof Error ? error : new Error(String(error));
    const message = cause.message.toLowerCase();

    // Detect connection-related errors
    if (
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('econnreset') ||
        message.includes('etimedout') ||
        message.includes('pool') ||
        message.includes('socket')
    ) {
        return new ConnectionError(cause);
    }

    // Default to QueryError for other database failures
    return new QueryError(operation, cause);
}
