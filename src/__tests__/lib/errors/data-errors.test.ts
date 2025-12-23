import {
    DataError,
    QueryError,
    ConnectionError,
    DataTransformError,
    isDataError,
    wrapDatabaseError,
} from '@/lib/errors';
import { logger } from '@/lib/logger';

// Mock the logger
jest.mock('@/lib/logger', () => ({
    logger: {
        sync: {
            error: jest.fn(),
            warn: jest.fn(),
        },
    },
}));

describe('DataError classes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('DataError', () => {
        it('creates error with code and message', () => {
            const error = new DataError('Test error', { code: 'TEST_CODE' });

            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST_CODE');
            expect(error.retryable).toBe(false);
            expect(error.name).toBe('DataError');
        });

        it('sets retryable flag when provided', () => {
            const error = new DataError('Test', { code: 'TEST', retryable: true });

            expect(error.retryable).toBe(true);
        });

        it('preserves cause error', () => {
            const cause = new Error('Original error');
            const error = new DataError('Wrapped', { code: 'TEST', cause });

            expect(error.cause).toBe(cause);
        });

        it('logs error with structured metadata', () => {
            const cause = new Error('Original');
            const error = new DataError('Test error', {
                code: 'TEST_CODE',
                retryable: true,
                cause,
            });

            error.log({ customField: 'value' });

            expect(logger.sync.error).toHaveBeenCalledWith('Test error', {
                errorCode: 'TEST_CODE',
                errorName: 'DataError',
                retryable: true,
                cause: 'Original',
                stack: expect.any(String),
                customField: 'value',
            });
        });

        it('logs without cause when not provided', () => {
            const error = new DataError('Test', { code: 'TEST' });

            error.log();

            expect(logger.sync.error).toHaveBeenCalledWith('Test', {
                errorCode: 'TEST',
                errorName: 'DataError',
                retryable: false,
                cause: undefined,
                stack: expect.any(String),
            });
        });
    });

    describe('QueryError', () => {
        it('creates retryable error with operation name', () => {
            const error = new QueryError('getListings');

            expect(error.code).toBe('QUERY_ERROR');
            expect(error.retryable).toBe(true);
            expect(error.name).toBe('QueryError');
            expect(error.message).toContain('getListings');
            expect(error.message).toContain('Database query failed');
        });

        it('preserves cause error', () => {
            const cause = new Error('SQL syntax error');
            const error = new QueryError('getListings', cause);

            expect(error.cause).toBe(cause);
        });
    });

    describe('ConnectionError', () => {
        it('creates retryable connection error', () => {
            const error = new ConnectionError();

            expect(error.code).toBe('CONNECTION_ERROR');
            expect(error.retryable).toBe(true);
            expect(error.name).toBe('ConnectionError');
            expect(error.message).toBe('Database connection failed');
        });

        it('preserves cause error', () => {
            const cause = new Error('ECONNREFUSED');
            const error = new ConnectionError(cause);

            expect(error.cause).toBe(cause);
        });
    });

    describe('DataTransformError', () => {
        it('creates non-retryable transform error', () => {
            const error = new DataTransformError('parseResponse');

            expect(error.code).toBe('TRANSFORM_ERROR');
            expect(error.retryable).toBe(false);
            expect(error.name).toBe('DataTransformError');
            expect(error.message).toContain('parseResponse');
        });
    });

    describe('isDataError', () => {
        it('returns true for DataError instances', () => {
            expect(isDataError(new DataError('test', { code: 'TEST' }))).toBe(true);
        });

        it('returns true for QueryError instances', () => {
            expect(isDataError(new QueryError('test'))).toBe(true);
        });

        it('returns true for ConnectionError instances', () => {
            expect(isDataError(new ConnectionError())).toBe(true);
        });

        it('returns true for DataTransformError instances', () => {
            expect(isDataError(new DataTransformError('test'))).toBe(true);
        });

        it('returns false for regular Error', () => {
            expect(isDataError(new Error('test'))).toBe(false);
        });

        it('returns false for null', () => {
            expect(isDataError(null)).toBe(false);
        });

        it('returns false for undefined', () => {
            expect(isDataError(undefined)).toBe(false);
        });

        it('returns false for strings', () => {
            expect(isDataError('error')).toBe(false);
        });
    });

    describe('wrapDatabaseError', () => {
        it('returns ConnectionError for connection-related messages', () => {
            const connectionErrors = [
                'Connection refused',
                'connection timeout',
                'ECONNREFUSED',
                'ECONNRESET',
                'ETIMEDOUT',
                'pool exhausted',
                'socket closed',
            ];

            for (const message of connectionErrors) {
                const error = new Error(message);
                const wrapped = wrapDatabaseError(error, 'testOp');

                expect(wrapped).toBeInstanceOf(ConnectionError);
                expect(wrapped.cause).toBe(error);
            }
        });

        it('returns QueryError for other database errors', () => {
            const error = new Error('Invalid SQL syntax');
            const wrapped = wrapDatabaseError(error, 'getListings');

            expect(wrapped).toBeInstanceOf(QueryError);
            expect(wrapped.cause).toBe(error);
            expect(wrapped.message).toContain('getListings');
        });

        it('returns existing DataError unchanged', () => {
            const original = new QueryError('test');
            const wrapped = wrapDatabaseError(original, 'other');

            expect(wrapped).toBe(original);
        });

        it('handles non-Error objects', () => {
            const wrapped = wrapDatabaseError('string error', 'testOp');

            expect(wrapped).toBeInstanceOf(QueryError);
            expect(wrapped.cause?.message).toBe('string error');
        });

        it('handles null/undefined gracefully', () => {
            const wrapped1 = wrapDatabaseError(null, 'testOp');
            const wrapped2 = wrapDatabaseError(undefined, 'testOp');

            expect(wrapped1).toBeInstanceOf(QueryError);
            expect(wrapped2).toBeInstanceOf(QueryError);
        });
    });
});
