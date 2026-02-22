/**
 * Structured logging utility for production observability
 * Outputs JSON logs compatible with log aggregation services
 *
 * SECURITY: Implements automatic redaction of sensitive fields
 */

import * as requestContext from './request-context';
import { headers } from 'next/headers';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  service: string;
  environment: string;
  version?: string;
  route?: string;
  method?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Minimum log level based on environment
const MIN_LOG_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

// Fields to redact from logs (case-insensitive matching)
const REDACTED_FIELDS = new Set([
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'sessiontoken',
  'accesstoken',
  'refreshtoken',
  'bearer',
  'credential',
  'private_key',
  'privatekey',
  'ssn',
  'creditcard',
  'credit_card',
  'cardnumber',
  'cvv',
  'cvc',
]);

// Patterns to redact from string values
// P1-14 FIX: Added phone number and address patterns for comprehensive PII redaction
const REDACT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // JWT tokens
  { pattern: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi, replacement: '[REDACTED]' },
  // Email addresses
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, replacement: '[REDACTED]' },
  // Phone numbers - international format with country code (+1-555-123-4567)
  { pattern: /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, replacement: '[REDACTED_PHONE]' },
  // Phone numbers - US format with parentheses (555) 123-4567
  { pattern: /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/g, replacement: '[REDACTED_PHONE]' },
  // Phone numbers - US format with dashes or dots 555-123-4567 or 555.123.4567
  { pattern: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
  // Street addresses - matches "123 Main Street", "456 Oak Ave", etc.
  // Pattern: number + street name + common suffix (with optional apartment/unit)
  { pattern: /\b\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Court|Ct|Circle|Cir|Way|Place|Pl|Terrace|Ter|Trail|Trl|Parkway|Pkwy|Highway|Hwy|Alley|Aly)\.?(?:\s*,?\s*(?:Apt|Apartment|Suite|Ste|Unit|#|No\.?)\s*\w+)?\b/gi, replacement: '[REDACTED_ADDRESS]' },
];

/**
 * Redact sensitive information from log metadata
 */
function redactSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 10) return '[MAX_DEPTH]';

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    let result = obj;
    // P1-14 FIX: Use custom replacement strings for different PII types
    for (const { pattern, replacement } of REDACT_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (REDACTED_FIELDS.has(lowerKey)) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitive(value, depth + 1);
      }
    }
    return redacted;
  }

  return obj;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

/**
 * Get request ID from Next.js headers (works in server components and API routes)
 */
async function getRequestIdFromHeaders(): Promise<string | undefined> {
  try {
    const headersList = await headers();
    return headersList.get('x-request-id') || headersList.get('x-vercel-id') || undefined;
  } catch {
    // headers() throws outside of request context
    return undefined;
  }
}

function getContextSafely() {
  return typeof requestContext.getRequestContext === 'function'
    ? requestContext.getRequestContext()
    : undefined;
}

async function formatLogEntry(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): Promise<LogEntry> {
  const context = getContextSafely();
  const requestId = context?.requestId || await getRequestIdFromHeaders();

  // Redact sensitive data from metadata
  const safeMeta = meta ? redactSensitive(meta) as Record<string, unknown> : undefined;

  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    requestId,
    userId: context?.userId,
    service: 'roomshare',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    route: context?.path,
    method: context?.method,
    ...safeMeta,
  };
}

async function log(level: LogLevel, message: string, meta?: Record<string, unknown>): Promise<void> {
  if (!shouldLog(level)) return;

  const entry = await formatLogEntry(level, message, meta);

  // In production, output JSON for log aggregation
  // In development, use human-readable format
  if (process.env.NODE_ENV === 'production') {
    const output = JSON.stringify(entry);
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  } else {
    // Development: human-readable format
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    const contextInfo = entry.requestId ? ` [${entry.requestId.slice(0, 8)}]` : '';
    const userInfo = entry.userId ? ` [user:${entry.userId.slice(0, 8)}]` : '';

    // Redact meta for development output too
    const safeMeta = meta ? redactSensitive(meta) : undefined;

    switch (level) {
      case 'error':
        console.error(`${prefix}${contextInfo}${userInfo}`, message, safeMeta || '');
        break;
      case 'warn':
        console.warn(`${prefix}${contextInfo}${userInfo}`, message, safeMeta || '');
        break;
      case 'debug':
        console.debug(`${prefix}${contextInfo}${userInfo}`, message, safeMeta || '');
        break;
      default:
        console.log(`${prefix}${contextInfo}${userInfo}`, message, safeMeta || '');
    }
  }
}

/**
 * Synchronous log function for use in catch blocks where async is awkward
 * Uses cached request context only (no async header lookup)
 */
function logSync(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const context = getContextSafely();
  const safeMeta = meta ? redactSensitive(meta) as Record<string, unknown> : undefined;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    requestId: context?.requestId,
    userId: context?.userId,
    service: 'roomshare',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    route: context?.path,
    method: context?.method,
    ...safeMeta,
  };

  if (process.env.NODE_ENV === 'production') {
    const output = JSON.stringify(entry);
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  } else {
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    const contextInfo = entry.requestId ? ` [${entry.requestId.slice(0, 8)}]` : '';
    const userInfo = entry.userId ? ` [user:${entry.userId.slice(0, 8)}]` : '';

    switch (level) {
      case 'error':
        console.error(`${prefix}${contextInfo}${userInfo}`, message, safeMeta || '');
        break;
      case 'warn':
        console.warn(`${prefix}${contextInfo}${userInfo}`, message, safeMeta || '');
        break;
      case 'debug':
        console.debug(`${prefix}${contextInfo}${userInfo}`, message, safeMeta || '');
        break;
      default:
        console.log(`${prefix}${contextInfo}${userInfo}`, message, safeMeta || '');
    }
  }
}

/**
 * Structured logger with request context correlation
 *
 * Provides both async (default) and sync methods:
 * - Async methods (`logger.info`, etc.) include request ID from headers
 * - Sync methods (`logger.sync.info`, etc.) for catch blocks
 *
 * @example
 * ```ts
 * // Async (preferred - includes full request context)
 * await logger.info('User logged in', { userId: '123' });
 * await logger.error('Failed to send email', { error: err.message });
 *
 * // Sync (for catch blocks or non-async contexts)
 * logger.sync.error('Sync error log', { error: err.message });
 *
 * // Child logger with preset context
 * const routeLogger = logger.child({ route: '/api/users', method: 'POST' });
 * await routeLogger.info('Processing request');
 * ```
 */
export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),

  /**
   * Log with custom level
   */
  log: (level: LogLevel, message: string, meta?: Record<string, unknown>) =>
    log(level, message, meta),

  /**
   * Synchronous logging methods for catch blocks
   * Uses only cached request context (no async header lookup)
   */
  sync: {
    debug: (message: string, meta?: Record<string, unknown>) => logSync('debug', message, meta),
    info: (message: string, meta?: Record<string, unknown>) => logSync('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => logSync('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => logSync('error', message, meta),
  },

  /**
   * Create a child logger with preset metadata
   * Useful for adding context to all logs in a function
   */
  child: (defaultMeta: Record<string, unknown>) => ({
    debug: (message: string, meta?: Record<string, unknown>) =>
      log('debug', message, { ...defaultMeta, ...meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      log('info', message, { ...defaultMeta, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      log('warn', message, { ...defaultMeta, ...meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      log('error', message, { ...defaultMeta, ...meta }),
    sync: {
      debug: (message: string, meta?: Record<string, unknown>) =>
        logSync('debug', message, { ...defaultMeta, ...meta }),
      info: (message: string, meta?: Record<string, unknown>) =>
        logSync('info', message, { ...defaultMeta, ...meta }),
      warn: (message: string, meta?: Record<string, unknown>) =>
        logSync('warn', message, { ...defaultMeta, ...meta }),
      error: (message: string, meta?: Record<string, unknown>) =>
        logSync('error', message, { ...defaultMeta, ...meta }),
    },
  }),
};

/**
 * Sanitize error messages before logging or returning to clients.
 * Strips connection strings, file paths, SQL fragments, and PII.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return 'Unknown error';

  let errorName = 'Error';
  let rawMessage = 'Unknown error';

  if (error instanceof Error) {
    errorName = error.constructor.name || 'Error';
    rawMessage = error.message || 'Unknown error';
  } else if (typeof error === 'string') {
    rawMessage = error;
  } else {
    return 'Unknown error';
  }

  // Truncate to 200 chars
  let sanitized = rawMessage.length > 200
    ? rawMessage.slice(0, 200) + '...[truncated]'
    : rawMessage;

  // Strip connection strings
  sanitized = sanitized.replace(
    /(?:postgres|postgresql|mysql|mongodb|redis|amqp|https?):\/\/[^\s,;)}\]]+/gi,
    '[REDACTED_URL]'
  );

  // Strip file system paths
  sanitized = sanitized.replace(
    /(?:\/(?:usr|home|var|tmp|etc|app|src|node_modules)\/[^\s,;)}\]]+)|(?:[A-Z]:\\[^\s,;)}\]]+)/gi,
    '[REDACTED_PATH]'
  );

  // Strip SQL statements — redact from DML/DDL keyword to end of statement
  sanitized = sanitized.replace(
    /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b[^]*?(?=;|\s*$)/gi,
    '[SQL_REDACTED]'
  );

  // Run through existing REDACT_PATTERNS for PII
  for (const { pattern, replacement } of REDACT_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return errorName !== 'Error' ? `${errorName}: ${sanitized}` : sanitized;
}

/**
 * Export redaction utility for use in other modules
 */
export { redactSensitive };
